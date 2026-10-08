# Elevate

**Know the job before you apply.** Elevate reads a real job posting, separates what it requires from what it mentions,
compares it with your resume, researches the employer's process, and builds preparation for that specific job.
Every claim carries its evidence: the posting, your resume, a source, or Elevate's own prediction.

```
apps/web          Next.js 16 web app + REST API (/api/v1)
apps/extension    Chromium MV3 side-panel extension (Chrome + Edge)
packages/core     Domain engine: schemas, extraction, providers, evidence verification, scoring, pipeline
supabase/         Postgres schema + row-level security
docs/             Architecture notes
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design.

## Quick start (local)

Requirements: Node 20.11+, Docker (for the local Supabase stack).

```bash
npm install
npx supabase start          # Postgres + Auth + local mail inbox; applies supabase/migrations
cp .env.example apps/web/.env.local   # then paste the URL + anon key printed by `supabase start`
npm run dev                 # http://localhost:3000
```

Sign in with any email. Locally, the magic link arrives in the Mailpit inbox at http://127.0.0.1:54324.

Without AI or research keys the product still works honestly. Jobs are extracted and stored, and requirements come
straight from the posting's own lists. Every unavailable step says which variables it needs. To enable everything, set:

| Capability | Variables |
| --- | --- |
| Job intelligence, resume parsing, comparison, plans, mock interviews | `GEMINI_API_KEY` **or** `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` **or** `AI_COMPAT_*` |
| Company / process / interview research | `TAVILY_API_KEY` **or** `BRAVE_SEARCH_API_KEY` **or** `SERPER_API_KEY` |
| Original resume file storage | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| Error monitoring | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |

`/diagnostics` runs live checks against each configured provider. It is open to anyone in development when
`DIAGNOSTICS_OPEN=true`, and in production only to the emails in `ADMIN_EMAILS`. A provider only shows as
"Verified" after a real request succeeds.

## Browser extension

See [apps/extension/README.md](apps/extension/README.md) for building, loading unpacked in Chrome/Edge, and pinning the
extension ID. Put the ID in `NEXT_PUBLIC_EXTENSION_IDS` so the API accepts its requests. Then connect the extension
from **Settings → Connect extension**.

## Tests

```bash
npm test -w @elevate/core        # extraction fixtures, evidence verification, scoring, SSRF, pipeline (isolation, failures, timeouts)
npm test -w @elevate/extension   # SSE parser, session refresh, capture sanitiser, permissions
# Row-level security against a real Supabase (local stack shown):
SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_ANON_KEY=... SUPABASE_TEST_SERVICE_ROLE_KEY=... npm test -w @elevate/web
npm run typecheck && npm run lint
```

## API

All endpoints require a Supabase session cookie (web) or `Authorization: Bearer <user JWT>` (extension). Inputs are
validated with zod, and errors return `{ error: { code, message, requestId } }`.

| Method | Path | |
| --- | --- | --- |
| POST | `/api/v1/jobs/analyze` | `{source:"capture",page}` · `{source:"url",url}` · `{source:"text",text,…}` |
| GET | `/api/v1/jobs` | `view=all\|saved\|applications\|archived`, `q`, `sort`, `status` |
| GET · PATCH · DELETE | `/api/v1/jobs/:id` | workspace view model · archive · delete |
| GET · POST | `/api/v1/jobs/:id/analysis` | latest analysis · re-run |
| GET | `/api/v1/analyses/:id/events` | Server-Sent Events of real pipeline events |
| POST | `/api/v1/jobs/:id/research` | refresh research |
| POST | `/api/v1/jobs/:id/candidate-analysis` | compare a resume version |
| POST | `/api/v1/jobs/:id/ats` | recompute ATS estimate (no AI call) |
| POST | `/api/v1/jobs/:id/preparation` | build plan `{durationDays, hoursPerDay}` |
| POST | `/api/v1/jobs/:id/mock-interview` | start practice `{mode}` |
| PUT | `/api/v1/jobs/:id/application` | track / update application |
| POST · DELETE | `/api/v1/jobs/:id/save` | save / unsave |
| GET · POST | `/api/v1/resumes` | list · upload (multipart PDF/DOCX or JSON text) |
| GET · PATCH | `/api/v1/applications`, `/api/v1/applications/:id` | |
| POST | `/api/v1/applications/:id/interviews` | record a scheduled interview |
| GET · POST | `/api/v1/mock-interviews/:id`, `…/answer`, `…/end` | |
| PATCH | `/api/v1/preparation-tasks/:id` | `{done}` |
| GET · PATCH | `/api/v1/me`, `/api/v1/notifications` | |
| POST | `/api/v1/auth/refresh` | extension session refresh |

## Deployment

- **Web:** Vercel-compatible. Set the env vars above and run `supabase db push` against the hosted project. Long routes
  declare `maxDuration` (analysis 300 s); on plans with lower limits the pipeline still ends in `TIMEOUT`, never pending.
- **Database/Auth:** Supabase. Add `${APP_URL}/auth/callback` to the Auth redirect URLs.
- **Storage:** Cloudflare R2 bucket, private, with an S3 API token scoped to that bucket.
- **Extension:** `npm run build -w @elevate/extension` with `ELEVATE_APP_URL` set to production, then `npm run zip`.
  Submit to the Chrome Web Store and Microsoft Edge Add-ons.

Nothing in this repository has been deployed.

## Known limitations

- **Live sites:** extraction adapters for LinkedIn, Indeed, Glassdoor, Workday and the other boards are built and tested
  on representative fixtures. Live Greenhouse and Lever pages were verified end to end; the others were not tested
  live. Sites that block automated reading are reported as blocked; use the extension or paste the description.
- **Not yet integrated:** Context.dev (no adapter yet; the research provider interface is ready for one) and an
  Anthropic-native provider (Claude can be used through OpenRouter or `AI_COMPAT_*`).
- **Languages:** only an English UI dictionary ships; strings live in `apps/web/lib/i18n/en.ts`, ready for more languages.
- **E2E automation:** there is no automated browser E2E suite yet. The workflow was exercised by hand against a local
  Supabase stack, and the AI stages are covered by pipeline tests with deterministic test doubles. They have not run
  against a real AI or research provider.
