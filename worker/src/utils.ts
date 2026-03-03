const API_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
};

interface ErrorResponseData {
  [key: string]: unknown;
}

export class ApiError extends Error {
  status: number;
  data: ErrorResponseData | null;

  constructor(status: number, message: string, data: ErrorResponseData | null = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, data: ErrorResponseData | null = null) {
    super(400, message, data);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string, data: ErrorResponseData | null = null) {
    super(404, message, data);
  }
}

export function jsonOk(data: unknown = null, status = 200): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      data,
      error: null,
    }),
    {
      status,
      headers: API_HEADERS,
    },
  );
}

export function jsonError(status: number, error: string, data: ErrorResponseData | null = null): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      data,
      error,
    }),
    {
      status,
      headers: API_HEADERS,
    },
  );
}

export function jsonFromUnknownError(err: unknown): Response {
  if (err instanceof ApiError) {
    return jsonError(err.status, err.message, err.data);
  }
  if (err instanceof Error) {
    return jsonError(500, err.message);
  }
  return jsonError(500, "Erro inesperado.");
}

export function withJsonErrorHandling<E>(
  handler: (request: Request, env: E) => Promise<Response>,
): (request: Request, env: E) => Promise<Response> {
  return async (request: Request, env: E): Promise<Response> => {
    try {
      return await handler(request, env);
    } catch (error) {
      return jsonFromUnknownError(error);
    }
  };
}

export async function readJson<T>(request: Request): Promise<T> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new ValidationError("Payload JSON invalido.");
  }

  if (!payload || typeof payload !== "object") {
    throw new ValidationError("Payload invalido.");
  }

  return payload as T;
}

export function normalizeTime(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (!/^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    return null;
  }
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number.parseInt(hourRaw ?? "0", 10);
  const minute = Number.parseInt(minuteRaw ?? "0", 10);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

export function timeToMinutes(value: string): number | null {
  if (!/^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    return null;
  }
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number.parseInt(hourRaw ?? "0", 10);
  const minute = Number.parseInt(minuteRaw ?? "0", 10);
  return hour * 60 + minute;
}

export function parseIsoDate(input: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new ValidationError("Data invalida. Use YYYY-MM-DD.");
  }
  const [yearRaw, monthRaw, dayRaw] = input.split("-");
  const year = Number.parseInt(yearRaw ?? "0", 10);
  const month = Number.parseInt(monthRaw ?? "0", 10);
  const day = Number.parseInt(dayRaw ?? "0", 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ValidationError("Data invalida.");
  }
  return date;
}

export function dayOfWeekIso(date: Date): number {
  const jsDay = date.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function stableHash32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function stableMod(input: string, mod: number): number {
  if (mod <= 1) {
    return 0;
  }
  return stableHash32(input) % mod;
}

export function toInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    return Number.parseInt(value, 10);
  }
  return 0;
}

export function jsonNoContent(): Response {
  return new Response(null, {
    status: 204,
    headers: API_HEADERS,
  });
}
