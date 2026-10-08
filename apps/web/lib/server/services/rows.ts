import "server-only";
import type {
  AnalysisStatus,
  AtsResult,
  ExtractionReport,
  FitResult,
  InterviewQuestion,
  JobIntelligence,
  NormalizedJob,
  ParsedResume,
  RequirementMatch,
  ResearchClaim,
  ResearchSource,
  RoleClassification,
  Stages,
} from "@elevate/core/server";

/* Database row shapes (snake_case) and mappers to domain types. */

export interface JobRow {
  id: string;
  user_id: string;
  canonical_url: string | null;
  source_platform: NormalizedJob["sourcePlatform"];
  source_job_id: string | null;
  content_hash: string;
  title: string | null;
  company: string | null;
  company_website: string | null;
  location: string | null;
  country: string | null;
  workplace_type: NormalizedJob["workplaceType"];
  employment_type: NormalizedJob["employmentType"];
  posted_at: string | null;
  valid_through: string | null;
  description: string | null;
  responsibilities: string[];
  required_qualifications: string[];
  preferred_qualifications: string[];
  benefits: string[];
  education: NormalizedJob["education"];
  experience: NormalizedJob["experience"];
  salary: NormalizedJob["salary"];
  application_url: string | null;
  extraction: ExtractionReport | Record<string, never>;
  captured_via: "extension" | "url" | "text";
  archived_at: string | null;
  retrieved_at: string;
  created_at: string;
  updated_at: string;
}

const iso = (s: string | null) => (s ? new Date(s).toISOString() : null);

export function rowToJob(r: JobRow): NormalizedJob {
  return {
    canonicalUrl: r.canonical_url,
    sourcePlatform: r.source_platform,
    sourceJobId: r.source_job_id,
    title: r.title,
    company: r.company,
    companyWebsite: r.company_website,
    location: r.location,
    country: r.country,
    workplaceType: r.workplace_type,
    employmentType: r.employment_type,
    postedAt: iso(r.posted_at),
    validThrough: iso(r.valid_through),
    description: r.description,
    responsibilities: r.responsibilities ?? [],
    requiredQualifications: r.required_qualifications ?? [],
    preferredQualifications: r.preferred_qualifications ?? [],
    benefits: r.benefits ?? [],
    education: r.education,
    experience: r.experience,
    salary: r.salary,
    applicationUrl: r.application_url,
  };
}

export function jobToRow(j: NormalizedJob) {
  return {
    canonical_url: j.canonicalUrl,
    source_platform: j.sourcePlatform,
    source_job_id: j.sourceJobId,
    title: j.title,
    company: j.company,
    company_website: j.companyWebsite,
    location: j.location,
    country: j.country,
    workplace_type: j.workplaceType,
    employment_type: j.employmentType,
    posted_at: j.postedAt,
    valid_through: j.validThrough,
    description: j.description,
    responsibilities: j.responsibilities,
    required_qualifications: j.requiredQualifications,
    preferred_qualifications: j.preferredQualifications,
    benefits: j.benefits,
    education: j.education,
    experience: j.experience,
    salary: j.salary,
    application_url: j.applicationUrl,
  };
}

export interface AnalysisRow {
  id: string;
  user_id: string;
  job_id: string;
  resume_version_id: string | null;
  status: AnalysisStatus;
  stages: Stages;
  error: { code: string; message: string } | null;
  classification: RoleClassification | null;
  intelligence: JobIntelligence | null;
  questions: InterviewQuestion[];
  predicted_process: { step: string; description: string }[];
  provider: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceRow {
  id: string;
  job_id: string;
  provider: string;
  query: string;
  url: string;
  domain: string;
  title: string;
  snippet: string;
  kind: ResearchSource["kind"];
  scope: "company" | "role";
  published_at: string | null;
  retrieved_at: string;
}

export const rowToSource = (r: SourceRow): ResearchSource & { scope: "company" | "role" } => ({
  id: r.id,
  provider: r.provider,
  query: r.query,
  url: r.url,
  domain: r.domain,
  title: r.title,
  snippet: r.snippet,
  kind: r.kind,
  publishedAt: r.published_at,
  retrievedAt: r.retrieved_at,
  scope: r.scope,
});

export interface EvidenceRow {
  id: string;
  job_id: string;
  kind: ResearchClaim["kind"];
  text: string;
  ord: number | null;
  category: string | null;
  scope: "company" | "role";
  evidence_type: ResearchClaim["evidence"]["type"];
  quote: string | null;
  source_ids: string[];
}

export const rowToClaim = (r: EvidenceRow): ResearchClaim => ({
  id: r.id,
  kind: r.kind,
  text: r.text,
  order: r.ord,
  category: r.category,
  scope: r.scope,
  evidence: { type: r.evidence_type, origin: "research", quote: r.quote, sourceIds: r.source_ids ?? [] },
});

export interface ResumeVersionRow {
  id: string;
  user_id: string;
  resume_id: string;
  version: number;
  source_type: "pdf" | "docx" | "text";
  file_name: string | null;
  mime_type: string | null;
  byte_size: number | null;
  storage_key: string | null;
  content_hash: string;
  raw_text: string;
  parse_status: "pending" | "parsed" | "text_only" | "failed";
  parsed: ParsedResume | null;
  parse_warnings: string[];
  parse_provider: string | null;
  created_at: string;
}

export interface CandidateRow {
  id: string;
  job_id: string;
  job_analysis_id: string;
  resume_version_id: string;
  matches: RequirementMatch[] | null;
  provider: string | null;
  created_at: string;
  ats_analyses: { score: number | null; result: AtsResult }[];
  fit_analyses: { score: number | null; result: FitResult }[];
}
