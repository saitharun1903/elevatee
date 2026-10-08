/**
 * The user's own Elevate session (Supabase access + refresh token) for the extension.
 *
 * Stored in chrome.storage.local, never sent anywhere except APP_URL. Refresh is proactive
 * (< 60 s to expiry) and single-flight: concurrent callers share one refresh, and across
 * extension contexts (side panels in several windows, service worker) a Web Lock serializes
 * refreshes so a rotated refresh token is never used twice.
 */

export const SESSION_KEY = "elevate.session";
export const REFRESH_SKEW_SECONDS = 60;

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
  email: string | null;
}

/** The subset of chrome.storage.StorageArea used here (promise API). Easy to fake in tests. */
export interface KeyValueStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export type LockFn = <T>(name: string, fn: () => Promise<T>) => Promise<T>;

export class SessionExpiredError extends Error {
  readonly code = "session_expired";
  constructor(message = "Your Elevate session expired. Connect Elevate again.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

const isNonEmptyString = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/** Validate an untrusted session payload (from the connect page or the refresh endpoint). */
export function parseSession(input: unknown): Session | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (!isNonEmptyString(o.accessToken, 8192) || !isNonEmptyString(o.refreshToken, 2000)) return null;
  if (/\s/.test(o.accessToken) || /\s/.test(o.refreshToken)) return null;
  const exp = o.expiresAt;
  if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= 0) return null;
  // Seconds, not milliseconds: reject obviously wrong units (year > 5000).
  if (exp > 95_617_584_000) return null;
  let email: string | null = null;
  if (o.email !== undefined && o.email !== null) {
    if (typeof o.email !== "string" || o.email.length > 320) return null;
    email = o.email;
  }
  return { accessToken: o.accessToken, refreshToken: o.refreshToken, expiresAt: Math.floor(exp), email };
}

export interface SessionStoreDeps {
  storage: KeyValueStorage;
  appUrl: string;
  fetch?: typeof fetch;
  now?: () => number;
  lock?: LockFn;
  refreshTimeoutMs?: number;
}

const defaultLock: LockFn = async (name, fn) => {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks && typeof locks.request === "function") return locks.request(name, () => fn()) as Promise<Awaited<ReturnType<typeof fn>>>;
  return fn();
};

export class SessionStore {
  private inflight: Promise<Session> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly lock: LockFn;

  constructor(private readonly deps: SessionStoreDeps) {
    this.fetchImpl = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.now = deps.now ?? (() => Date.now());
    this.lock = deps.lock ?? defaultLock;
  }

  async get(): Promise<Session | null> {
    const raw = (await this.deps.storage.get(SESSION_KEY))[SESSION_KEY];
    return parseSession(raw);
  }

  async set(session: Session): Promise<void> {
    await this.deps.storage.set({ [SESSION_KEY]: session });
  }

  async clear(): Promise<void> {
    await this.deps.storage.remove(SESSION_KEY);
  }

  private nowSeconds(): number {
    return Math.floor(this.now() / 1000);
  }

  needsRefresh(s: Session): boolean {
    return s.expiresAt - this.nowSeconds() < REFRESH_SKEW_SECONDS;
  }

  /**
   * A usable access token, refreshing first when it is about to expire.
   * Throws SessionExpiredError when there is no session or it cannot be refreshed.
   */
  async getAccessToken(): Promise<string> {
    const s = await this.get();
    if (!s) throw new SessionExpiredError("Connect Elevate to analyze jobs.");
    if (!this.needsRefresh(s)) return s.accessToken;
    return (await this.refresh(s.accessToken)).accessToken;
  }

  /**
   * Refresh the session. `staleAccessToken` is the token the caller saw fail/expire: if another
   * context already rotated it, the stored newer session is returned without a network call.
   */
  refresh(staleAccessToken?: string): Promise<Session> {
    if (!this.inflight) {
      this.inflight = this.lock("elevate-session-refresh", () => this.doRefresh(staleAccessToken)).finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async doRefresh(staleAccessToken?: string): Promise<Session> {
    const current = await this.get();
    if (!current) throw new SessionExpiredError();
    if (staleAccessToken && current.accessToken !== staleAccessToken && !this.needsRefresh(current)) return current;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.deps.refreshTimeoutMs ?? 15_000);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.deps.appUrl}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
        signal: ctrl.signal,
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      // Network failure or timeout: keep the session (it may still work later), but this call fails.
      throw new Error(ctrl.signal.aborted ? "Refreshing your session timed out. Try again." : "Couldn't reach Elevate to refresh your session. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      await this.clear();
      throw new SessionExpiredError();
    }
    if (!res.ok) throw new Error("Elevate couldn't refresh your session right now. Try again.");

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error("Elevate sent an unexpected response while refreshing your session.");
    }
    const b = (body ?? {}) as Record<string, unknown>;
    const next = parseSession({
      accessToken: b.accessToken,
      refreshToken: b.refreshToken,
      // The server may omit expiry; assume a conservative 5 minutes so we refresh again soon.
      expiresAt: typeof b.expiresAt === "number" ? b.expiresAt : this.nowSeconds() + 300,
      email: typeof b.email === "string" ? b.email : current.email,
    });
    if (!next) {
      await this.clear();
      throw new SessionExpiredError();
    }
    await this.set(next);
    return next;
  }
}
