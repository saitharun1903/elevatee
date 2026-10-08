import { ElevateError } from "../util/errors";
import { RESUME_LIMITS, type ResumeSourceType } from "../schemas";

/** Detect the real file type from magic bytes; never trust the client-provided MIME type or extension. */
export function sniffResumeType(bytes: Uint8Array): ResumeSourceType | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "pdf";
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "docx";
  return null;
}

export function cleanResumeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, RESUME_LIMITS.maxTextChars);
}

/** Extract plain text from a PDF or DOCX resume. Runs server-side only. */
export async function extractResumeText(bytes: Uint8Array): Promise<{ type: ResumeSourceType; text: string; pages: number | null }> {
  if (bytes.byteLength > RESUME_LIMITS.maxBytes) {
    throw new ElevateError("unsupported_file", "Resume files must be 5 MB or smaller.");
  }
  const type = sniffResumeType(bytes);
  if (!type) throw new ElevateError("unsupported_file", "Upload a PDF or DOCX file, or paste your resume as text.");

  let text = "";
  let pages: number | null = null;
  try {
    if (type === "pdf") {
      const { getDocumentProxy, extractText } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      pages = pdf.numPages;
      if (pages > 20) throw new ElevateError("unsupported_file", "That PDF has more than 20 pages. Upload your resume only.");
      const result = await extractText(pdf, { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    } else {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = result.value;
    }
  } catch (cause) {
    if (cause instanceof ElevateError) throw cause;
    throw new ElevateError("parse_failed", `We couldn't read that ${type.toUpperCase()} file. It may be encrypted, scanned as an image, or damaged. Try another file or paste the text.`, { cause });
  }
  text = cleanResumeText(text);
  if (text.length < RESUME_LIMITS.minTextChars) {
    throw new ElevateError(
      "parse_failed",
      "We found almost no text in that file. If it's a scanned image, export it as a text-based PDF or paste the text instead.",
    );
  }
  return { type, text, pages };
}
