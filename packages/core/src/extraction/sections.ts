/**
 * Deterministic text analysis of job descriptions: section segmentation and
 * explicit-only extraction of experience, education, salary, workplace and employment type.
 * Every helper returns null / [] unless the text states the value explicitly.
 */
import type {
  EducationLevel,
  EducationRequirement,
  EmploymentType,
  ExperienceRequirement,
  SalaryRange,
  WorkplaceType,
} from "../schemas/job";
import { EDUCATION_ORDINAL } from "../schemas/job";

// ---------------------------------------------------------------------------
// Section segmentation
// ---------------------------------------------------------------------------

export type SectionKind = "responsibilities" | "required" | "preferred" | "benefits" | "other";

export interface DescriptionSections {
  responsibilities: string[];
  requiredQualifications: string[];
  preferredQualifications: string[];
  benefits: string[];
}

const RESPONSIBILITY_HEADINGS: RegExp[] = [
  /^(?:(?:key|main|core|primary|principal|essential|your|job|the|role|major|general|daily|day[- ]to[- ]day|specific)\s+)*(?:responsibilities|duties|accountabilities|tasks|duties (?:and|&) responsibilities|responsibilities (?:and|&) duties)(?: of the (?:role|position|job|post))?(?: include)?$/,
  /^(?:roles?|job|position) (?:and|&) responsibilities$/,
  /^what (?:you'll|you will|you would|you'd|you) (?:be )?(?:do|doing|work on|achieve)(?: here| in this role| day[- ]to[- ]day| as an? [a-z ]+)?$/,
  /^(?:your|the) (?:role|mission|impact|day[- ]to[- ]day|job|position|responsibilities|key tasks)$/,
  /^(?:about|in) (?:the|this) (?:role|position|job)(?:,? you will)?$/,
  /^(?:role|position) (?:overview|summary|purpose)$/,
  /^(?:what the (?:job|role) involves|how you'll (?:contribute|make an impact)|the opportunity|main purpose of the (?:job|role)|in this role,? you will|you will|as an? [a-z ]+,? you will)$/,
];

const REQUIRED_HEADINGS: RegExp[] = [
  /^(?:(?:basic|minimum|required|essential|key|core|mandatory|necessary|job|the|general)\s+)*(?:requirements|qualifications|skills|criteria|competencies|experience|skills (?:and|&) (?:experience|qualifications|competencies|abilities)|qualifications (?:and|&) (?:experience|skills|requirements)|experience (?:and|&) (?:skills|qualifications)|requirements (?:and|&) (?:qualifications|skills)|knowledge,? skills,? (?:and|&) (?:abilities|experience))(?: required)?$/,
  /^what (?:you'll|you will|you) (?:need|bring|have)(?: to succeed| to the (?:role|table|team))?$/,
  /^what (?:we're|we are) looking for(?: in you)?$/,
  /^(?:who you are|about you|your profile|your background|your skills|your experience|you have|you are|you|the ideal candidate|ideal candidate|candidate profile|desired candidate profile|desired profile|person specification|who we're looking for|who we are looking for|is this you\??|must[- ]haves?|must have skills|essential criteria|eligibility(?: criteria)?|selection criteria|what it takes|to be successful(?: in this role)?(?:,? you will (?:need|have))?)$/,
];

const PREFERRED_HEADINGS: RegExp[] = [
  /^(?:preferred|desired|desirable|additional|bonus|nice[- ]to[- ]have|good[- ]to[- ]have)(?: (?:qualifications|skills|experience|requirements|criteria|attributes))?$/,
  /^(?:nice|good)[- ]to[- ]haves?$/,
  /^(?:bonus points?(?: if you have| for)?|pluses|extra credit|it would be great if you have|it'?s a plus if you have|even better if you have|ideally,? you(?:'ll)? (?:have|also have)|what would make you stand out|you might also have|preferred but not required)$/,
];

const BENEFIT_HEADINGS: RegExp[] = [
  /^(?:benefits|perks|perks (?:and|&) benefits|benefits (?:and|&) perks|compensation|compensation (?:and|&) benefits|salary (?:and|&) benefits|pay (?:and|&) benefits|rewards?|total rewards|rewards (?:and|&) benefits|employee benefits|our benefits|the package|package)$/,
  /^(?:what we offer|what we can offer(?: you)?|what (?:we|you) (?:offer|get)|what's in it for you|whats in it for you|why join us|why join|why work (?:with|for) us|we offer|our offer|what you'll get|what you will get|why you'll love working here)$/,
];

const OTHER_HEADINGS: RegExp[] = [
  /^about (?!the role$|this role$|the position$|this position$|the job$|this job$|you$)[\w&.,' -]{1,50}$/,
  /^(?:who we are|company overview|our company|our mission|our values|our culture|our story|how to apply|application process|to apply|apply now|equal (?:employment )?opportunit(?:y|ies)(?: employer)?|eeo statement|diversity(?:,? equity)?(?: (?:and|&) inclusion)?|location|job location|working hours|hours|schedule|salary|job description|description|overview|summary|job summary|position summary|additional information|next steps|the team|our team|important information|disclaimer|note|job details|details|contact|closing date|interview process|recruitment process|our hiring process|safeguarding|further information)$/,
];

/** Normalize a candidate heading line to a lowercase key, or null if it cannot be a heading. */
function headingKey(line: string): string | null {
  let s = line.trim();
  if (!s || /^[•\-*·▪◦●]/.test(s)) return null;
  s = s.replace(/^#{1,6}\s*/, "").replace(/^\*\*(.+?)\*\*:?$/, "$1").replace(/^__(.+?)__:?$/, "$1");
  s = s.replace(/^\d{1,2}[.)]\s+/, "");
  s = s.replace(/\s*[:：\-–—]+\s*$/, "").trim();
  if (!s || s.length > 70) return null;
  return s.toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, " ");
}

/** Classify a standalone line as a section heading. Returns null for non-headings. */
export function classifyHeading(line: string): SectionKind | null {
  const key = headingKey(line);
  if (!key) return null;
  if (RESPONSIBILITY_HEADINGS.some((r) => r.test(key))) return "responsibilities";
  if (PREFERRED_HEADINGS.some((r) => r.test(key))) return "preferred";
  if (REQUIRED_HEADINGS.some((r) => r.test(key))) return "required";
  if (BENEFIT_HEADINGS.some((r) => r.test(key))) return "benefits";
  if (OTHER_HEADINGS.some((r) => r.test(key))) return "other";
  return null;
}

const BULLET_RE = /^\s*(?:[•\-*·▪▫◦‣⁃●○■□►▸➢➤✓✔✗–—]|\d{1,2}[.)]|\(\d{1,2}\)|[a-z]\))\s+/;

/** Returns the text of a bullet line without its marker, or null if the line is not a bullet. */
export function stripBullet(line: string): string | null {
  const m = BULLET_RE.exec(line);
  if (!m) return null;
  return line.slice(m[0].length).trim();
}

const PREFERRED_MARKER = /\b(?:preferred|is a plus|a plus|nice to have|nice-to-have|desirable|advantageous|an advantage|bonus)\b/i;

/** Split description text into responsibilities / qualifications / benefits by headings. */
export function segmentSections(text: string | null | undefined): DescriptionSections {
  const out: DescriptionSections = {
    responsibilities: [],
    requiredQualifications: [],
    preferredQualifications: [],
    benefits: [],
  };
  if (!text) return out;
  const target = (k: SectionKind): string[] | null =>
    k === "responsibilities"
      ? out.responsibilities
      : k === "required"
        ? out.requiredQualifications
        : k === "preferred"
          ? out.preferredQualifications
          : k === "benefits"
            ? out.benefits
            : null;

  let current: SectionKind | null = null;
  let bullets: string[] = [];
  let shortLines: string[] = [];
  const flush = () => {
    const bucket = current ? target(current) : null;
    if (bucket) bucket.push(...(bullets.length ? bullets : shortLines));
    bullets = [];
    shortLines = [];
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const kind = classifyHeading(line);
    if (kind) {
      flush();
      current = kind;
      continue;
    }
    if (!current || current === "other") continue;
    const item = stripBullet(line);
    if (item !== null) {
      if (item) bullets.push(item);
    } else if (line.length <= 250 && !/[:：]$/.test(line)) {
      shortLines.push(line);
    }
  }
  flush();

  // Items explicitly marked as preferred inside a requirements list belong to preferred.
  const stillRequired: string[] = [];
  for (const item of out.requiredQualifications) {
    if (PREFERRED_MARKER.test(item) && !/\brequired\b/i.test(item)) out.preferredQualifications.push(item);
    else stillRequired.push(item);
  }
  out.requiredQualifications = stillRequired;
  return out;
}

// ---------------------------------------------------------------------------
// Shared text utilities
// ---------------------------------------------------------------------------

/** Split text into sentence-ish units (lines, then sentence boundaries). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    for (const s of t.split(/(?<=[.!?;])\s+(?=[A-Z(•\-])/)) {
      const v = (stripBullet(s) ?? s).trim();
      if (v) out.push(v);
    }
  }
  return out;
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20,
};

function toNumber(token: string): number | null {
  const t = token.toLowerCase();
  if (t in NUMBER_WORDS) return NUMBER_WORDS[t] ?? null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

const N = "(\\d{1,2}(?:\\.\\d)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty)";
const YRS = "(?:years?|yrs?)";
const EXP_RANGE = new RegExp(`\\b${N}\\s*\\+?\\s*(?:-|–|—|to)\\s*${N}\\s*\\+?\\s*${YRS}(?![\\w-])`, "i");
const EXP_PLUS = new RegExp(`\\b${N}\\s*\\+\\s*${YRS}(?![\\w-])|\\b${N}\\s*${YRS}\\s*\\+|\\b${N}\\s+or\\s+more\\s+${YRS}\\b|\\b${N}\\s*${YRS}\\s+or\\s+more\\b`, "i");
const EXP_MIN = new RegExp(`\\b(?:minimum(?:\\s+of)?|min\\.?|at\\s+least|over|more\\s+than|in\\s+excess\\s+of)\\s+${N}\\s*\\+?\\s*${YRS}\\b`, "i");
const EXP_PLAIN = new RegExp(`\\b${N}\\s*${YRS}(?:'|’)?(?![\\w-])`, "i");
const EXP_MONTHS = new RegExp(`\\b${N}\\s*\\+?\\s*months?(?:'|’)?\\b`, "i");

const EXP_KEYWORD = /\b(?:experience|experienced|exp\b|expertise|background|track record|post[- ]qualification|pqe|post[- ]registration|work(?:ing)? history|employment|industry|professional)/i;
const EXP_NEGATIVE = /\b(?:founded|established (?:in|for)|years old|years of age|aged\b|ago\b|anniversary|since (?:19|20)\d{2}|in business|(?:our|a|long|rich|proud) history|heritage|we have been|we've been|we have served|for over \d+ years,? we|celebrat\w*|contract (?:of|for|length|term)|fixed[- ]term|probation\w*|duration|warranty|guarantee|tenure of|lease|over the (?:past|last|next)|within (?:the )?(?:first|next))\b/i;

function capYears(n: number | null): number | null {
  if (n === null || !Number.isFinite(n) || n < 0 || n > 60) return null;
  return Math.round(n * 10) / 10;
}

/** Explicit years-of-experience requirement, or null. */
export function extractExperience(text: string | null | undefined): ExperienceRequirement | null {
  if (!text) return null;
  for (const sentence of splitSentences(text)) {
    // "five (5) years" → "five years"
    const s = sentence.replace(/\(\s*\d{1,2}\s*\)/g, " ").replace(/\s{2,}/g, " ");
    if (EXP_NEGATIVE.test(s)) continue;
    const hasKeyword = EXP_KEYWORD.test(s);
    let min: number | null = null;
    let max: number | null = null;
    let m: RegExpExecArray | null;
    if ((m = EXP_RANGE.exec(s))) {
      min = toNumber(m[1] ?? "");
      max = toNumber(m[2] ?? "");
    } else if ((m = EXP_PLUS.exec(s))) {
      min = toNumber(m[1] ?? m[2] ?? m[3] ?? m[4] ?? "");
    } else if ((m = EXP_MIN.exec(s))) {
      min = toNumber(m[1] ?? "");
    } else if (hasKeyword && (m = EXP_PLAIN.exec(s))) {
      min = toNumber(m[1] ?? "");
    } else if (hasKeyword && (m = EXP_MONTHS.exec(s))) {
      const months = toNumber(m[1] ?? "");
      min = months === null ? null : months / 12;
    }
    if (!m) continue;
    // Range/plus/min forms need some sign the number refers to experience, not e.g. a programme length.
    if (!hasKeyword && !/\b(?:in|of|as|working|with|managing|leading|within|across|delivering|teaching|nursing)\b/i.test(s.slice(m.index + m[0].length, m.index + m[0].length + 40))) {
      continue;
    }
    min = capYears(min);
    max = capYears(max);
    if (min === null && max === null) continue;
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    return { minYears: min, maxYears: max, raw: clip(sentence, 400) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

interface EducationMention {
  level: EducationLevel;
  sentence: string;
  /** Text after the matched degree, used to read fields of study. */
  tail: string;
  /** "Bachelor of Engineering" style field captured in the degree name itself. */
  ofField: string | null;
  licence: boolean;
}

const EDU_PATTERNS: Array<{ level: EducationLevel; re: RegExp; licence?: boolean }> = [
  { level: "doctorate", re: /\b(?:ph\.?\s?d\.?|doctorate|doctoral degree|d\.?phil|doctor of philosophy)(?![a-z])/gi },
  { level: "professional", re: /\b(?:mbbs|m\.?d\.?(?= degree)|juris doctor|j\.d\.|pharm\.?\s?d|doctor of (?:medicine|pharmacy|dental \w+|veterinary \w+)|dds|dvm)(?![a-z])/gi },
  { level: "master", re: /\b(?:master'?s|masters|master of ([a-z]+(?: (?!in\b|or\b|and\b|degree\b)[a-z]+)?)|m\.?sc\.?|msc|mba|m\.?tech|mtech|m\.e\.|m\.?eng|m\.a\.|m\.?ed\.?(?= degree)|m\.com|mcom|mca|m\.?phil|post[- ]?graduate(?: degree| diploma)?|pg diploma|pgdm|pgdba|llm)(?![a-z])/gi },
  { level: "master", re: /\b(?:MS|MA|ME)(?=\s*(?:degree|in\b|\/|or\b|\())|\bBS\/MS\b/g },
  { level: "bachelor", re: /\b(?:bachelor'?s|bachelors|bachelor of ([a-z]+(?: (?!in\b|or\b|and\b|degree\b)[a-z]+)?)|b\.?sc\.?|bsc|b\.?tech|btech|b\.e\.|b\.?eng|b\.a\.|b\.com|bcom|bba|bca|b\.?ed\.?(?= degree)|b\.ed|bsn|llb|undergraduate degree|university degree|any graduate|graduate in any|graduation)(?![a-z])/gi },
  { level: "bachelor", re: /\b(?:BS|BA|BE)(?=\s*(?:degree|in\b|\/|or\b|\())/g },
  { level: "associate", re: /\b(?:associate'?s degree|associate degree|associates degree|a\.a\.s\.?|foundation degree|hnd|higher national diploma)(?![a-z])/gi },
  // Secondary needs a qualification word: "Secondary School Teacher" is a job title, not a requirement.
  { level: "secondary", re: /\b(?:(?:high|secondary) school (?:diploma|education|certificate|graduate|qualification|leaving certificate|or equivalent)|completion of (?:high|secondary) school|secondary (?:education|school certificate|qualification)|ged|gcses?|a-levels?|12th(?: pass| grade| standard)?|10\+2|hsc|matric(?:ulation)?|leaving certificate)(?![a-z])/gi },
  { level: "vocational", re: /\b(?:diploma|trade certificate|trade qualification|apprenticeship|nvq(?: level \d)?|iti|polytechnic|vocational (?:qualification|training|certificate)|certificate (?:iii|iv|3|4) in|tafe|btec|city (?:and|&) guilds|professional certificate)(?![a-z])/gi },
  {
    level: "professional",
    licence: true,
    re: /\b(?:nmc (?:registration|registered|pin)|registered (?:general |mental health |adult |children's )?nurse|rn licen[cs]e|nursing licen[cs]e|(?:active|current|valid) (?:rn|nursing|teaching|professional) (?:licen[cs]e|registration)|qualified teacher status|qts|teaching (?:licen[cs]e|certificate|certification|registration)|ontario college of teachers|oct certification|licensed (?:professional engineer|practical nurse)|chartered (?:engineer|accountant)|cpa|acca|cima|cfa charter(?:holder)?|admitted to the bar|bar admission)(?![a-z])/gi,
  },
];

const LICENCE_CONTEXT = /\b(?:must|required|requirement|essential|hold|holding|valid|current|active|eligib\w*|registration|registered with|certified|licensed|qualified)\b/i;
const PREFERRED_CONTEXT = /\b(?:preferred|desirable|desired|nice to have|a plus|an advantage|advantageous|ideally|bonus)\b/i;
const EQUIVALENT_CONTEXT = /\bor (?:an? )?equivalent(?: practical| relevant| work| professional)? (?:experience|combination)/i;
const REQUIRED_CONTEXT = /\b(?:required|must|essential|minimum|mandatory|necessary|requirement)\b/i;
const NON_FIELD = /^(?:a |an |the )?(?:related|relevant|equivalent|similar|any|other|appropriate|comparable|discipline|field|subject)\b/i;

function readFields(m: EducationMention): string[] {
  const fields: string[] = [];
  const tailMatch = /^\s*(?:'s)?\s*(?:(?:or|and|\/)\s*(?:an?\s+)?(?:degree|diploma|bachelor'?s|master'?s)\s+)?(?:degree|qualification|diploma|programme|program)?\s*(?:\([^)]*\))?\s*(?:in|of)\s+([^.;:()\n]+)/i.exec(m.tail);
  let source = tailMatch?.[1] ?? null;
  if (!source && m.ofField && !/^(?:science|arts|the)$/i.test(m.ofField)) source = m.ofField;
  if (!source) return fields;
  source = source.split(/\b(?:or (?:a |an )?(?:related|equivalent|similar|relevant)|or equivalent|with\b|from\b|and (?:\d|at least|a minimum|experience)|is required|required|preferred|is preferred|is essential|essential|is desirable|desirable|plus\b|is a plus|from an accredited|\d)/i)[0] ?? "";
  // Split keeping separators: [piece, sep, piece, sep, piece].
  const parts = source.split(/(,|\/| or | and | & )/i);
  const pieces = parts.filter((_, i) => i % 2 === 0).map((p) => p.trim());
  const lastSep = (parts[parts.length - 2] ?? "").trim().toLowerCase();
  // "Mechanical or Production Engineering" → the one-word piece before the final "or" shares the noun.
  const lastWord = /\b(Engineering|Sciences?|Studies|Technology|Management|Administration|Design)$/i.exec(
    pieces[pieces.length - 1] ?? "",
  )?.[1];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i] ?? "";
    if (!piece) continue;
    const share =
      lastWord && i === pieces.length - 2 && ["or", "and", "/", "&"].includes(lastSep) && !/\s/.test(piece) && piece.toLowerCase() !== lastWord.toLowerCase();
    const p = (share ? `${piece} ${lastWord}` : piece).replace(/^(?:a|an|the)\s+/i, "").replace(/\s+(?:field|discipline)s?$/i, "");
    if (p.length < 2 || p.length > 60 || p.split(/\s+/).length > 5) continue;
    if (!/^[A-Za-z]/.test(p) || NON_FIELD.test(p)) continue;
    fields.push(p);
  }
  return fields;
}

/** Explicit education requirement (minimum level, fields, required/preferred), or null. */
export function extractEducation(text: string | null | undefined): EducationRequirement | null {
  if (!text) return null;
  const mentions: EducationMention[] = [];
  for (const sentence of splitSentences(text)) {
    // "high school diploma" is secondary, not vocational.
    const s = sentence.replace(/[’`´]/g, "'");
    const claimed: Array<[number, number]> = [];
    for (const p of EDU_PATTERNS) {
      p.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = p.re.exec(s))) {
        const start = m.index;
        const end = start + m[0].length;
        if (m[0].length === 0) {
          p.re.lastIndex++;
          continue;
        }
        if (claimed.some(([a, b]) => start < b && end > a)) continue;
        if (p.licence && !LICENCE_CONTEXT.test(s)) continue;
        claimed.push([start, end]);
        mentions.push({
          level: p.level,
          sentence,
          tail: s.slice(end, end + 160),
          ofField: m[1] ?? null,
          licence: Boolean(p.licence),
        });
      }
    }
  }
  if (!mentions.length) return null;
  const degrees = mentions.filter((m) => !m.licence);
  const pool = degrees.length ? degrees : mentions;
  const notPreferred = pool.filter((m) => !PREFERRED_CONTEXT.test(m.sentence));
  const candidates = notPreferred.length ? notPreferred : pool;
  let chosen = candidates[0] as EducationMention;
  for (const m of candidates) {
    if (EDUCATION_ORDINAL[m.level] < EDUCATION_ORDINAL[chosen.level]) chosen = m;
  }
  let required: boolean | null = null;
  if (PREFERRED_CONTEXT.test(chosen.sentence) && !REQUIRED_CONTEXT.test(chosen.sentence)) required = false;
  else if (EQUIVALENT_CONTEXT.test(chosen.sentence)) required = false;
  else if (REQUIRED_CONTEXT.test(chosen.sentence)) required = true;
  const fields: string[] = [];
  for (const m of candidates) {
    if (m.level !== chosen.level) continue;
    for (const f of readFields(m)) {
      if (!fields.some((x) => x.toLowerCase() === f.toLowerCase())) fields.push(f);
    }
  }
  return { minLevel: chosen.level, fields: fields.slice(0, 10), required, raw: clip(chosen.sentence, 400) };
}

// ---------------------------------------------------------------------------
// Salary
// ---------------------------------------------------------------------------

/** Currency tokens, longest first. `null` = the symbol is ambiguous across countries. */
const CURRENCY_TOKENS: Array<[string, string | null]> = [
  ["US$", "USD"], ["CA$", "CAD"], ["C$", "CAD"], ["AU$", "AUD"], ["A$", "AUD"], ["NZ$", "NZD"],
  ["S$", "SGD"], ["HK$", "HKD"], ["MX$", "MXN"], ["R$", "BRL"], ["₹", "INR"], ["£", "GBP"],
  ["€", "EUR"], ["₩", "KRW"], ["₦", "NGN"], ["₱", "PHP"], ["₪", "ILS"], ["₫", "VND"], ["₺", "TRY"],
  ["₽", "RUB"], ["৳", "BDT"], ["฿", "THB"], ["¥", null], ["$", null], ["Rs.", null], ["Rs", null],
  ["Dhs.", "AED"], ["Dhs", "AED"], ["Dh", "AED"], ["zł", "PLN"], ["RM", "MYR"], ["Rp", "IDR"],
];
const CURRENCY_CODES = [
  "USD", "CAD", "AUD", "NZD", "SGD", "HKD", "MXN", "BRL", "INR", "GBP", "EUR", "JPY", "CNY", "RMB",
  "KRW", "NGN", "PHP", "ILS", "VND", "TRY", "AED", "SAR", "QAR", "KWD", "BHD", "OMR", "EGP", "ZAR",
  "KES", "PKR", "BDT", "LKR", "NPR", "MYR", "IDR", "THB", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK",
  "HUF", "RON", "ARS", "COP", "CLP", "PEN", "TWD", "GHS", "MAD", "UAH", "RUB", "JOD",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SYMBOL_ALT = CURRENCY_TOKENS.map(([t]) => (/^[A-Za-z]/.test(t) ? `\\b${escapeRe(t)}` : escapeRe(t))).join("|");
const CODE_ALT = CURRENCY_CODES.join("|");
const CUR_BEFORE = `(?:\\b(?:${CODE_ALT})\\b|${SYMBOL_ALT})`;
const CUR_AFTER = `(?:\\b(?:${CODE_ALT})\\b|€|zł|₫|₽)`;
const NUM = "\\d{1,3}(?:(?:,\\d{2})*,\\d{3}|(?:[.\\u00a0\\u202f' ]\\d{3})+)(?:[.,]\\d{1,2})?(?!\\d)|\\d+(?:[.,]\\d{1,2})?(?!\\d)";
const MULT = "k\\b|K\\b|lakhs?\\b|lacs?\\b|LPA\\b|lpa\\b|L\\b|crores?\\b|cr\\b|million\\b|mn\\b|M\\b|m\\b";
const AMOUNT_RE = new RegExp(`(${CUR_BEFORE})?\\s?(${NUM})(?:\\s?(${MULT}))?(?:\\s?(${CUR_AFTER}))?`, "g");

const SALARY_CONTEXT = /salary|\bpay\b|\bpaid\b|compensation|remuneration|wage|stipend|\bctc\b|package|\bearn|\bote\b|\bbase\b|\brate\b|per (?:hour|annum|year|month|week|day)|\bp\.?a\.?\b|\/\s?(?:hr|hour|yr|year|month|mo|week|wk|day)\b|an hour|a year|a month|annual|monthly|hourly|\blpa\b|lakh|\bgross\b/i;
const SALARY_NEGATIVE = /\b(?:raised|funding|funded|revenue|valuation|series [a-e]\b|investors?|turnover|budget|assets|market cap|grants?\b|donat\w*|sales of|worth|customers|users|downloads|portfolio of)\b/i;

interface AmountToken {
  start: number;
  end: number;
  currencyBefore: string | null;
  num: string;
  mult: string | null;
  currencyAfter: string | null;
}

function currencyFromToken(tok: string | null): { known: boolean; code: string | null } {
  if (!tok) return { known: false, code: null };
  const t = tok.trim();
  const up = t.toUpperCase();
  if (CURRENCY_CODES.includes(up)) return { known: true, code: up === "RMB" ? "CNY" : up };
  const sym = CURRENCY_TOKENS.find(([s]) => s === t);
  if (sym) return { known: true, code: sym[1] };
  return { known: false, code: null };
}

/** Parse "1,20,000", "50.000", "85,000.50", "1.5" into a number. */
function parseNumber(raw: string): number | null {
  let s = raw.replace(/[  ' ]/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const thou = dec === "," ? "." : ",";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (hasComma) {
    const parts = s.split(",");
    const last = parts[parts.length - 1] ?? "";
    s = parts.length === 2 && last.length <= 2 ? s.replace(",", ".") : parts.join("");
  } else if (hasDot) {
    const parts = s.split(".");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length > 2 || last.length === 3) s = parts.join("");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function multiplier(mult: string | null): number {
  if (!mult) return 1;
  const m = mult.toLowerCase();
  if (m === "k") return 1e3;
  if (m.startsWith("lakh") || m.startsWith("lac") || m === "lpa" || m === "l") return 1e5;
  if (m.startsWith("crore") || m === "cr") return 1e7;
  if (m === "million" || m === "mn" || m === "m") return 1e6;
  return 1;
}

const PERIOD_PATTERNS: Array<[SalaryRange["period"], RegExp]> = [
  ["hour", /(?:\/\s?|\bper\s|\ban\s|\ba\s)(?:hour|hr|h)\b|\bhourly\b|\bp\/?h\b|\bpro stunde\b|\bpar heure\b|\bpor hora\b|\bstündlich/i],
  ["day", /(?:\/\s?|\bper\s|\ba\s)day\b|\bdaily\b|\bp\/d\b/i],
  ["week", /(?:\/\s?|\bper\s|\ba\s)(?:week|wk)\b|\bweekly\b|\bp\/?w\b/i],
  ["month", /(?:\/\s?|\bper\s|\ba\s)(?:month|mo|mth)\b|\bmonthly\b|\bp\/m\b|\bp\.m\.(?!\s*(?:to|-))|\bpro monat\b|\bmonatlich|\bpar mois\b|\bmensuel|\b(?:al|por) mes\b|\bmensual/i],
  ["year", /(?:\/\s?|\bper\s|\ba\s|\ban\s)(?:year|yr|annum)\b|\bannually\b|\byearly\b|\bp\.?a\.?(?![a-z])|\bannual\b|\blpa\b|\bctc\b|\bpro jahr\b|\bjährlich|\bpar an\b|\bannuel|\bal año|\banual\b|\bper jaar\b/i],
];

function detectPeriod(after: string, before: string, mult: string | null): SalaryRange["period"] {
  if (mult && mult.toLowerCase() === "lpa") return "year";
  for (const [period, re] of PERIOD_PATTERNS) if (re.test(after.slice(0, 60))) return period;
  const b = before.slice(-40);
  for (const [period, re] of PERIOD_PATTERNS) if (re.test(b)) return period;
  for (const [period, re] of PERIOD_PATTERNS) if (re.test(after)) return period;
  return null;
}

/**
 * Salary stated explicitly in text. Requires a currency symbol/code (or an Indian lakh/LPA unit)
 * next to a number, and salary context on the same line. A bare "$" yields currency null.
 */
export function extractSalaryFromText(text: string | null | undefined): SalaryRange | null {
  if (!text) return null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.length > 600 || SALARY_NEGATIVE.test(line)) continue;
    const tokens: AmountToken[] = [];
    AMOUNT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = AMOUNT_RE.exec(line))) {
      if (!m[0].trim()) {
        AMOUNT_RE.lastIndex++;
        continue;
      }
      const numStart = m.index + m[0].indexOf(m[2] ?? "");
      // Skip numbers glued to letters (e.g. "Q4", "B2B", "H1B").
      if (numStart > 0 && /[A-Za-z]/.test(line[numStart - 1] ?? "") && !m[1]) continue;
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        currencyBefore: m[1] ?? null,
        num: m[2] ?? "",
        mult: m[3] ?? null,
        currencyAfter: m[4] ?? null,
      });
    }
    for (let i = 0; i < tokens.length; i++) {
      const a = tokens[i] as AmountToken;
      let b: AmountToken | null = null;
      const next = tokens[i + 1];
      if (next && /^\s*(?:-|–|—|to|and|bis|à)\s*$/i.test(line.slice(a.end, next.start))) b = next;
      const curA = currencyFromToken(a.currencyBefore ?? a.currencyAfter);
      const curB = b ? currencyFromToken(b.currencyBefore ?? b.currencyAfter) : { known: false, code: null };
      const mult = b?.mult ?? a.mult;
      const indianUnit = Boolean(mult && /^(?:lakhs?|lacs?|lpa|crores?|cr|l)$/i.test(mult));
      if (!curA.known && !curB.known && !indianUnit) continue;
      if (mult === "L" && !curA.known && !curB.known && !/lakh|lpa|ctc|per annum/i.test(line)) continue;
      const end = b ? b.end : a.end;
      const after = line.slice(end);
      const before = line.slice(0, a.start);
      const period = detectPeriod(after, before, mult);
      if (!period && !SALARY_CONTEXT.test(line)) continue;
      const va = parseNumber(a.num);
      const vb = b ? parseNumber(b.num) : null;
      if (va === null) continue;
      // In "10-15 LPA" / "$80-100k" the unit after the second number applies to both.
      const minVal = va * multiplier(a.mult ?? (b ? b.mult : null));
      const maxVal = vb !== null ? vb * multiplier(b?.mult ?? a.mult) : null;
      if (minVal <= 0 || minVal > 1e10 || (maxVal !== null && (maxVal <= 0 || maxVal > 1e10))) continue;
      let min: number | null = minVal;
      let max: number | null = maxVal ?? minVal;
      if (maxVal === null) {
        if (/\b(?:up to|upto|max(?:imum)?(?: of)?)\s*$/i.test(before)) min = null;
        else if (/\b(?:from|starting (?:at|from)|min(?:imum)?(?: of)?|at least)\s*$/i.test(before)) max = null;
      }
      if (min !== null && max !== null && min > max) [min, max] = [max, min];
      // An explicit code anywhere in the range ("$140,000 - $170,000 USD") resolves an ambiguous symbol.
      const code =
        [a.currencyBefore, a.currencyAfter, b?.currencyBefore ?? null, b?.currencyAfter ?? null]
          .map((t) => currencyFromToken(t).code)
          .find((c) => c !== null) ?? null;
      return { currency: code, min, max, period, raw: clip(line, 300), source: "job_posting" };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Workplace / employment type
// ---------------------------------------------------------------------------

const HYBRID_RE = /\bhybrid\b(?!\s+(?:cloud|apps?|mobile|vehicles?|electric|cars?|engines?|powertrains?|integration|infrastructure|environments?|solutions?|systems?|architecture|it\b|seeds?|varieties|methods?|approach(?:es)?))|\b\d\s+days?\s+(?:a|per)\s+week\s+(?:in|at)\s+(?:the\s+|our\s+)?office\b/i;
const REMOTE_RE = /\b(?:fully|100%|completely|entirely)\s+remote\b|\bremote[- ](?:first|friendly|only|role|position|job|working|work|opportunity|based|eligible)\b|\bwork(?:ing)?\s+(?:from|at)\s+home\b|\bwfh\b|\b(?:location|workplace|work type|work arrangement|work model|work mode|working model)\s*:\s*remote\b|^remote$|\(remote\)|^remote\s*[-–(]|\bthis (?:is a|role is|position is) (?:fully )?remote\b|\bremote\s*(?:in|within|across)\s+[A-Z]/im;
const NOT_REMOTE_RE = /\b(?:not|no)\s+(?:a\s+)?remote\b|\bremote work is not\b/i;
const ONSITE_RE = /\b(?:fully|100%)\s+on[- ]?site\b|\bon[- ]?site\s+(?:role|position|job|work|working|only)\b|\b(?:work|working|based)\s+(?:on[- ]?site|in[- ]office|in the office|from (?:our|the) office)\b|\bin[- ]office\s+(?:role|position|job)\b|\boffice[- ]based\b|\b(?:location|workplace|work type|work arrangement|work model|work mode)\s*:\s*(?:on[- ]?site|in[- ]office|office)\b|^on[- ]?site$|\(on[- ]?site\)|\bthis (?:is an?|role is|position is) (?:on[- ]?site|in[- ]person)\b/im;

/** Workplace type only when the text says so explicitly. Conflicting signals → null. */
export function extractWorkplaceType(text: string | null | undefined): WorkplaceType | null {
  if (!text) return null;
  if (HYBRID_RE.test(text)) return "hybrid";
  const remote = REMOTE_RE.test(text) && !NOT_REMOTE_RE.test(text);
  const onsite = ONSITE_RE.test(text) || NOT_REMOTE_RE.test(text);
  if (remote && !onsite) return "remote";
  if (onsite && !remote) return "onsite";
  return null;
}

const EMPLOYMENT_PATTERNS: Array<[EmploymentType, RegExp]> = [
  ["internship", /\binternships?\b|\b(?:summer|paid|unpaid|graduate|research|engineering|marketing)\s+intern\b|^intern\b/im],
  ["apprenticeship", /\bapprenticeships?\b|\bapprentice\s+(?:role|position|programme|program)\b/i],
  ["per_diem", /\b[Pp]er[- ][Dd]iem\b|\bPRN\b/],
  ["volunteer", /\bvolunteer\s+(?:role|position|opportunity|basis)\b|\bunpaid volunteer\b/i],
  ["temporary", /\btemporary\s+(?:role|position|job|assignment|contract|basis|post)\b|^temporary$|\btemp[- ]to[- ]perm\b|\bseasonal\s+(?:role|position|job|work)\b/im],
  ["contract", /\bcontract\s+(?:role|position|job|basis|assignment|post)\b|\bcontract[- ]to[- ]hire\b|\bon a contract\b|\bcontractor\s+(?:role|position)\b|\bfixed[- ]term(?:\s+contract)?\b|\bfreelance\s+(?:role|position|basis)\b|\b(?:employment|job|contract|engagement) type\s*:\s*contract\b|^contract$|\(contract\)|\b\d+[- ]months?\s+contract\b/im],
  ["part_time", /\bpart[- ]time\b/i],
  ["full_time", /\bfull[- ]time\b/i],
];

/** Employment type only when stated explicitly. Full-time and part-time both mentioned → null. */
export function extractEmploymentType(text: string | null | undefined): EmploymentType | null {
  if (!text) return null;
  const found = new Set<EmploymentType>();
  for (const [type, re] of EMPLOYMENT_PATTERNS) if (re.test(text)) found.add(type);
  for (const t of ["internship", "apprenticeship", "per_diem", "volunteer", "temporary", "contract"] as const) {
    if (found.has(t)) return t;
  }
  if (found.has("part_time") && found.has("full_time")) return null;
  if (found.has("part_time")) return "part_time";
  if (found.has("full_time")) return "full_time";
  return null;
}
