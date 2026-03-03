export interface Env {
  DB: D1Database;
  APP_VERSION?: string;
}

export interface ShiftRowInput {
  team_id?: number | string;
  collaborator_id?: number | string;
  shift_start?: string;
  shift_end?: string;
  break_10_1?: string;
  break_20?: string;
  break_10_2?: string;
}

export interface CleanShiftRow {
  team_id: number;
  collaborator_id: number;
  shift_start: string;
  shift_end: string;
  break_10_1: string;
  break_20: string;
  break_10_2: string;
}

export interface CollaboratorCandidate {
  id: number;
  name: string;
  gender: "F" | "M" | "N";
  weekday_shift_end: string | null;
  rotation_group: "A" | "B";
}
