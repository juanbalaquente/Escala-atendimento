import type { CleanShiftRow, ShiftRowInput } from "./types";
import { normalizeTime, timeToMinutes, toInt } from "./utils";

interface CollaboratorRow {
  id: number;
  team_id: number;
  is_active: number;
}

export async function validateShiftRows(
  db: D1Database,
  rows: ShiftRowInput[],
): Promise<{ valid: boolean; errors: string[]; rows: CleanShiftRow[] }> {
  const errors: string[] = [];
  const cleanRows: CleanShiftRow[] = [];
  const seenCollaborators = new Set<number>();

  if (rows.length === 0) {
    errors.push("Adicione pelo menos 1 linha de escala.");
    return { valid: false, errors, rows: cleanRows };
  }

  for (let index = 0; index < rows.length; index += 1) {
    const line = index + 1;
    const row = rows[index] ?? {};

    const teamId = toInt(row.team_id);
    const collaboratorId = toInt(row.collaborator_id);
    const shiftStart = normalizeTime(row.shift_start ?? null);
    const shiftEnd = normalizeTime(row.shift_end ?? null);
    const break101 = normalizeTime(row.break_10_1 ?? null);
    const break20 = normalizeTime(row.break_20 ?? null);
    const break102 = normalizeTime(row.break_10_2 ?? null);

    if (!teamId || !collaboratorId || !shiftStart || !shiftEnd || !break101 || !break20 || !break102) {
      errors.push(`Linha ${line}: todos os campos sao obrigatorios (incluindo as 3 pausas).`);
      continue;
    }

    const startMin = timeToMinutes(shiftStart);
    const endMin = timeToMinutes(shiftEnd);
    const b1Min = timeToMinutes(break101);
    const b20Min = timeToMinutes(break20);
    const b2Min = timeToMinutes(break102);

    if (startMin == null || endMin == null || b1Min == null || b20Min == null || b2Min == null) {
      errors.push(`Linha ${line}: horario invalido.`);
      continue;
    }

    if (endMin <= startMin) {
      errors.push(`Linha ${line}: fim do turno deve ser maior que o inicio.`);
    }

    if (!(startMin < b1Min && b1Min < endMin) || !(startMin < b20Min && b20Min < endMin) || !(startMin < b2Min && b2Min < endMin)) {
      errors.push(`Linha ${line}: pausas devem estar dentro do turno.`);
    }

    if (!(b1Min < b20Min && b20Min < b2Min)) {
      errors.push(`Linha ${line}: pausas devem estar em ordem (pausa_10_1 < pausa_20 < pausa_10_2).`);
    }

    if (seenCollaborators.has(collaboratorId)) {
      errors.push(`Linha ${line}: colaborador repetido no mesmo evento.`);
    } else {
      seenCollaborators.add(collaboratorId);
    }

    const collaborator = await db
      .prepare("SELECT id, team_id, is_active FROM collaborators WHERE id = ?")
      .bind(collaboratorId)
      .first<CollaboratorRow>();

    if (!collaborator) {
      errors.push(`Linha ${line}: colaborador nao encontrado.`);
      continue;
    }

    if (Number(collaborator.is_active) !== 1) {
      errors.push(`Linha ${line}: colaborador inativo.`);
    }

    if (Number(collaborator.team_id) !== teamId) {
      errors.push(`Linha ${line}: colaborador nao pertence a equipe selecionada.`);
    }

    cleanRows.push({
      team_id: teamId,
      collaborator_id: collaboratorId,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      break_10_1: break101,
      break_20: break20,
      break_10_2: break102,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    rows: cleanRows,
  };
}
