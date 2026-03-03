import { generateAutoSchedule } from "./autoSchedule";
import type { Env, ShiftRowInput } from "./types";
import {
  NotFoundError,
  ValidationError,
  dayOfWeekIso,
  jsonError,
  jsonNoContent,
  jsonOk,
  normalizeTime,
  pad2,
  parseIsoDate,
  readJson,
  toInt,
  withJsonErrorHandling,
} from "./utils";
import { validateShiftRows } from "./validation";

const DEFAULT_API_VERSION = "0.1.0";
// =========================
// CORS (Pages.dev -> Workers.dev)
// =========================
function isAllowedOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);

    // Pages deployments (prod e previews)
    if (u.protocol === "https:" && u.hostname.endsWith(".pages.dev")) return true;

    // Dev local
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;

    return false;
  } catch {
    return false;
  }
}

function getAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin");
  if (!origin) return null;
  return isAllowedOrigin(origin) ? origin : null;
}

function applyCors(req: Request, res: Response): Response {
  const origin = getAllowedOrigin(req);
  const headers = new Headers(res.headers);

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    headers.set("Access-Control-Max-Age", "86400");
  } else {
    headers.set("Vary", "Origin");
  }

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function corsPreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;

  const origin = getAllowedOrigin(req);
  const headers = new Headers();
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    headers.set("Access-Control-Max-Age", "86400");
  } else {
    headers.set("Vary", "Origin");
  }

  return new Response(null, { status: 204, headers });
}
// =========================

interface CollaboratorInputPayload {
  name?: string;
  team_id?: number | string;
  is_active?: number | boolean | string;
  gender?: string;
  weekday_shift_end?: string | null;
  rotation_group?: string | null;
}

interface EventInputPayload {
  type?: string;
  event_date?: string;
  label?: string;
}

function parseEventId(pathname: string, suffix = ""): number | null {
  const pattern = suffix
    ? new RegExp(`^/api/events/(\\d+)/${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
    : /^\/api\/events\/(\d+)$/;
  const match = pathname.match(pattern);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

function parseCollaboratorId(pathname: string): number | null {
  const match = pathname.match(/^\/api\/collaborators\/(\d+)$/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

function parseIsActive(value: unknown): number {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number") {
    return value === 1 ? 1 : 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "on") {
      return 1;
    }
  }
  return 0;
}

function normalizeCollaboratorPayload(body: CollaboratorInputPayload): {
  name: string;
  team_id: number;
  is_active: number;
  gender: "F" | "M" | "N";
  weekday_shift_end: string | null;
  rotation_group: "A" | "B" | null;
} {
  const name = String(body.name ?? "").trim();
  const teamId = toInt(body.team_id);
  const isActive = parseIsActive(body.is_active);
  const genderRaw = String(body.gender ?? "N").trim().toUpperCase();
  const weekdayShiftEndRaw = body.weekday_shift_end == null ? "" : String(body.weekday_shift_end).trim();
  const rotationRaw = body.rotation_group == null ? "" : String(body.rotation_group).trim().toUpperCase();

  if (!name) {
    throw new ValidationError("Nome e obrigatorio.");
  }
  if (teamId <= 0) {
    throw new ValidationError("Equipe invalida.");
  }

  const gender = (["F", "M", "N"].includes(genderRaw) ? genderRaw : "N") as "F" | "M" | "N";
  const weekdayShiftEnd =
    weekdayShiftEndRaw === ""
      ? null
      : normalizeTime(weekdayShiftEndRaw.length === 5 ? `${weekdayShiftEndRaw}:00` : weekdayShiftEndRaw);
  if (weekdayShiftEndRaw !== "" && !weekdayShiftEnd) {
    throw new ValidationError("Horario de fim semanal invalido. Use HH:MM.");
  }
  const rotationGroup = (rotationRaw === "A" || rotationRaw === "B" ? rotationRaw : null) as "A" | "B" | null;

  return {
    name,
    team_id: teamId,
    is_active: isActive,
    gender,
    weekday_shift_end: weekdayShiftEnd,
    rotation_group: rotationGroup,
  };
}

function normalizeEventPayload(body: EventInputPayload): { type: "FDS" | "FERIADO"; event_date: string; label: string } {
  const typeRaw = String(body.type ?? "").trim().toUpperCase();
  const eventDateRaw = String(body.event_date ?? "").trim();
  const label = String(body.label ?? "").trim();

  if (typeRaw !== "FDS" && typeRaw !== "FERIADO") {
    throw new ValidationError("Tipo invalido. Use FDS ou FERIADO.");
  }
  parseIsoDate(eventDateRaw);
  if (!label) {
    throw new ValidationError("Label e obrigatoria.");
  }

  return {
    type: typeRaw,
    event_date: eventDateRaw,
    label,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

async function assertTeamExists(db: D1Database, teamId: number): Promise<void> {
  const found = await db.prepare("SELECT id FROM teams WHERE id = ?").bind(teamId).first<{ id: number }>();
  if (!found) {
    throw new ValidationError("Equipe informada nao existe.");
  }
}

async function assertEventExists(db: D1Database, eventId: number): Promise<void> {
  const found = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first<{ id: number }>();
  if (!found) {
    throw new NotFoundError("Evento nao encontrado.");
  }
}

async function getGroupedActiveCollaborators(db: D1Database): Promise<Record<number, Array<{ id: number; name: string }>>> {
  const activeRows = await db
    .prepare(
      `SELECT id, name, team_id
       FROM collaborators
       WHERE is_active = 1
       ORDER BY name ASC`,
    )
    .all<{ id: number; name: string; team_id: number }>();

  const grouped: Record<number, Array<{ id: number; name: string }>> = {};
  for (const row of activeRows.results ?? []) {
    const teamId = Number(row.team_id);
    if (!grouped[teamId]) {
      grouped[teamId] = [];
    }
    grouped[teamId].push({
      id: Number(row.id),
      name: String(row.name),
    });
  }

  return grouped;
}

async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  // Preflight CORS (OPTIONS)
  const preflight = corsPreflight(request);
  if (preflight) {
    return preflight;
  }

  const url = new URL(request.url);
  const { pathname } = url;

  if (!pathname.startsWith("/api")) {
    return applyCors(request, jsonError(404, "Rota nao encontrada."));
  }

  // Se alguém mandar OPTIONS fora do preflight (redundância segura)
  if (request.method === "OPTIONS") {
    return corsPreflight(request) ?? applyCors(request, jsonNoContent());
  }

  if (pathname === "/api/health" && request.method === "GET") {
    return applyCors(
      request,
      jsonOk({
        ts: new Date().toISOString(),
        version: env.APP_VERSION ?? DEFAULT_API_VERSION,
      }),
    );
  }

  if (pathname === "/api/dashboard" && request.method === "GET") {
    const [collabCountRow, activeCountRow, eventCountRow, shiftCountRow] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS cnt FROM collaborators").first<{ cnt: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS cnt FROM collaborators WHERE is_active = 1").first<{ cnt: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS cnt FROM events").first<{ cnt: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS cnt FROM shifts").first<{ cnt: number }>(),
    ]);

    const nextEvents = await env.DB
      .prepare(
        `SELECT id, type, event_date, label
         FROM events
         WHERE event_date >= date('now')
         ORDER BY event_date ASC
         LIMIT 10`,
      )
      .all<{ id: number; type: string; event_date: string; label: string }>();

    return applyCors(
      request,
      jsonOk({
        collaborators: Number(collabCountRow?.cnt ?? 0),
        activeCollaborators: Number(activeCountRow?.cnt ?? 0),
        events: Number(eventCountRow?.cnt ?? 0),
        shifts: Number(shiftCountRow?.cnt ?? 0),
        nextEvents: nextEvents.results ?? [],
      }),
    );
  }

  if (pathname === "/api/teams" && request.method === "GET") {
    const teams = await env.DB
      .prepare("SELECT id, code, name FROM teams ORDER BY id")
      .all<{ id: number; code: string; name: string }>();
    return applyCors(request, jsonOk(teams.results ?? []));
  }

  if (pathname === "/api/collaborators/active-by-team" && request.method === "GET") {
    const grouped = await getGroupedActiveCollaborators(env.DB);
    return applyCors(request, jsonOk(grouped));
  }

  if (pathname === "/api/collaborators" && request.method === "GET") {
    const collaborators = await env.DB
      .prepare(
        `SELECT
           c.id,
           c.name,
           c.team_id,
           t.name AS team_name,
           c.gender,
           CASE
             WHEN c.weekday_shift_end IS NULL OR c.weekday_shift_end = ''
             THEN NULL
             ELSE substr(c.weekday_shift_end, 1, 5)
           END AS weekday_shift_end,
           c.rotation_group,
           c.is_active
         FROM collaborators c
         INNER JOIN teams t ON t.id = c.team_id
         ORDER BY c.name ASC`,
      )
      .all<{
        id: number;
        name: string;
        team_id: number;
        team_name: string;
        gender: string;
        weekday_shift_end: string | null;
        rotation_group: string | null;
        is_active: number;
      }>();
    return applyCors(request, jsonOk(collaborators.results ?? []));
  }

  if (pathname === "/api/collaborators" && request.method === "POST") {
    const body = await readJson<CollaboratorInputPayload>(request);
    const payload = normalizeCollaboratorPayload(body);
    await assertTeamExists(env.DB, payload.team_id);

    try {
      const result = await env.DB
        .prepare(
          `INSERT INTO collaborators (name, team_id, is_active, gender, weekday_shift_end, rotation_group)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          payload.name,
          payload.team_id,
          payload.is_active,
          payload.gender,
          payload.weekday_shift_end,
          payload.rotation_group,
        )
        .run();

      return applyCors(
        request,
        jsonOk(
          {
            id: Number(result.meta.last_row_id ?? 0),
            message: "Colaborador criado com sucesso.",
          },
          201,
        ),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ValidationError("Ja existe colaborador com esses dados.");
      }
      throw error;
    }
  }

  const collaboratorId = parseCollaboratorId(pathname);
  if (collaboratorId !== null && request.method === "PUT") {
    const body = await readJson<CollaboratorInputPayload>(request);
    const payload = normalizeCollaboratorPayload(body);
    await assertTeamExists(env.DB, payload.team_id);

    const result = await env.DB
      .prepare(
        `UPDATE collaborators
         SET name = ?, team_id = ?, is_active = ?, gender = ?, weekday_shift_end = ?, rotation_group = ?
         WHERE id = ?`,
      )
      .bind(
        payload.name,
        payload.team_id,
        payload.is_active,
        payload.gender,
        payload.weekday_shift_end,
        payload.rotation_group,
        collaboratorId,
      )
      .run();

    if (Number(result.meta.changes ?? 0) === 0) {
      throw new NotFoundError("Colaborador nao encontrado.");
    }

    return applyCors(request, jsonOk({ message: "Colaborador atualizado com sucesso." }));
  }

  if (collaboratorId !== null && request.method === "DELETE") {
    const shiftsCountRow = await env.DB
      .prepare("SELECT COUNT(*) AS cnt FROM shifts WHERE collaborator_id = ?")
      .bind(collaboratorId)
      .first<{ cnt: number }>();

    const [deleteShiftsResult, deleteCollaboratorResult] = await env.DB.batch([
      env.DB.prepare("DELETE FROM shifts WHERE collaborator_id = ?").bind(collaboratorId),
      env.DB.prepare("DELETE FROM collaborators WHERE id = ?").bind(collaboratorId),
    ]);

    if (Number(deleteCollaboratorResult.meta?.changes ?? 0) === 0) {
      throw new NotFoundError("Colaborador nao encontrado.");
    }

    return applyCors(
      request,
      jsonOk({
        message: "Colaborador removido.",
        removed_shifts: Number(shiftsCountRow?.cnt ?? 0),
        deleted_shifts_changes: Number(deleteShiftsResult.meta?.changes ?? 0),
      }),
    );
  }

  if (pathname === "/api/events" && request.method === "GET") {
    const events = await env.DB
      .prepare(
        `SELECT e.id, e.type, e.event_date, e.label, COUNT(s.id) AS shifts_count
         FROM events e
         LEFT JOIN shifts s ON s.event_id = e.id
         GROUP BY e.id
         ORDER BY e.event_date ASC, e.id ASC`,
      )
      .all<{ id: number; type: string; event_date: string; label: string; shifts_count: number }>();

    return applyCors(request, jsonOk(events.results ?? []));
  }

  if (pathname === "/api/events/generate-weekends" && request.method === "POST") {
    const body = await readJson<{ month?: string }>(request);
    const month = String(body.month ?? "").trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new ValidationError("Mes invalido. Use formato YYYY-MM.");
    }

    const [yearRaw, monthRaw] = month.split("-");
    const year = Number.parseInt(yearRaw, 10);
    const monthNumber = Number.parseInt(monthRaw, 10);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

    let created = 0;
    let ignored = 0;

    for (let day = 1; day <= lastDay; day += 1) {
      const current = new Date(Date.UTC(year, monthNumber - 1, day));
      const weekdayIso = dayOfWeekIso(current);
      if (weekdayIso !== 6 && weekdayIso !== 7) {
        continue;
      }

      const eventDate = `${year}-${pad2(monthNumber)}-${pad2(day)}`;
      const label = `${pad2(day)} - ${weekdayIso === 6 ? "Sabado" : "Domingo"}`;

      const result = await env.DB
        .prepare("INSERT OR IGNORE INTO events (type, event_date, label) VALUES ('FDS', ?, ?)")
        .bind(eventDate, label)
        .run();

      if (Number(result.meta.changes ?? 0) > 0) {
        created += 1;
      } else {
        ignored += 1;
      }
    }

    return applyCors(
      request,
      jsonOk({
        created,
        ignored,
        message: `Geracao concluida: ${created} criados, ${ignored} ja existentes.`,
      }),
    );
  }

  const eventAutoScheduleId = parseEventId(pathname, "auto-schedule");
  if (eventAutoScheduleId !== null && request.method === "POST") {
    const result = await generateAutoSchedule(env.DB, eventAutoScheduleId);
    return applyCors(request, jsonOk(result));
  }

  const eventShiftsId = parseEventId(pathname, "shifts");
  if (eventShiftsId !== null && request.method === "GET") {
    const event = await env.DB
      .prepare("SELECT id, type, event_date, label FROM events WHERE id = ?")
      .bind(eventShiftsId)
      .first<{ id: number; type: string; event_date: string; label: string }>();

    if (!event) {
      throw new NotFoundError("Evento nao encontrado.");
    }

    const [teamsResult, shiftsResult, activeByTeam] = await Promise.all([
      env.DB.prepare("SELECT id, code, name FROM teams ORDER BY id").all<{ id: number; code: string; name: string }>(),
      env.DB
        .prepare(
          `SELECT
             s.team_id,
             s.collaborator_id,
             c.name AS collaborator_name,
             substr(s.shift_start, 1, 5) AS shift_start,
             substr(s.shift_end, 1, 5) AS shift_end,
             substr(s.break_10_1, 1, 5) AS break_10_1,
             substr(s.break_20, 1, 5) AS break_20,
             substr(s.break_10_2, 1, 5) AS break_10_2
           FROM shifts s
           INNER JOIN collaborators c ON c.id = s.collaborator_id
           WHERE s.event_id = ?
           ORDER BY s.team_id ASC, s.shift_start ASC`,
        )
        .bind(eventShiftsId)
        .all<{
          team_id: number;
          collaborator_id: number;
          collaborator_name: string;
          shift_start: string;
          shift_end: string;
          break_10_1: string;
          break_20: string;
          break_10_2: string;
        }>(),
      getGroupedActiveCollaborators(env.DB),
    ]);

    return applyCors(
      request,
      jsonOk({
        event,
        teams: teamsResult.results ?? [],
        rows: shiftsResult.results ?? [],
        activeCollaboratorsByTeam: activeByTeam,
      }),
    );
  }

  if (eventShiftsId !== null && request.method === "PUT") {
    await assertEventExists(env.DB, eventShiftsId);
    const body = await readJson<{ rows?: ShiftRowInput[] }>(request);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const validation = await validateShiftRows(env.DB, rows);
    if (!validation.valid) {
      throw new ValidationError(validation.errors[0] ?? "Validacao falhou.", {
        valid: false,
        errors: validation.errors,
      });
    }

    const statements: D1PreparedStatement[] = [env.DB.prepare("DELETE FROM shifts WHERE event_id = ?").bind(eventShiftsId)];
    for (const row of validation.rows) {
      statements.push(
        env.DB
          .prepare(
            `INSERT INTO shifts (
              event_id, team_id, collaborator_id, shift_start, shift_end, break_10_1, break_20, break_10_2
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            eventShiftsId,
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

    await env.DB.batch(statements);
    return applyCors(
      request,
      jsonOk({
        message: "Escala salva com sucesso.",
        saved_rows: validation.rows.length,
      }),
    );
  }

  const eventId = parseEventId(pathname);
  if (eventId !== null && request.method === "GET") {
    const event = await env.DB
      .prepare("SELECT id, type, event_date, label FROM events WHERE id = ?")
      .bind(eventId)
      .first<{ id: number; type: string; event_date: string; label: string }>();

    if (!event) {
      throw new NotFoundError("Evento nao encontrado.");
    }
    return applyCors(request, jsonOk(event));
  }

  if (pathname === "/api/events" && request.method === "POST") {
    const body = await readJson<EventInputPayload>(request);
    const payload = normalizeEventPayload(body);

    try {
      const result = await env.DB
        .prepare("INSERT INTO events (type, event_date, label) VALUES (?, ?, ?)")
        .bind(payload.type, payload.event_date, payload.label)
        .run();

      return applyCors(
        request,
        jsonOk(
          {
            id: Number(result.meta.last_row_id ?? 0),
            message: "Evento criado com sucesso.",
          },
          201,
        ),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ValidationError("Ja existe evento deste tipo para esta data.");
      }
      throw error;
    }
  }

  if (eventId !== null && request.method === "PUT") {
    const body = await readJson<EventInputPayload>(request);
    const payload = normalizeEventPayload(body);

    try {
      const result = await env.DB
        .prepare("UPDATE events SET type = ?, event_date = ?, label = ? WHERE id = ?")
        .bind(payload.type, payload.event_date, payload.label, eventId)
        .run();

      if (Number(result.meta.changes ?? 0) === 0) {
        throw new NotFoundError("Evento nao encontrado.");
      }
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ValidationError("Ja existe evento deste tipo para esta data.");
      }
      throw error;
    }

    return applyCors(request, jsonOk({ message: "Evento atualizado com sucesso." }));
  }

  if (eventId !== null && request.method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM events WHERE id = ?").bind(eventId).run();
    if (Number(result.meta.changes ?? 0) === 0) {
      throw new NotFoundError("Evento nao encontrado.");
    }
    return applyCors(request, jsonOk({ message: "Evento removido." }));
  }

  if (pathname === "/api/validate/shifts" && request.method === "POST") {
    const body = await readJson<{ rows?: ShiftRowInput[] }>(request);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const validation = await validateShiftRows(env.DB, rows);
    if (!validation.valid) {
      throw new ValidationError(validation.errors[0] ?? "Validacao falhou.", {
        valid: false,
        errors: validation.errors,
      });
    }
    return applyCors(request, jsonOk({ valid: true, errors: [] }));
  }

  return applyCors(request, jsonError(404, "Rota nao encontrada."));
}

export default {
  fetch: withJsonErrorHandling<Env>(handleApiRequest),
};