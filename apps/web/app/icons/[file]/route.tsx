import { ImageResponse } from "next/og";

const SIZES: Record<string, { size: number; maskable: boolean }> = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
  "apple-touch-icon.png": { size: 180, maskable: true },
};

/** PNG app icons rendered from the Elevate mark (PWA manifest + Apple touch icon). */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const spec = SIZES[file];
  if (!spec) return new Response("Not found", { status: 404 });
  const { size, maskable } = spec;
  const inset = maskable ? size * 0.18 : 0;
  const inner = size - inset * 2;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: maskable ? "#15140f" : "transparent" }}>
        <svg width={inner} height={inner} viewBox="0 0 32 32">
          <rect width="32" height="32" rx={maskable ? 0 : 7} fill="#15140f" />
          <path d="M7 21.5h7.2l3.6-9h7.2" fill="none" stroke="#f4f2ec" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="25" cy="12.5" r="2.2" fill="#4ccf9c" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=604800, immutable" } },
  );
}
