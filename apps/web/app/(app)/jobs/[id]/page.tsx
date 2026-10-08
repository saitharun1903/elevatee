import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isElevateError } from "@elevate/core";
import { getJobWorkspace } from "@/lib/server/services/workspace";
import { getViewer } from "@/lib/server/viewer";
import { Workspace } from "./workspace";
import { TAB_KEYS, type TabKey } from "./tab-keys";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const viewer = await getViewer();
    const { data } = await viewer.db.from("jobs").select("title, company").eq("id", id).maybeSingle();
    return { title: [data?.title, data?.company].filter(Boolean).join(" · ") || "Job" };
  } catch {
    return { title: "Job" };
  }
}

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; practice?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await getViewer();
  let ws;
  try {
    ws = await getJobWorkspace(viewer.db, id);
  } catch (e) {
    if (isElevateError(e) && e.code === "not_found") notFound();
    throw e;
  }
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as TabKey) : "overview";
  return <Workspace ws={ws} tab={tab} locale={viewer.locale} timezone={viewer.timezone} openPractice={sp.practice === "1"} />;
}
