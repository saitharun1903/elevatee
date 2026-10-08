import type { Metadata } from "next";
import { getT } from "@/lib/i18n";
import { listResumes } from "@/lib/server/services/resumes";
import { storageConfigured } from "@/lib/server/storage";
import { capabilities } from "@/lib/server/providers";
import { getViewer } from "@/lib/server/viewer";
import { ResumeManager, type ResumeItem } from "./resume-manager";

const t = getT();
export const metadata: Metadata = { title: t("profile.title") };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const resumes = (await listResumes(viewer.db)) as unknown as ResumeItem[];
  const returnTo = sp.return?.startsWith("/") && !sp.return.startsWith("//") ? sp.return : null;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <header>
        <h1 className="font-display text-h1">{t("profile.title")}</h1>
        {viewer.email ? <p className="mt-2 text-ink-3">{viewer.email}</p> : null}
      </header>
      <ResumeManager resumes={resumes} locale={viewer.locale} storage={storageConfigured()} aiAvailable={!!capabilities().ai} returnTo={returnTo} />
    </div>
  );
}
