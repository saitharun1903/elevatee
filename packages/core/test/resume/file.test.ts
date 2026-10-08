import { describe, expect, it } from "vitest";
import { extractResumeText, sniffResumeType } from "../../src/resume/file";

/** Builds a minimal, valid single-page PDF containing the given lines (Helvetica, WinAnsi). */
function makePdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = ["BT", "/F1 11 Tf", "50 760 Td", "14 TL", ...lines.map((l) => `(${esc(l)}) '`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

const LINES = [
  "Mateo Rojas - Civil Engineer",
  "mateo.rojas@example.test",
  "Experience",
  "Site Engineer, Constructora Andina, 2019-02 to present",
  "Supervised reinforced concrete works for a 12-storey residential building.",
  "Prepared bills of quantities and coordinated subcontractors on site.",
  "Education",
  "Ingenieria Civil, Universidad de Chile",
  "Skills: AutoCAD, Civil 3D, structural inspection, quantity surveying",
];

describe("resume files", () => {
  it("extracts text from a real PDF", async () => {
    const { type, text, pages } = await extractResumeText(makePdf(LINES));
    expect(type).toBe("pdf");
    expect(pages).toBe(1);
    expect(text).toContain("Constructora Andina");
    expect(text).toContain("AutoCAD");
  });

  it("detects type from bytes, not from the file name", () => {
    expect(sniffResumeType(new TextEncoder().encode("%PDF-1.7 ..."))).toBe("pdf");
    expect(sniffResumeType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe("docx");
    expect(sniffResumeType(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
  });

  it("rejects non-resume uploads and damaged files", async () => {
    await expect(extractResumeText(new TextEncoder().encode("MZ executable"))).rejects.toMatchObject({ code: "unsupported_file" });
    await expect(extractResumeText(new TextEncoder().encode("%PDF-1.4 garbage"))).rejects.toMatchObject({ code: "parse_failed" });
    await expect(extractResumeText(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).rejects.toMatchObject({ code: "parse_failed" });
    await expect(extractResumeText(new Uint8Array(6 * 1024 * 1024))).rejects.toMatchObject({ code: "unsupported_file" });
  });

  it("rejects image-only PDFs with almost no text", async () => {
    await expect(extractResumeText(makePdf(["Hi"]))).rejects.toMatchObject({ code: "parse_failed" });
  });
});
