/**
 * Verifies that a quote produced by the AI actually exists in the source text.
 * Anything the AI "quotes" that is not in the source is treated as unverified and dropped or downgraded.
 */

function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[•·▪●◦■•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPunct(s: string): string {
  return s.replace(/[^\p{L}\p{N}+#]+/gu, " ").replace(/\s+/g, " ").trim();
}

export class QuoteIndex {
  private readonly norm: string;
  private readonly bare: string;
  constructor(source: string) {
    this.norm = normalize(source);
    this.bare = stripPunct(this.norm);
  }

  /** True when `quote` appears in the source (ignoring case, whitespace, punctuation and quote style). */
  contains(quote: string | null | undefined): boolean {
    if (!quote) return false;
    const q = normalize(quote).replace(/^\.{3}|\.{3}$/g, "").trim();
    if (q.length < 2) return false;
    if (this.norm.includes(q)) return true;
    const bq = stripPunct(q);
    return bq.length >= 2 && this.bare.includes(bq);
  }
}

/** Escape a term for use in a word-boundary regex that tolerates symbols like C++, C#, .NET. */
export function termRegex(term: string): RegExp {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}+#])`, "iu");
}

export function containsTerm(haystack: string, term: string): boolean {
  if (!term.trim()) return false;
  return termRegex(term).test(normalize(haystack));
}

export const normalizeForMatch = normalize;
