/**
 * Client-side API helper. Every mutation goes through here so errors are
 * human-readable and network failures are distinguished from server errors.
 */
export class ApiError extends Error {
  code: string;
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, code: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      credentials: "same-origin",
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("You seem to be offline. Check your connection and try again.", "network", 0);
  }
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code: string; message: string; fields?: Record<string, string> } } | null;
  if (!res.ok || !json || json.error) {
    const e = json?.error;
    throw new ApiError(e?.message ?? "Something went wrong. Please try again.", e?.code ?? "internal", res.status, e?.fields);
  }
  return json.data as T;
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
