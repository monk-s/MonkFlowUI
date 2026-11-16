// Thin fetch wrapper for the MonkFlow API.
//
// Authentication is an HttpOnly session cookie the browser attaches by
// itself; this file never sees or stores a credential. Errors from the API
// arrive as { error: { message, details: { code, ... } } } and are raised as
// ApiError so screens can switch on `code`.

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;
  constructor(status: number, message: string, code: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** True when the request never reached the server. */
export const isOffline = (err: unknown) => err instanceof TypeError;

/** A sentence a person can act on, whatever went wrong. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isOffline(err)) return 'We could not reach the server. Check your connection and try again.';
  if (err instanceof ApiError && err.message) return err.message;
  return fallback;
}

type Listener = () => void;
const sessionEndedListeners = new Set<Listener>();
/** Called when any request finds the session has ended (timeout, sign-out elsewhere). */
export const onSessionEnded = (fn: Listener) => { sessionEndedListeners.add(fn); return () => { sessionEndedListeners.delete(fn); }; };

interface Options {
  /** Polling and refetches: authenticated, but does not count as activity. */
  background?: boolean;
  /** Do not announce a 401 as "session ended" (used by the session check itself). */
  quiet401?: boolean;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, body?: unknown, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.background) headers['X-MF-Background'] = '1';

  const res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    signal: opts.signal,
  });

  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;

  const payload = await res.json().catch(() => null);
  const error = payload?.error ?? {};
  const details = (error.details && !Array.isArray(error.details) ? error.details : {}) as Record<string, unknown>;
  // Validation errors arrive as a list of { path, message }.
  const firstIssue = Array.isArray(error.details) ? error.details[0]?.message : undefined;
  const code = typeof details.code === 'string' ? details.code : res.status === 429 ? 'rate_limited' : `http_${res.status}`;
  const err = new ApiError(res.status, firstIssue || error.message || 'Request failed', code, details);
  if (res.status === 401 && code === 'not_signed_in' && !opts.quiet401) sessionEndedListeners.forEach((fn) => fn());
  throw err;
}

export const api = {
  get: <T>(path: string, opts?: Options) => request<T>('GET', path, undefined, opts),
  post: <T>(path: string, body: unknown = {}, opts?: Options) => request<T>('POST', path, body, opts),
  patch: <T>(path: string, body: unknown = {}, opts?: Options) => request<T>('PATCH', path, body, opts),
  del: <T>(path: string, opts?: Options) => request<T>('DELETE', path, undefined, opts),
};
