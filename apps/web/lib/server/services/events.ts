import "server-only";
import type { Db } from "../supabase";

export type ProductEvent = "job_analyzed" | "resume_uploaded" | "job_saved" | "application_updated" | "preparation_started" | "mock_interview_started";

/** Product analytics: feature usage only, opt-out respected, never content. */
export async function trackEvent(db: Db, userId: string, name: ProductEvent, props: Record<string, string | number | boolean | null> = {}) {
  try {
    const { data: pref } = await db.from("user_preferences").select("product_analytics").eq("user_id", userId).maybeSingle();
    if (pref && pref.product_analytics === false) return;
    await db.from("product_events").insert({ user_id: userId, name, props });
  } catch {
    /* analytics must never break a user action */
  }
}

/** Notifications are created only from real events (analysis finished, interview scheduled). */
export async function notify(db: Db, userId: string, n: { kind: string; title: string; body: string | null; link: string | null }) {
  try {
    await db.from("notifications").insert({ user_id: userId, ...n });
  } catch {
    /* non-critical */
  }
}
