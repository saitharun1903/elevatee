"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isTerminal, type AnalysisStatus } from "@elevate/core";
import type { Stages } from "@elevate/core/server";

export interface LiveState {
  status: AnalysisStatus | null;
  stages: Stages;
  error: { code: string; message: string } | null;
  connection: "idle" | "live" | "polling" | "lost";
}

/**
 * Subscribes to the real backend event stream for one analysis. Falls back to polling the
 * analysis endpoint if the stream fails. Refreshes server data once a terminal state arrives.
 * Polling stops after 7 minutes; the server closes stale analyses after 6, so this always ends.
 */
export function useAnalysisStream(jobId: string, analysisId: string | null, initial: { status: AnalysisStatus | null; stages: Stages; error: LiveState["error"] }) {
  const router = useRouter();
  const [state, setState] = useState<LiveState>({ ...initial, connection: "idle" });
  const refreshed = useRef(false);
  const [trackedId, setTrackedId] = useState(analysisId);
  if (trackedId !== analysisId) {
    // A new analysis was started (re-run): reset to the server's state for it.
    setTrackedId(analysisId);
    setState({ ...initial, connection: "idle" });
  }

  useEffect(() => {
    refreshed.current = false;
    if (!analysisId || !initial.status || isTerminal(initial.status)) return;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const started = Date.now();

    const finish = () => {
      if (refreshed.current) return;
      refreshed.current = true;
      router.refresh();
    };

    const poll = async () => {
      if (closed) return;
      if (Date.now() - started > 7 * 60_000) {
        setState((s) => ({ ...s, connection: "lost" }));
        return;
      }
      try {
        const res = await fetch(`/api/v1/jobs/${jobId}/analysis`, { credentials: "same-origin", signal: AbortSignal.timeout(15_000) });
        const body = (await res.json()) as { analysis: { id: string; status: AnalysisStatus; stages: Stages; error: LiveState["error"] } | null };
        if (body.analysis && body.analysis.id === analysisId) {
          setState({ status: body.analysis.status, stages: body.analysis.stages, error: body.analysis.error, connection: "polling" });
          if (isTerminal(body.analysis.status)) return finish();
        }
      } catch {
        setState((s) => ({ ...s, connection: "polling" }));
      }
      pollTimer = setTimeout(poll, 4000);
    };

    const connect = (after = 0) => {
      es = new EventSource(`/api/v1/analyses/${analysisId}/events${after ? `?after=${after}` : ""}`);
      let lastId = after;
      es.addEventListener("ready", () => setState((s) => ({ ...s, connection: "live" })));
      es.addEventListener("analysis_event", (e) => {
        lastId = Number((e as MessageEvent).lastEventId) || lastId;
      });
      es.addEventListener("status", (e) => {
        const d = JSON.parse((e as MessageEvent).data) as { status: AnalysisStatus; stages: Stages; error: LiveState["error"] };
        setState((s) => ({ ...s, status: d.status, stages: d.stages ?? {}, error: d.error }));
      });
      es.addEventListener("end", () => {
        es?.close();
        finish();
      });
      es.addEventListener("reconnect", () => {
        es?.close();
        if (!closed) connect(lastId);
      });
      es.onerror = () => {
        // The stream failed (network, proxy buffering). Switch to polling; never spin forever.
        es?.close();
        if (!closed && !refreshed.current) {
          setState((s) => ({ ...s, connection: "polling" }));
          poll();
        }
      };
    };

    connect();
    return () => {
      closed = true;
      es?.close();
      if (pollTimer) clearTimeout(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId, jobId]);

  return state;
}
