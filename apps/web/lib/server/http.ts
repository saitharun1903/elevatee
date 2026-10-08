import "server-only";
import { isElevateError } from "@elevate/core";
import { ZodError, type z } from "zod";
import { publicEnv } from "../env";
import { requireAuth, type AuthContext } from "./auth";
import { log, newRequestId } from "./log";
import { captureException } from "./monitoring";

export interface ApiError {
  error: { code: string; message: string; requestId: string; details?: unknown };
}

/** Only the configured Elevate extension IDs may call the API cross-origin. */
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin) return {};
  const allowed = publicEnv.extensionIds.map((id) => `chrome-extension://${id}`);
  if (!allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-max-age": "600",
    vary: "origin",
  };
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function json<T>(req: Request, body: T, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...corsHeaders(req), ...init.headers },
  });
}

function errorResponse(req: Request, err: unknown, requestId: string, route: string): Response {
  if (isElevateError(err)) {
    if (err.status >= 500) log.warn("api.error", { requestId, route, code: err.code, status: err.status });
    return json<ApiError>(req, { error: { code: err.code, message: err.userMessage, requestId } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return json<ApiError>(
      req,
      {
        error: {
          code: "invalid_input",
          message: err.issues[0]?.message ?? "Invalid request.",
          requestId,
          details: err.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  log.error("api.unhandled", { requestId, route, name: err instanceof Error ? err.name : typeof err });
  captureException(err, { requestId, route });
  return json<ApiError>(req, { error: { code: "internal", message: "Something went wrong on our side. Try again.", requestId } }, { status: 500 });
}

type Params = Record<string, string>;

/** Wrap an authenticated API handler with auth, validation errors, CORS and structured logging. */
export function authed<P extends Params = Params>(
  route: string,
  fn: (ctx: AuthContext & { req: Request; params: P; requestId: string }) => Promise<Response>,
) {
  return async (req: Request, segment: { params: Promise<P> }): Promise<Response> => {
    const requestId = newRequestId();
    const started = Date.now();
    try {
      const auth = await requireAuth(req);
      const params = segment?.params ? await segment.params : ({} as P);
      const res = await fn({ ...auth, req, params, requestId });
      log.info("api.request", { requestId, route, userId: auth.userId, status: res.status, durationMs: Date.now() - started });
      return res;
    } catch (err) {
      return errorResponse(req, err, requestId, route);
    }
  };
}

/** Unauthenticated handler wrapper (auth refresh, health). */
export function open(route: string, fn: (req: Request, requestId: string) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const requestId = newRequestId();
    try {
      return await fn(req, requestId);
    } catch (err) {
      return errorResponse(req, err, requestId, route);
    }
  };
}

export async function readJson<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }
  return schema.parse(body);
}
