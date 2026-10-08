# Elevate — Architecture

```
                    USER
                      │
          ┌───────────┴───────────┐
       WEB APP (Next.js)     EXTENSION (MV3, Chrome + Edge)
          │   cookie session      │   bearer token (user's own JWT)
          └───────────┬───────────┘
              API LAYER  /api/v1/*  (apps/web/app/api)
                      │  auth · zod validation · CORS (extension IDs only) · structured logs
           APPLICATION SERVICES  (apps/web/lib/server/services)
       ┌──────────────┼──────────────┐
   JOB ENGINE     USER ENGINE      RESEARCH
   extraction     resumes          providers + synthesis
   (packages/core/src/extraction, analysis, research, resume, pipeline)
                      │
              AI ORCHESTRATOR  (packages/core/src/ai — provider abstraction)
       ┌──────────────┼──────────────┐
  SUPABASE POSTGRES   CLOUDFLARE R2   EXTERNAL APIs
  (RLS on every row)  (resume files)  (Gemini/OpenRouter/…, Tavily/Brave/Serper)
```

## Packages

| Path | Responsibility |
| --- | --- |
| `packages/core` | Framework-free domain logic: zod schemas, extraction engine, SSRF-safe fetch, AI and research provider abstractions, evidence verification, scoring, the analysis pipeline. Browser-safe entry `@elevate/core`, server entry `@elevate/core/server`. |
| `apps/web` | Next.js 16 app: UI, REST API, Supabase persistence (`AnalysisStore` implementation), R2 storage, Sentry. |
| `apps/extension` | Chromium MV3 side-panel extension. Captures the current page only on click and renders server state. |
| `supabase/migrations` | Schema, RLS policies, triggers. |

## Single source of truth

The database is the only store of jobs, analyses, research and candidate data. The web workspace and the
extension both render `GET /api/v1/jobs/:id` (the `JobWorkspace` view model). Neither client scores,
classifies or generates anything.

## Analysis pipeline

`packages/core/src/pipeline/analysis.ts`. One job analysis is a row in `job_analyses` with a status from the
state machine:

`CREATED → CAPTURED → (EXTRACTING) → CLASSIFYING → RESEARCHING → CANDIDATE_ANALYSIS → ATS → FIT → FINALIZING → COMPLETED | PARTIAL | FAILED | TIMEOUT`

- Each stage records `{ outcome, reason, startedAt, finishedAt, provider }` in `job_analyses.stages`.
- Each step writes a real event row to `analysis_events` (`analysis_started`, `job_extracted`, `requirements_extracted`,
  `research_started`, `research_completed`, `resume_analyzed`, `ats_completed`, `fit_completed`, `analysis_completed`, …).
  `GET /api/v1/analyses/:id/events` streams those rows as Server-Sent Events. The UI shows only stages the server reported.
- A stage that fails is recorded and the pipeline continues; the analysis ends `PARTIAL`. Missing providers are
  `unavailable` with the exact env vars required.
- A hard deadline (240 s) aborts every in-flight call and ends in `TIMEOUT`. `close_stale_analyses()` (SQL) closes any
  analysis that stopped reporting for 6 minutes, so nothing stays pending forever.
- Work runs after the HTTP response via Next's `after()` under the **user's own JWT**, so row-level security applies to
  background writes too.

## No-fabrication guarantees (enforced in code)

- **Extraction** order: JSON-LD → microdata → platform adapter → semantic DOM → meta. Fields are null unless present.
  Job boards are never the employer; `$` alone never becomes USD.
- **AI is an interpreter**: every requirement and skill must quote the posting; every research claim must quote a cited
  snippet; every candidate match must quote the resume. `QuoteIndex` verifies quotes; unverifiable items are dropped
  (or downgraded to a gap) and the count is shown to the user.
- **Scores** (`analysis/scoring.ts`) are deterministic functions of the job and resume, with every component, weight and
  reason returned. Components that can't be evaluated are `null` and excluded; the score is `null` (shown as "—") when
  there isn't enough evidence.
- **Evidence types** on every item: `verified`, `source_backed`, `candidate_reported`, `inferred`, `predicted`.
  Predicted content is labelled and visually distinct (dashed rule).
- Untrusted content (pages, resumes, snippets, answers) is fenced and neutralised before reaching a model
  (`ai/untrusted.ts`), and the model output is schema-validated.

## Job identity

Per user, unique on `(source_platform, source_job_id)`, then `canonical_url`, then `content_hash`. Re-submitting an
unchanged posting reuses the existing analysis (no new AI/research spend); a changed posting updates the same job.

## Security

- RLS owner policies on every table; child rows reference parents by composite `(id, user_id)` FKs so a user can't attach
  data to someone else's row. Verified by `apps/web/tests/rls.test.ts` against a real Postgres.
- SSRF: http/https only, default ports, no credentials in URLs, DNS resolved and private/loopback/link-local/metadata
  ranges rejected on every redirect hop, size and time limits. Bot walls and login walls are reported, never bypassed.
  Known gap: DNS rebinding between the check and the connection is not pinned (see README limitations).
- Resume files: magic-byte sniffing (not MIME), 5 MB cap, page cap, private R2 objects, 5-minute signed download URLs.
- Secrets exist only in server env. The extension holds only the user's own session tokens.
- Logs carry ids, stages, durations and statuses; content keys are redacted.

## Cost control

Research is cached per job for 7 days (`job_research.retrieved_at`) and refreshed only on request. Unchanged duplicate
jobs reuse their analysis. Analyses are rate-limited per user per hour. ATS recomputation (`POST /jobs/:id/ats`) uses no AI.
