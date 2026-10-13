import { z } from "zod";
import { ElevateError, isTerminal, type AnalysisStatus } from "@elevate/core";
import { authed, preflight } from "@/lib/server/http";

export const maxDuration = 300;
export const OPTIONS = preflight;

const POLL_MS = 750;
const STREAM_LIMIT_MS = 270_000;
const PING_MS = 15_000;
const SWEEP_MS = 30_000;

/**
 * GET /api/v1/analyses/:id/events — Server-Sent Events.
 * Streams the analysis_events rows the pipeline actually wrote, plus a status frame on every change.
 * The stream always ends: when the analysis reaches a terminal state, or after the stream limit
 * (the client then reconnects with Last-Event-ID or falls back to reading the analysis).
 */
export const GET = authed<{ id: string }>("analyses.events", async (ctx) => {
  const analysisId = z.string().uuid().parse(ctx.params.id);
  const { data: exists } = await ctx.db.from("job_analyses").select("id").eq("id", analysisId).maybeSingle();
  if (!exists) throw new ElevateError("not_found", "Analysis not found.");

  const url = new URL(ctx.req.url);
  let lastId = Number(ctx.req.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0) || 0;
  const db = ctx.db;
  const encoder = new TextEncoder();
  const started = Date.now();

  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Every write is guarded: once the client has gone, enqueue/close throw and must not crash.
      const send = (event: string, data: unknown, id?: number) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${id !== undefined ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const ping = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      };
      let lastStatus: string | null = null;
      let lastStages = "";
      let lastSweep = 0;
      let lastPing = Date.now();
      try {
        send("ready", { analysisId });
        while (!closed && !ctx.req.signal.aborted) {
          if (Date.now() - lastSweep > SWEEP_MS) {
            lastSweep = Date.now();
            await db.rpc("close_stale_analyses");
          }
          const [{ data: events }, { data: analysis }] = await Promise.all([
            db.from("analysis_events").select("id, type, stage, payload, created_at").eq("analysis_id", analysisId).gt("id", lastId).order("id").limit(100),
            db.from("job_analyses").select("status, stages, error, updated_at").eq("id", analysisId).maybeSingle(),
          ]);
          for (const e of events ?? []) {
            lastId = e.id;
            send("analysis_event", e, e.id);
          }
          if (analysis) {
            const stagesSig = JSON.stringify(analysis.stages);
            if (analysis.status !== lastStatus || stagesSig !== lastStages) {
              lastStatus = analysis.status;
              lastStages = stagesSig;
              send("status", { status: analysis.status, stages: analysis.stages, error: analysis.error, updatedAt: analysis.updated_at });
            }
            if (isTerminal(analysis.status as AnalysisStatus)) {
              send("end", { status: analysis.status });
              break;
            }
          } else {
            send("end", { status: "FAILED", reason: "not_found" });
            break;
          }
          if (Date.now() - started > STREAM_LIMIT_MS) {
            send("reconnect", { after: lastId });
            break;
          }
          // Comment frames keep proxies from closing the stream and reveal a gone client sooner.
          if (Date.now() - lastPing > PING_MS) {
            lastPing = Date.now();
            ping();
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch {
        send("error", { message: "Live updates were interrupted." });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});
