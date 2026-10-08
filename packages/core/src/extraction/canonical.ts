/**
 * URL → platform detection, job id extraction and canonicalization.
 * Uses only the WHATWG URL API (available in browsers and Node).
 */
import type { SourcePlatform } from "../schemas/job";

export interface PlatformInfo {
  platform: SourcePlatform;
  sourceJobId: string | null;
}

function safeUrl(url: string | null | undefined): URL | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

function bareHost(u: URL): string {
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

/** host === domain or a subdomain of it. */
function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Brand on any TLD, e.g. indeed.com, in.indeed.com, indeed.co.uk, de.indeed.com. */
function onBrand(host: string, brand: string): boolean {
  return new RegExp(`(^|\\.)${brand}\\.[a-z]{2,3}(\\.[a-z]{2})?$`).test(host);
}

/** Case-insensitive query param lookup. */
function param(u: URL, ...names: string[]): string | null {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const [k, v] of u.searchParams) {
    if (wanted.has(k.toLowerCase()) && v.trim()) return v.trim();
  }
  return null;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function cleanId(id: string | null | undefined): string | null {
  if (!id) return null;
  const t = id.trim();
  if (!t || t.length > 200 || !/^[\w.:-]+$/.test(t)) return null;
  return t;
}

export function detectPlatform(url: string): PlatformInfo {
  const u = safeUrl(url);
  if (!u) return { platform: "company_site", sourceJobId: null };
  const host = bareHost(u);
  const path = decodeURIComponentSafe(u.pathname);

  if (onDomain(host, "linkedin.com")) {
    const m = /\/jobs\/view\/(?:[^/]*?-)?(\d{6,})(?:[/?]|$)/.exec(path);
    return { platform: "linkedin", sourceJobId: cleanId(m?.[1] ?? param(u, "currentJobId")) };
  }
  if (onBrand(host, "indeed")) {
    return { platform: "indeed", sourceJobId: cleanId(param(u, "jk", "vjk")) };
  }
  if (onBrand(host, "glassdoor")) {
    const fromPath = /jobListingId=(\d+)/.exec(u.href)?.[1] ?? null;
    return { platform: "glassdoor", sourceJobId: cleanId(param(u, "jobListingId", "jl") ?? fromPath) };
  }
  if (onDomain(host, "wellfound.com") || onDomain(host, "angel.co")) {
    const m = /\/jobs\/(\d+)/.exec(path);
    return { platform: "wellfound", sourceJobId: cleanId(m?.[1]) };
  }
  if (onDomain(host, "internshala.com")) {
    const m = /\/(?:job|internship)s?\/detail\/[^/]*?(\d{5,})\/?$/.exec(path);
    return { platform: "internshala", sourceJobId: cleanId(m?.[1]) };
  }
  if (onDomain(host, "dice.com")) {
    const m = new RegExp(`/job-detail/(${UUID})`, "i").exec(path) ?? /\/jobs\/detail\/[^/]+\/([\w-]+)/.exec(path);
    return { platform: "dice", sourceJobId: cleanId(m?.[1]) };
  }
  if (onBrand(host, "ziprecruiter")) {
    return { platform: "ziprecruiter", sourceJobId: cleanId(param(u, "jid", "lvk")) };
  }
  if (onBrand(host, "monster")) {
    const m = new RegExp(`(${UUID})`, "i").exec(path);
    return { platform: "monster", sourceJobId: cleanId(m?.[1] ?? param(u, "jobid", "id")) };
  }
  if (onDomain(host, "greenhouse.io")) {
    const m = /\/jobs\/(\d+)/.exec(path);
    return { platform: "greenhouse", sourceJobId: cleanId(m?.[1] ?? param(u, "token", "gh_jid")) };
  }
  if (onDomain(host, "lever.co")) {
    const m = new RegExp(`^/[^/]+/(${UUID})`, "i").exec(path);
    return { platform: "lever", sourceJobId: cleanId(m?.[1]) };
  }
  if (onDomain(host, "myworkdayjobs.com") || onDomain(host, "myworkdaysite.com") || /(^|\.)wd\d+\.myworkday/.test(host)) {
    const last = path.split("/").filter(Boolean).pop() ?? "";
    const m = /_([A-Za-z0-9][A-Za-z0-9-]*)$/.exec(last) ?? /\b((?:JR|R|REQ)-?\d{3,})\b/i.exec(path);
    return { platform: "workday", sourceJobId: cleanId(m?.[1]) };
  }
  if (onDomain(host, "smartrecruiters.com")) {
    const m = /^\/[^/]+\/(\d{6,})/.exec(path);
    return { platform: "smartrecruiters", sourceJobId: cleanId(m?.[1]) };
  }
  if (onDomain(host, "ashbyhq.com")) {
    const m = new RegExp(`^/[^/]+/(${UUID})`, "i").exec(path);
    return { platform: "ashby", sourceJobId: cleanId(m?.[1]) };
  }
  // Company career sites embedding a Greenhouse board.
  const ghJid = param(u, "gh_jid");
  if (ghJid) return { platform: "greenhouse", sourceJobId: cleanId(ghJid) };
  return { platform: "company_site", sourceJobId: null };
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Query params that only track the visit and never identify the job. Lowercase. */
const TRACKING_PARAMS = new Set([
  "gclid", "gclsrc", "dclid", "fbclid", "msclkid", "yclid", "twclid", "ttclid", "li_fat_id",
  "igshid", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "hsctatracking", "mkt_tok", "ref", "refid",
  "referer", "referrer", "trackingid", "tracking_id", "src", "source", "trk", "trkinfo", "lipi",
  "midtoken", "midsig", "eba", "originalsubdomain", "si", "from", "campaign", "cmp", "cid",
  "gh_src", "lever-source", "lever-origin", "lever-via", "source_id", "sourceid", "share_id",
  "shareid", "feature", "position", "pagenum", "alternatechannel", "tk", "advn", "adid", "ad",
  "sjdu", "acatk", "pub", "xpse", "xfps", "xkcb", "vjs", "iris", "ao", "guid", "uido", "utm",
  "_ga", "_gl", "rcm", "ebp", "recommendedflavor", "refererpage", "click_id", "clickid",
]);

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return k.startsWith("utm_") || k.startsWith("pk_") || k.startsWith("mtm_") || TRACKING_PARAMS.has(k);
}

/**
 * Canonical form of a job URL: lowercase host, no fragment, no tracking params, sorted params.
 * LinkedIn and Indeed collapse to their stable job view URLs. Returns null for invalid URLs.
 */
export function canonicalizeUrl(url: string): string | null {
  const u = safeUrl(url);
  if (!u) return null;
  const { platform, sourceJobId } = detectPlatform(u.href);
  const host = u.hostname.toLowerCase();
  if (platform === "linkedin" && sourceJobId) return `https://www.linkedin.com/jobs/view/${sourceJobId}/`;
  if (platform === "indeed" && sourceJobId) return `https://${host}/viewjob?jk=${encodeURIComponent(sourceJobId)}`;

  const out = new URL(u.href);
  out.hostname = host;
  out.hash = "";
  out.username = "";
  out.password = "";
  if ((out.protocol === "https:" && out.port === "443") || (out.protocol === "http:" && out.port === "80")) out.port = "";
  const kept: Array<[string, string]> = [];
  for (const [k, v] of u.searchParams) {
    if (!isTrackingParam(k)) kept.push([k, v]);
  }
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  out.search = "";
  for (const [k, v] of kept) out.searchParams.append(k, v);
  let s = out.toString();
  if (s.endsWith("?")) s = s.slice(0, -1);
  return s;
}

/** Second-level brands of job boards / ATSes on any TLD. */
const BOARD_BRANDS = [
  "linkedin", "indeed", "glassdoor", "monster", "ziprecruiter", "stepstone", "jobstreet", "seek",
  "naukri", "naukrigulf", "careerbuilder", "simplyhired", "jooble", "adzuna", "careerjet", "totaljobs",
  "xing", "jobsdb", "bayt", "gulftalent", "reed", "jobberman", "brightermonday", "computrabajo",
  "infojobs", "pracuj", "jobindex", "talent", "neuvoo", "workopolis", "eluta", "foundit",
  "timesjobs", "shine", "apna", "instahyre", "hirist", "cutshort", "iimjobs", "welcometothejungle",
  "otta", "hired", "dice", "wellfound", "internshala", "jobbank", "cv-library", "cwjobs", "jobsite",
  "workable", "recruitee", "teamtailor", "personio", "smartrecruiters", "greenhouse", "lever",
  "ashbyhq", "bamboohr", "jobvite", "icims", "taleo", "breezy", "applytojob", "jazzhr", "pinpointhq",
  "rippling", "freshteam", "zohorecruit", "keka", "darwinbox", "successfactors", "myworkdayjobs",
  "myworkdaysite", "workday", "oraclecloud", "ultipro", "paylocity", "paycomonline", "adp",
  "recruiterbox", "hrmdirect", "join", "jobylon", "homerun", "softgarden", "dvinci", "umantis",
];

const BOARD_DOMAINS = [
  "angel.co", "jobs.nhs.uk", "jobs.ac.uk", "jobs.gc.ca", "guidance.jobs",
  "builtin.com", "remoteok.com", "remotive.com", "weworkremotely.com",
  "flexjobs.com", "upwork.com", "fiverr.com", "glints.com", "kalibrr.com", "jobkorea.co.kr",
  "saramin.co.kr", "51job.com", "zhaopin.com", "bossjob.com", "mycareersfuture.gov.sg",
  "jobs.lever.co", "boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.ashbyhq.com",
  "jobs.smartrecruiters.com", "apply.workable.com", "hk.jobsdb.com", "efinancialcareers.com",
  "governmentjobs.com", "usajobs.gov", "civilservicejobs.service.gov.uk", "tes.com",
  "applytoeducation.com", "schoolspring.com", "healthecareers.com", "nurse.com", "vivian.com",
];

/** True for aggregator / ATS hosts. Such hosts must never be treated as the employer. */
export function isJobBoardHost(host: string): boolean {
  if (typeof host !== "string") return false;
  let h = host.trim().toLowerCase();
  if (h.includes("/")) {
    const u = safeUrl(h.startsWith("http") ? h : `https://${h}`);
    if (!u) return false;
    h = u.hostname;
  }
  h = h.replace(/^www\./, "").replace(/\.$/, "");
  if (!h) return false;
  if (BOARD_DOMAINS.some((d) => onDomain(h, d))) return true;
  return BOARD_BRANDS.some((b) => onBrand(h, b.replace(/[.-]/g, (c) => `\\${c}`)));
}

/** Display names of job boards / ATS vendors. A company equal to one of these is not an employer. */
const BOARD_NAMES = new Set([
  "linkedin", "linkedin jobs", "indeed", "indeed.com", "glassdoor", "wellfound", "angellist",
  "angellist talent", "internshala", "dice", "ziprecruiter", "monster", "monster.com", "greenhouse",
  "lever", "workday", "smartrecruiters", "ashby", "naukri", "naukri.com", "foundit", "seek",
  "reed", "reed.co.uk", "totaljobs", "stepstone", "xing", "bayt", "bayt.com", "jobstreet",
  "simplyhired", "careerbuilder", "workable", "jobvite", "icims", "taleo", "bamboohr", "teamtailor",
  "recruitee", "personio", "jooble", "adzuna", "google jobs", "nhs jobs", "otta",
  "welcome to the jungle", "built in", "builtin", "shine", "shine.com", "timesjobs", "apna",
  "instahyre", "cutshort", "hirist", "efinancialcareers", "talent.com", "careerjet", "jobsdb",
  "gulftalent", "naukrigulf", "remoteok", "we work remotely", "flexjobs", "upwork",
]);

/** True when a name is a job board / ATS brand ("LinkedIn", "Indeed.com", "Glassdoor"). */
export function isJobBoardName(name: string | null | undefined): boolean {
  if (!name) return false;
  const k = name.trim().toLowerCase().replace(/\s+/g, " ").replace(/^(www\.)/, "");
  return BOARD_NAMES.has(k) || BOARD_NAMES.has(k.replace(/\.(com|co\.uk|in|de|io|co)$/, ""));
}

/** Resolve a possibly relative URL against a base; returns null unless the result is http(s). */
export function resolveHttpUrl(value: unknown, base?: string | null): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = base ? new URL(value.trim(), base) : new URL(value.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function hostOf(url: string | null | undefined): string | null {
  const u = safeUrl(url);
  return u ? u.hostname.toLowerCase() : null;
}
