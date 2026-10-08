import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isElevateError } from "@elevate/core";
import { getT } from "@/lib/i18n";
import { getMockInterview } from "@/lib/server/services/workflow";
import { getViewer } from "@/lib/server/viewer";
import { InterviewSession, type SessionData } from "./session";

const t = getT();
export const metadata: Metadata = { title: t("interviews.title") };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await getViewer();
  let data;
  try {
    data = await getMockInterview(viewer.db, id);
  } catch (e) {
    if (isElevateError(e) && e.code === "not_found") notFound();
    throw e;
  }
  return <InterviewSession initial={data as unknown as SessionData} />;
}
