import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ThemeSync } from "@/components/theme-sync";
import { getSessionUser } from "@/lib/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const { data: prefs } = await user.db.from("user_preferences").select("theme").eq("user_id", user.id).maybeSingle();
  const theme = prefs?.theme === "light" || prefs?.theme === "dark" ? prefs.theme : "system";
  return (
    <AppShell email={user.email}>
      <ThemeSync theme={theme} />
      {children}
    </AppShell>
  );
}
