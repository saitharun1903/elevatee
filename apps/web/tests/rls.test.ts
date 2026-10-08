/**
 * Cross-user isolation against a real Supabase instance (local CLI stack or a test project).
 * Requires SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY and SUPABASE_TEST_SERVICE_ROLE_KEY.
 * Skipped when they are not set — it never runs against production by accident because the
 * service-role key is only used to create and delete two throwaway test users.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_TEST_URL;
const anon = process.env.SUPABASE_TEST_ANON_KEY;
const service = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const enabled = !!(url && anon && service);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

async function makeUser(admin: SupabaseClient, tag: string) {
  const email = `rls-${tag}-${crypto.randomUUID().slice(0, 8)}@elevate.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = createClient(url!, anon!, opts);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, client };
}

describe.skipIf(!enabled)("row level security", () => {
  let admin: SupabaseClient;
  let a: Awaited<ReturnType<typeof makeUser>>;
  let b: Awaited<ReturnType<typeof makeUser>>;
  let jobA: string;

  beforeAll(async () => {
    admin = createClient(url!, service!, opts);
    a = await makeUser(admin, "a");
    b = await makeUser(admin, "b");
    const { data, error } = await a.client
      .from("jobs")
      .insert({ user_id: a.id, source_platform: "manual", content_hash: crypto.randomUUID(), title: "Registered Nurse", company: "Test Hospital", captured_via: "text" })
      .select("id")
      .single();
    if (error) throw error;
    jobA = data.id;
  });

  afterAll(async () => {
    if (!enabled) return;
    await admin.auth.admin.deleteUser(a.id);
    await admin.auth.admin.deleteUser(b.id);
  });

  it("owner can read their job", async () => {
    const { data } = await a.client.from("jobs").select("id, title").eq("id", jobA).maybeSingle();
    expect(data?.title).toBe("Registered Nurse");
  });

  it("another user cannot read, update or delete it", async () => {
    const read = await b.client.from("jobs").select("id").eq("id", jobA);
    expect(read.data).toEqual([]);
    const upd = await b.client.from("jobs").update({ title: "hijacked" }).eq("id", jobA).select("id");
    expect(upd.data ?? []).toEqual([]);
    const del = await b.client.from("jobs").delete().eq("id", jobA).select("id");
    expect(del.data ?? []).toEqual([]);
    const still = await a.client.from("jobs").select("title").eq("id", jobA).single();
    expect(still.data?.title).toBe("Registered Nurse");
  });

  it("cannot insert rows owned by someone else", async () => {
    const { error } = await b.client.from("jobs").insert({ user_id: a.id, source_platform: "manual", content_hash: "x", captured_via: "text" });
    expect(error).not.toBeNull();
  });

  it("cannot attach own rows to another user's job (composite FK)", async () => {
    const save = await b.client.from("saved_jobs").insert({ user_id: b.id, job_id: jobA });
    expect(save.error).not.toBeNull();
    const app = await b.client.from("applications").insert({ user_id: b.id, job_id: jobA });
    expect(app.error).not.toBeNull();
    const analysis = await b.client.from("job_analyses").insert({ user_id: b.id, job_id: jobA });
    expect(analysis.error).not.toBeNull();
  });

  it("resume version source text is immutable", async () => {
    const { data: r } = await a.client.from("resumes").insert({ user_id: a.id, label: "Test" }).select("id").single();
    const { data: v, error } = await a.client
      .from("resume_versions")
      .insert({ user_id: a.id, resume_id: r!.id, version: 1, source_type: "text", content_hash: "h", raw_text: "original text" })
      .select("id")
      .single();
    expect(error).toBeNull();
    const upd = await a.client.from("resume_versions").update({ raw_text: "changed" }).eq("id", v!.id);
    expect(upd.error).not.toBeNull();
    const ok = await a.client.from("resume_versions").update({ parse_status: "text_only" }).eq("id", v!.id);
    expect(ok.error).toBeNull();
  });

  it("stale analyses are closed instead of staying pending", async () => {
    const { data } = await a.client.from("job_analyses").insert({ user_id: a.id, job_id: jobA, status: "RESEARCHING" }).select("id").single();
    const { data: closed } = await a.client.rpc("close_stale_analyses", { max_age: "0 seconds" });
    expect(closed).toBeGreaterThanOrEqual(1);
    const { data: row } = await a.client.from("job_analyses").select("status").eq("id", data!.id).single();
    expect(row!.status).toBe("TIMEOUT");
  });

  it("users cannot read others' product events or analysis events", async () => {
    await a.client.from("product_events").insert({ user_id: a.id, name: "job_saved" });
    const { data } = await b.client.from("product_events").select("id");
    expect(data ?? []).toEqual([]);
  });
});
