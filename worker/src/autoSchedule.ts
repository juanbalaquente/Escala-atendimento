import type { CleanShiftRow, CollaboratorCandidate } from "./types";
import { NotFoundError, ValidationError, dayOfWeekIso, parseIsoDate, stableMod } from "./utils";

interface EventRow {
  id: number;
  event_date: string;
}

interface TeamRow {
  id: number;
  code: string;
}

interface ActiveCollaboratorRow {
  id: number;
  name: string;
  team_id: number;
  gender: string | null;
  weekday_shift_end: string | null;
  rotation_group: string | null;
}

type IdMap = Record<number, true>;

function isoDateAddDays(dateRaw: string, days: number): string {
  const date = parseIsoDate(dateRaw);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mergeBlockedIds(a: IdMap, b: IdMap): IdMap {
  const merged: IdMap = {};
  for (const [idRaw, blocked] of Object.entries(a)) {
    if (blocked) {
      merged[Number.parseInt(idRaw, 10)] = true;
    }
  }
  for (const [idRaw, blocked] of Object.entries(b)) {
    if (blocked) {
      merged[Number.parseInt(idRaw, 10)] = true;
    }
  }
  return merged;
}

function countAvailableCandidates(candidates: CollaboratorCandidate[], blockedIds: IdMap): number {
  let count = 0;
  for (const candidate of candidates) {
    if (candidate.id > 0 && !blockedIds[candidate.id]) {
      count += 1;
    }
  }
  return count;
}

function resolveRotationGroup(id: number, name: string, rawGroup: string | null): "A" | "B" {
  const normalized = (rawGroup ?? "").trim().toUpperCase();
  if (normalized === "A" || normalized === "B") {
    return normalized;
  }

  const firstLetter = name.trim().slice(0, 1).toUpperCase();
  if ("ABCDEFGHIJKLM".includes(firstLetter)) {
    return "A";
  }
  if ("NOPQRSTUVWXYZ".includes(firstLetter)) {
    return "B";
  }
  return id % 2 === 0 ? "A" : "B";
}

async function loadUsageStats(db: D1Database, eventDate: string): Promise<Record<number, number>> {
  const result = await db
    .prepare(
      `SELECT s.collaborator_id, COUNT(*) AS shifts_count
       FROM shifts s
       INNER JOIN events e ON e.id = s.event_id
       WHERE e.event_date < ?
       GROUP BY s.collaborator_id`,
    )
    .bind(eventDate)
    .all<{ collaborator_id: number; shifts_count: number }>();

  const usage: Record<number, number> = {};
  for (const row of result.results ?? []) {
    usage[Number(row.collaborator_id)] = Number(row.shifts_count);
  }
  return usage;
}

async function loadSundayUsageStats(db: D1Database, eventDate: string): Promise<Record<number, number>> {
  const result = await db
    .prepare(
      `SELECT s.collaborator_id, COUNT(*) AS sunday_count
       FROM shifts s
       INNER JOIN events e ON e.id = s.event_id
       WHERE e.event_date < ?
         AND strftime('%w', e.event_date) = '0'
       GROUP BY s.collaborator_id`,
    )
    .bind(eventDate)
    .all<{ collaborator_id: number; sunday_count: number }>();

  const usage: Record<number, number> = {};
  for (const row of result.results ?? []) {
    usage[Number(row.collaborator_id)] = Number(row.sunday_count);
  }
  return usage;
}

async function pickRotatingAnalyst(
  db: D1Database,
  analysts: CollaboratorCandidate[],
  eventDate: string,
  analystTeamId: number,
  blockedIds: IdMap,
): Promise<CollaboratorCandidate> {
  const eligible = analysts
    .slice()
    .sort((a, b) => a.id - b.id)
    .filter((item) => !blockedIds[item.id]);

  if (eligible.length === 0) {
    throw new ValidationError("Nao ha analista elegivel para este sabado devido ao rodizio com domingo.");
  }

  const last = await db
    .prepare(
      `SELECT s.collaborator_id
       FROM shifts s
       INNER JOIN events e ON e.id = s.event_id
       WHERE e.event_date < ?
         AND strftime('%w', e.event_date) = '6'
         AND s.team_id = ?
         AND s.shift_start = '09:00:00'
         AND s.shift_end = '18:00:00'
       ORDER BY e.event_date DESC, s.id DESC
       LIMIT 1`,
    )
    .bind(eventDate, analystTeamId)
    .first<{ collaborator_id: number }>();

  if (!last) {
    return eligible[0];
  }

  const lastId = Number(last.collaborator_id);
  const currentIndex = eligible.findIndex((item) => item.id === lastId);
  if (currentIndex === -1) {
    return eligible[0];
  }

  return eligible[(currentIndex + 1) % eligible.length];
}

async function loadBlockedSundayMorningIds(db: D1Database, eventDate: string, initialBlocked: IdMap): Promise<IdMap> {
  const saturdayDate = isoDateAddDays(eventDate, -1);
  const result = await db
    .prepare(
      `SELECT DISTINCT s.collaborator_id
       FROM shifts s
       INNER JOIN events e ON e.id = s.event_id
       WHERE e.event_date = ?
         AND s.shift_start = '15:40:00'
         AND s.shift_end = '22:00:00'`,
    )
    .bind(saturdayDate)
    .all<{ collaborator_id: number }>();

  const blocked: IdMap = { ...initialBlocked };
  for (const row of result.results ?? []) {
    blocked[Number(row.collaborator_id)] = true;
  }
  return blocked;
}

async function loadBlockedAdjacentWeekendIds(db: D1Database, eventDate: string, weekday: number): Promise<IdMap> {
  if (weekday === 6) {
    const sundayAfter = isoDateAddDays(eventDate, 1);
    const sundayBefore = isoDateAddDays(eventDate, -6);
    const result = await db
      .prepare(
        `SELECT DISTINCT s.collaborator_id
         FROM shifts s
         INNER JOIN events e ON e.id = s.event_id
         WHERE e.event_date IN (?, ?)`,
      )
      .bind(sundayAfter, sundayBefore)
      .all<{ collaborator_id: number }>();

    const blocked: IdMap = {};
    for (const row of result.results ?? []) {
      blocked[Number(row.collaborator_id)] = true;
    }
    return blocked;
  }

  const adjacentDate = isoDateAddDays(eventDate, -1);
  const result = await db
    .prepare(
      `SELECT DISTINCT s.collaborator_id
       FROM shifts s
       INNER JOIN events e ON e.id = s.event_id
       WHERE e.event_date = ?`,
    )
    .bind(adjacentDate)
    .all<{ collaborator_id: number }>();

  const blocked: IdMap = {};
  for (const row of result.results ?? []) {
    blocked[Number(row.collaborator_id)] = true;
  }
  return blocked;
}

async function loadBlockedSundayIds(db: D1Database, eventDate: string, initialBlocked: IdMap): Promise<IdMap> {
  const saturdayDate = isoDateAddDays(eventDate, -1);
  const result = await db
    .prepare(
      `SELECT DISTINCT s.collaborator_id
       FROM shifts s
       INNER JOIN events e ON e.id = s.event_id
       WHERE e.event_date = ?`,
    )
    .bind(saturdayDate)
    .all<{ collaborator_id: number }>();

  const blocked: IdMap = { ...initialBlocked };
  for (const row of result.results ?? []) {
    blocked[Number(row.collaborator_id)] = true;
  }
  return blocked;
}

async function loadSundayGroupHistory(
  db: D1Database,
  eventDate: string,
): Promise<Array<{ date: string; group: "A" | "B" }>> {
  const result = await db
    .prepare(
      `SELECT e.event_date, c.rotation_group, c.id, c.name
       FROM shifts s
       INNER JOIN events e ON e.id = s.event_id
       INNER JOIN collaborators c ON c.id = s.collaborator_id
       INNER JOIN teams t ON t.id = s.team_id
       WHERE e.event_date < ?
         AND strftime('%w', e.event_date) = '0'
         AND t.code = 'SUPORTE_N1'
       ORDER BY e.event_date DESC, s.id ASC`,
    )
    .bind(eventDate)
    .all<{ event_date: string; rotation_group: string | null; id: number; name: string }>();

  const grouped: Record<string, Record<"A" | "B", number>> = {};

  for (const row of result.results ?? []) {
    const date = String(row.event_date);
    const group = resolveRotationGroup(Number(row.id), String(row.name), row.rotation_group);
    if (!grouped[date]) {
      grouped[date] = { A: 0, B: 0 };
    }
    grouped[date][group] += 1;
  }

  const history = Object.entries(grouped).map(([date, counts]) => ({
    date,
    group: counts.A >= counts.B ? ("A" as const) : ("B" as const),
  }));

  history.sort((a, b) => b.date.localeCompare(a.date));
  return history;
}

async function loadSundayGroupUsageStats(
  db: D1Database,
  eventDate: string,
  n1Pool: CollaboratorCandidate[],
): Promise<Record<"A" | "B", number>> {
  const usage = await loadSundayUsageStats(db, eventDate);
  const groupUsage: Record<"A" | "B", number> = { A: 0, B: 0 };

  for (const person of n1Pool) {
    groupUsage[person.rotation_group] += usage[person.id] ?? 0;
  }
  return groupUsage;
}

async function resolveActiveSundayGroup(
  db: D1Database,
  eventDate: string,
  n1Pool: CollaboratorCandidate[],
): Promise<"A" | "B"> {
  const history = await loadSundayGroupHistory(db, eventDate);

  if (history.length === 0) {
    const groupCounts = await loadSundayGroupUsageStats(db, eventDate, n1Pool);
    if (groupCounts.A === groupCounts.B) {
      return stableMod(`${eventDate}|group`, 2) === 0 ? "A" : "B";
    }
    return groupCounts.A <= groupCounts.B ? "A" : "B";
  }

  const lastGroup = history[0].group;
  let consecutive = 0;
  for (const item of history) {
    if (item.group !== lastGroup) {
      break;
    }
    consecutive += 1;
  }

  if (consecutive >= 3) {
    return lastGroup === "A" ? "B" : "A";
  }

  return lastGroup;
}

function reserveNonFemaleForNightSlots(
  candidates: CollaboratorCandidate[],
  blockedIds: IdMap,
  usage: Record<number, number>,
  requiredBeforeNight: number,
  nightSlotsCount: number,
): IdMap {
  const eligibleNightCandidates = candidates
    .filter((candidate) => candidate.id > 0 && !blockedIds[candidate.id] && candidate.gender !== "F")
    .sort((a, b) => {
      const aScore = (usage[a.id] ?? 0) * 100 + a.id;
      const bScore = (usage[b.id] ?? 0) * 100 + b.id;
      return aScore - bScore;
    });

  if (eligibleNightCandidates.length === 0 || nightSlotsCount <= 0) {
    return {};
  }

  const reserved: IdMap = {};

  for (const candidate of eligibleNightCandidates) {
    if (Object.keys(reserved).length >= nightSlotsCount) {
      break;
    }

    reserved[candidate.id] = true;
    const availableAfterReserve = countAvailableCandidates(candidates, mergeBlockedIds(blockedIds, reserved));
    if (availableAfterReserve < requiredBeforeNight) {
      delete reserved[candidate.id];
      break;
    }
  }

  return reserved;
}

async function predictReservedIdsForSunday(
  db: D1Database,
  saturdayDate: string,
  n1Pool: CollaboratorCandidate[],
  usage: Record<number, number>,
  alreadyBlocked: IdMap,
  requiredSaturdaySlots: number,
): Promise<IdMap> {
  const sundayDate = isoDateAddDays(saturdayDate, 1);
  const activeGroup = await resolveActiveSundayGroup(db, sundayDate, n1Pool);
  const groupPool = n1Pool.filter((person) => person.rotation_group === activeGroup);

  if (groupPool.length <= 2) {
    const reserved: IdMap = {};
    for (const person of groupPool) {
      reserved[person.id] = true;
    }
    return reserved;
  }

  const sorted = groupPool.slice().sort((a, b) => {
    const aScore = (usage[a.id] ?? 0) * 100 + a.id;
    const bScore = (usage[b.id] ?? 0) * 100 + b.id;
    return aScore - bScore;
  });

  const reserved: IdMap = {};
  const maxReserve = 2;

  if (sorted.length > 0) {
    const baseScore = (usage[sorted[0].id] ?? 0) * 100 + sorted[0].id;
    const window = sorted.filter((person) => {
      const score = (usage[person.id] ?? 0) * 100 + person.id;
      return score <= baseScore + 15;
    });

    if (window.length >= maxReserve) {
      const shuffled = window.slice().sort((a, b) => {
        const aScore = stableMod(`${saturdayDate}|reserve|${a.id}`, 10_000);
        const bScore = stableMod(`${saturdayDate}|reserve|${b.id}`, 10_000);
        return aScore - bScore;
      });
      for (const person of shuffled.slice(0, maxReserve)) {
        reserved[person.id] = true;
      }
    } else {
      for (const person of sorted) {
        if (Object.keys(reserved).length >= maxReserve) {
          break;
        }
        reserved[person.id] = true;
      }
    }
  }

  let availableForSaturday = 0;
  for (const person of n1Pool) {
    if (!alreadyBlocked[person.id] && !reserved[person.id]) {
      availableForSaturday += 1;
    }
  }

  if (availableForSaturday < requiredSaturdaySlots) {
    return {};
  }

  return reserved;
}

function pickN1ForSlot(
  candidates: CollaboratorCandidate[],
  usedIds: IdMap,
  blockedIds: IdMap,
  usage: Record<number, number>,
  slotKind: "early" | "late" | "last",
  slotStart: string,
  sundayUsage: Record<number, number>,
  eventDate: string,
  slotIndex: number,
): CollaboratorCandidate {
  const scored: Array<{ candidate: CollaboratorCandidate; score: number }> = [];
  let eligibleNonFemale = 0;

  for (const candidate of candidates) {
    if (usedIds[candidate.id] || blockedIds[candidate.id]) {
      continue;
    }

    const weekdayEnd = candidate.weekday_shift_end ?? "";
    if (weekdayEnd !== "" && weekdayEnd >= "22:00:00" && slotStart < "09:20:00") {
      continue;
    }

    let score = (usage[candidate.id] ?? 0) * 100;
    if (candidate.gender !== "F") {
      eligibleNonFemale += 1;
    }

    if (slotKind === "early" && candidate.gender === "F") {
      score -= 25;
    } else if (slotKind === "late" && candidate.gender === "F") {
      score += 50;
    } else if (slotKind === "last" && candidate.gender === "F") {
      score += 500;
    }

    score += (sundayUsage[candidate.id] ?? 0) * 40;
    score += stableMod(`${eventDate}|${slotKind}|${slotStart}|${slotIndex}|${candidate.id}`, 61);

    scored.push({ candidate, score });
  }

  if (scored.length === 0) {
    if (slotKind === "early" && Object.keys(blockedIds).length > 0) {
      throw new ValidationError(
        "Nao ha colaborador elegivel para este turno por causa das restricoes de sabado/domingo ou expediente semanal.",
      );
    }
    throw new ValidationError("Nao foi possivel completar a escala automatica com os colaboradores ativos.");
  }

  const filtered =
    (slotKind === "late" || slotKind === "last") && eligibleNonFemale > 0
      ? scored.filter((item) => item.candidate.gender !== "F")
      : scored;

  filtered.sort((a, b) => a.score - b.score);
  const bestScore = filtered[0].score;

  let window = filtered.filter((item) => item.score <= bestScore + 45);
  if (window.length < 2) {
    window = filtered.slice(0, Math.min(3, filtered.length));
  }

  const index =
    window.length <= 1 ? 0 : stableMod(`${eventDate}|pick|${slotKind}|${slotStart}|${slotIndex}`, window.length);
  return window[index].candidate;
}

export async function generateAutoSchedule(db: D1Database, eventId: number): Promise<{ created: number; message: string }> {
  const event = await db
    .prepare("SELECT id, event_date FROM events WHERE id = ?")
    .bind(eventId)
    .first<EventRow>();

  if (!event) {
    throw new NotFoundError("Evento nao encontrado.");
  }

  const eventDate = String(event.event_date);
  const weekday = dayOfWeekIso(parseIsoDate(eventDate));
  if (weekday !== 6 && weekday !== 7) {
    throw new ValidationError("Geracao automatica disponivel apenas para sabado e domingo.");
  }

  const teamRows = await db
    .prepare("SELECT id, code FROM teams WHERE code IN ('ANALISTA', 'SUPORTE_N1')")
    .all<TeamRow>();

  const teamByCode: Record<string, number> = {};
  for (const row of teamRows.results ?? []) {
    teamByCode[String(row.code)] = Number(row.id);
  }

  if (!teamByCode.ANALISTA || !teamByCode.SUPORTE_N1) {
    throw new ValidationError("Equipes ANALISTA e SUPORTE_N1 sao obrigatorias.");
  }

  const activeRows = await db
    .prepare(
      `SELECT id, name, team_id, gender, weekday_shift_end, rotation_group
       FROM collaborators
       WHERE is_active = 1
         AND team_id IN (?, ?)
       ORDER BY id`,
    )
    .bind(teamByCode.ANALISTA, teamByCode.SUPORTE_N1)
    .all<ActiveCollaboratorRow>();

  const analysts: CollaboratorCandidate[] = [];
  const n1: CollaboratorCandidate[] = [];

  for (const person of activeRows.results ?? []) {
    const entry: CollaboratorCandidate = {
      id: Number(person.id),
      name: String(person.name),
      gender: (["F", "M", "N"].includes(String(person.gender ?? "N").toUpperCase())
        ? String(person.gender ?? "N").toUpperCase()
        : "N") as "F" | "M" | "N",
      weekday_shift_end: person.weekday_shift_end ? String(person.weekday_shift_end) : null,
      rotation_group: resolveRotationGroup(
        Number(person.id),
        String(person.name),
        person.rotation_group ? String(person.rotation_group) : null,
      ),
    };

    if (Number(person.team_id) === teamByCode.ANALISTA) {
      analysts.push(entry);
    } else if (Number(person.team_id) === teamByCode.SUPORTE_N1) {
      n1.push(entry);
    }
  }

  if (weekday === 6 && analysts.length < 1) {
    throw new ValidationError("Nao ha analistas ativos para escalar no sabado.");
  }

  const requiredN1 = weekday === 6 ? 5 : 2;
  if (n1.length < requiredN1) {
    throw new ValidationError(`Necessario ao menos ${requiredN1} colaboradores ativos de SUPORTE_N1.`);
  }

  const usage = await loadUsageStats(db, eventDate);
  const blockedByAdjacentEvent = await loadBlockedAdjacentWeekendIds(db, eventDate, weekday);
  const usedIds: IdMap = {};
  const rows: CleanShiftRow[] = [];

  if (weekday === 6) {
    const reservedForSunday = await predictReservedIdsForSunday(
      db,
      eventDate,
      n1,
      usage,
      blockedByAdjacentEvent,
      5,
    );
    const blockedSaturday = mergeBlockedIds(blockedByAdjacentEvent, reservedForSunday);
    const eligibleSaturdayCount = countAvailableCandidates(n1, blockedSaturday);
    if (eligibleSaturdayCount < 5) {
      throw new ValidationError(
        "Escala de sabado inviavel com as regras atuais: necessario 5 N1 elegiveis, " +
          `mas ha ${eligibleSaturdayCount}. A regra 'quem trabalha domingo nao trabalha sabado' bloqueou parte do time.`,
      );
    }

    const reservedForNight = reserveNonFemaleForNightSlots(n1, blockedSaturday, usage, 3, 2);
    const analyst = await pickRotatingAnalyst(db, analysts, eventDate, teamByCode.ANALISTA, blockedByAdjacentEvent);

    rows.push({
      team_id: teamByCode.ANALISTA,
      collaborator_id: analyst.id,
      shift_start: "09:00:00",
      shift_end: "18:00:00",
      break_10_1: "10:40:00",
      break_20: "13:00:00",
      break_10_2: "16:00:00",
    });

    const slots: Array<
      CleanShiftRow & {
        kind: "early" | "late" | "last";
        allow_start_0920_fallback?: boolean;
        fallback_shift_start?: string;
        fallback_break_10_1?: string;
        fallback_break_20?: string;
        fallback_break_10_2?: string;
      }
    > = [
      {
        team_id: teamByCode.SUPORTE_N1,
        collaborator_id: 0,
        shift_start: "08:00:00",
        shift_end: "14:20:00",
        break_10_1: "09:20:00",
        break_20: "11:10:00",
        break_10_2: "12:40:00",
        kind: "early",
      },
      {
        team_id: teamByCode.SUPORTE_N1,
        collaborator_id: 0,
        shift_start: "08:00:00",
        shift_end: "14:20:00",
        break_10_1: "09:40:00",
        break_20: "11:30:00",
        break_10_2: "12:50:00",
        kind: "early",
      },
      {
        team_id: teamByCode.SUPORTE_N1,
        collaborator_id: 0,
        shift_start: "09:00:00",
        shift_end: "15:40:00",
        break_10_1: "10:20:00",
        break_20: "12:10:00",
        break_10_2: "14:20:00",
        kind: "early",
        allow_start_0920_fallback: true,
        fallback_shift_start: "09:20:00",
        fallback_break_10_1: "10:40:00",
        fallback_break_20: "12:10:00",
        fallback_break_10_2: "14:30:00",
      },
      {
        team_id: teamByCode.SUPORTE_N1,
        collaborator_id: 0,
        shift_start: "15:40:00",
        shift_end: "22:00:00",
        break_10_1: "16:40:00",
        break_20: "18:30:00",
        break_10_2: "20:20:00",
        kind: "last",
      },
      {
        team_id: teamByCode.SUPORTE_N1,
        collaborator_id: 0,
        shift_start: "14:20:00",
        shift_end: "20:40:00",
        break_10_1: "15:40:00",
        break_20: "17:30:00",
        break_10_2: "19:20:00",
        kind: "late",
      },
    ];

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      let slotStartForRule = slot.shift_start;
      let shiftStartToSave = slot.shift_start;
      let break101ToSave = slot.break_10_1;
      let break20ToSave = slot.break_20;
      let break102ToSave = slot.break_10_2;

      let blockedForThisSlot = blockedSaturday;
      if (!["late", "last"].includes(slot.kind) && Object.keys(reservedForNight).length > 0) {
        blockedForThisSlot = mergeBlockedIds(blockedForThisSlot, reservedForNight);
      }

      const pickWithFallbackScenarios = (startForRule: string): CollaboratorCandidate => {
        const blockedScenarios: IdMap[] = [blockedForThisSlot, blockedSaturday, {}];
        let lastError: unknown = null;

        for (const blockedCandidate of blockedScenarios) {
          try {
            return pickN1ForSlot(
              n1,
              usedIds,
              blockedCandidate,
              usage,
              slot.kind,
              startForRule,
              {},
              eventDate,
              slotIndex,
            );
          } catch (error) {
            lastError = error;
          }
        }

        if (lastError) {
          throw lastError;
        }
        throw new ValidationError("Nao foi possivel completar a escala automatica com os colaboradores ativos.");
      };

      let person: CollaboratorCandidate;
      try {
        person = pickWithFallbackScenarios(slotStartForRule);
      } catch (err) {
        if (!slot.allow_start_0920_fallback) {
          throw err;
        }

        slotStartForRule = slot.fallback_shift_start ?? "09:20:00";
        shiftStartToSave = slotStartForRule;
        break101ToSave = slot.fallback_break_10_1 ?? break101ToSave;
        break20ToSave = slot.fallback_break_20 ?? break20ToSave;
        break102ToSave = slot.fallback_break_10_2 ?? break102ToSave;

        person = pickWithFallbackScenarios(slotStartForRule);
      }

      usedIds[person.id] = true;
      rows.push({
        team_id: teamByCode.SUPORTE_N1,
        collaborator_id: person.id,
        shift_start: shiftStartToSave,
        shift_end: slot.shift_end,
        break_10_1: break101ToSave,
        break_20: break20ToSave,
        break_10_2: break102ToSave,
      });
    }
  } else {
    const activeSundayGroup = await resolveActiveSundayGroup(db, eventDate, n1);
    let sundayPool = n1.filter((person) => person.rotation_group === activeSundayGroup);
    if (sundayPool.length < 2) {
      sundayPool = n1;
    }

    const blockedSunday = await loadBlockedSundayIds(db, eventDate, blockedByAdjacentEvent);
    const blockedMorning = await loadBlockedSundayMorningIds(db, eventDate, blockedSunday);
    const sundayUsage = await loadSundayUsageStats(db, eventDate);

    let morning: CollaboratorCandidate;
    try {
      morning = pickN1ForSlot(n1PoolOrFallback(sundayPool, n1), usedIds, blockedMorning, usage, "early", "08:00:00", sundayUsage, eventDate, 0);
    } catch {
      try {
        morning = pickN1ForSlot(
          n1PoolOrFallback(sundayPool, n1),
          usedIds,
          blockedSunday,
          usage,
          "early",
          "08:00:00",
          sundayUsage,
          eventDate,
          0,
        );
      } catch {
        morning = pickN1ForSlot(n1, usedIds, {}, usage, "early", "08:00:00", sundayUsage, eventDate, 0);
      }
    }

    usedIds[morning.id] = true;
    rows.push({
      team_id: teamByCode.SUPORTE_N1,
      collaborator_id: morning.id,
      shift_start: "08:00:00",
      shift_end: "14:20:00",
      break_10_1: "09:20:00",
      break_20: "11:10:00",
      break_10_2: "12:40:00",
    });

    let afternoon: CollaboratorCandidate;
    try {
      afternoon = pickN1ForSlot(
        n1PoolOrFallback(sundayPool, n1),
        usedIds,
        blockedSunday,
        usage,
        "last",
        "10:40:00",
        sundayUsage,
        eventDate,
        1,
      );
    } catch {
      afternoon = pickN1ForSlot(n1, usedIds, {}, usage, "last", "10:40:00", sundayUsage, eventDate, 1);
    }

    rows.push({
      team_id: teamByCode.SUPORTE_N1,
      collaborator_id: afternoon.id,
      shift_start: "10:40:00",
      shift_end: "17:00:00",
      break_10_1: "12:00:00",
      break_20: "13:50:00",
      break_10_2: "15:40:00",
    });
  }

  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM shifts WHERE event_id = ?").bind(eventId),
  ];

  for (const row of rows) {
    statements.push(
      db
        .prepare(
          `INSERT INTO shifts (
            event_id, team_id, collaborator_id, shift_start, shift_end, break_10_1, break_20, break_10_2
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          eventId,
          row.team_id,
          row.collaborator_id,
          row.shift_start,
          row.shift_end,
          row.break_10_1,
          row.break_20,
          row.break_10_2,
        ),
    );
  }

  await db.batch(statements);

  return {
    created: rows.length,
    message: "Escala automatica gerada com sucesso.",
  };
}

function n1PoolOrFallback(pool: CollaboratorCandidate[], fallback: CollaboratorCandidate[]): CollaboratorCandidate[] {
  return pool.length > 0 ? pool : fallback;
}
