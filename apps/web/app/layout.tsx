import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from "next/font/google";
import { RegisterServiceWorker } from "@/components/pwa";
import { getT } from "@/lib/i18n";
import "./globals.css";

const ui = Schibsted_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-ui", display: "swap" });
const editorial = Newsreader({ subsets: ["latin", "latin-ext"], variable: "--font-editorial", display: "swap", style: ["normal", "italic"], axes: ["opsz"] });
const data = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-data", display: "swap" });

const t = getT("en");

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: `${t("brand.name")} — ${t("brand.tagline")}`, template: `%s · ${t("brand.name")}` },
  description: t("landing.lede"),
  applicationName: t("brand.name"),
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: t("brand.name"), statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0e0c" },
  ],
};

// Applies the saved theme before first paint to avoid a flash. Values are fixed strings, no user content.
const themeScript = `try{var t=localStorage.getItem("elevate-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${ui.variable} ${editorial.variable} ${data.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
          {t("nav.skip")}
        </a>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
