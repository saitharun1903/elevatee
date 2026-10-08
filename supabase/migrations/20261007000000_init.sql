-- Elevate — initial schema
-- Every user-owned table carries user_id and is protected by row level security.
-- Child tables reference parents through composite (id, user_id) foreign keys so a row can
-- never point at another user's data, even though FK checks bypass RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles & preferences
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  locale text check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  country char(2) check (country ~ '^[A-Z]{2}$'),
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  timezone text check (char_length(timezone) <= 64),
  target_roles text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  default_prep_days int check (default_prep_days between 1 and 60),
  product_analytics boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120), ''));
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Resumes (versioned, source text immutable)
-- ---------------------------------------------------------------------------

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index resumes_one_primary on public.resumes (user_id) where is_primary;

create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  resume_id uuid not null,
  version int not null check (version > 0),
  source_type text not null check (source_type in ('pdf', 'docx', 'text')),
  file_name text check (char_length(file_name) <= 255),
  mime_type text,
  byte_size int check (byte_size >= 0),
  storage_key text,
  content_hash text not null,
  raw_text text not null check (char_length(raw_text) <= 60000),
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsed', 'text_only', 'failed')),
  parsed jsonb,
  parse_warnings jsonb not null default '[]',
  parse_provider text,
  created_at timestamptz not null default now(),
  unique (resume_id, version),
  unique (id, user_id),
  foreign key (resume_id, user_id) references public.resumes (id, user_id) on delete cascade
);
create index resume_versions_user on public.resume_versions (user_id, created_at desc);

-- A version's source can never change once stored; analyses depend on it.
create or replace function public.protect_resume_source() returns trigger
language plpgsql as $$
begin
  if new.raw_text is distinct from old.raw_text
     or new.content_hash is distinct from old.content_hash
     or new.source_type is distinct from old.source_type
     or new.storage_key is distinct from old.storage_key
     or new.resume_id is distinct from old.resume_id
     or new.version is distinct from old.version
     or new.user_id is distinct from old.user_id then
    raise exception 'resume version source is immutable; create a new version instead';
  end if;
  return new;
end $$;
create trigger resume_versions_immutable before update on public.resume_versions
  for each row execute function public.protect_resume_source();

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  canonical_url text check (char_length(canonical_url) <= 2048),
  source_platform text not null,
  source_job_id text check (char_length(source_job_id) <= 200),
  content_hash text not null,
  title text,
  company text,
  company_website text,
  location text,
  country char(2),
  workplace_type text check (workplace_type in ('onsite', 'hybrid', 'remote')),
  employment_type text,
  posted_at timestamptz,
  valid_through timestamptz,
  description text check (char_length(description) <= 60000),
  responsibilities jsonb not null default '[]',
  required_qualifications jsonb not null default '[]',
  preferred_qualifications jsonb not null default '[]',
  benefits jsonb not null default '[]',
  education jsonb,
  experience jsonb,
  salary jsonb,
  application_url text,
  extraction jsonb not null default '{}',
  captured_via text not null check (captured_via in ('extension', 'url', 'text')),
  archived_at timestamptz,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
-- Job identity: platform id, canonical URL, then content hash. Never company alone.
create unique index jobs_platform_identity on public.jobs (user_id, source_platform, source_job_id) where source_job_id is not null;
create unique index jobs_url_identity on public.jobs (user_id, canonical_url) where canonical_url is not null;
create unique index jobs_content_identity on public.jobs (user_id, content_hash);
create index jobs_user_recent on public.jobs (user_id, created_at desc);

create table public.saved_jobs (
  user_id uuid not null,
  job_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Analyses
-- ---------------------------------------------------------------------------

create table public.job_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null,
  resume_version_id uuid,
  status text not null default 'CREATED' check (status in (
    'CREATED', 'CAPTURED', 'EXTRACTING', 'CLASSIFYING', 'RESEARCHING', 'CANDIDATE_ANALYSIS',
    'ATS', 'FIT', 'FINALIZING', 'COMPLETED', 'PARTIAL', 'FAILED', 'TIMEOUT')),
  stages jsonb not null default '{}',
  error jsonb,
  classification jsonb,
  intelligence jsonb,
  questions jsonb not null default '[]',
  predicted_process jsonb not null default '[]',
  provider text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade,
  foreign key (resume_version_id, user_id) references public.resume_versions (id, user_id) on delete set null (resume_version_id)
);
create index job_analyses_job on public.job_analyses (job_id, created_at desc);
create index job_analyses_user_active on public.job_analyses (user_id, updated_at) where status not in ('COMPLETED', 'PARTIAL', 'FAILED', 'TIMEOUT');

create table public.analysis_events (
  id bigint generated always as identity primary key,
  analysis_id uuid not null,
  user_id uuid not null,
  type text not null,
  stage text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (analysis_id, user_id) references public.job_analyses (id, user_id) on delete cascade
);
create index analysis_events_stream on public.analysis_events (analysis_id, id);

-- Closes analyses that stopped reporting (e.g. a server instance died). No analysis stays pending forever.
create or replace function public.close_stale_analyses(max_age interval default interval '6 minutes') returns int
language sql security invoker as $$
  with closed as (
    update public.job_analyses
       set status = 'TIMEOUT',
           error = jsonb_build_object('code', 'timeout', 'message', 'The analysis stopped responding and was closed. Run it again.'),
           completed_at = now()
     where user_id = (select auth.uid())
       and status not in ('COMPLETED', 'PARTIAL', 'FAILED', 'TIMEOUT')
       and updated_at < now() - max_age
    returning 1)
  select count(*)::int from closed;
$$;

-- ---------------------------------------------------------------------------
-- Research
-- ---------------------------------------------------------------------------

create table public.job_research (
  job_id uuid primary key,
  user_id uuid not null,
  status text not null check (status in ('completed', 'failed', 'unavailable')),
  provider text,
  note text,
  retrieved_at timestamptz not null,
  updated_at timestamptz not null default now(),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade
);

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null,
  provider text not null,
  query text not null,
  url text not null,
  domain text not null,
  title text not null,
  snippet text not null,
  kind text not null check (kind in ('official', 'candidate_report', 'publication', 'community', 'aggregator', 'other')),
  scope text not null check (scope in ('company', 'role')),
  published_at timestamptz,
  retrieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade
);
create index research_sources_job on public.research_sources (job_id);

create table public.interview_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null,
  kind text not null check (kind in ('company_fact', 'process_step', 'question', 'salary', 'development', 'culture')),
  text text not null,
  ord int,
  category text,
  scope text not null check (scope in ('company', 'role')),
  evidence_type text not null check (evidence_type in ('verified', 'source_backed', 'candidate_reported', 'inferred', 'predicted')),
  quote text,
  source_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade
);
create index interview_evidence_job on public.interview_evidence (job_id, kind);

-- ---------------------------------------------------------------------------
-- Candidate comparison, ATS, fit
-- ---------------------------------------------------------------------------

create table public.candidate_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null,
  job_analysis_id uuid not null,
  resume_version_id uuid not null,
  matches jsonb,
  provider text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade,
  foreign key (job_analysis_id, user_id) references public.job_analyses (id, user_id) on delete cascade,
  foreign key (resume_version_id, user_id) references public.resume_versions (id, user_id) on delete cascade
);
create index candidate_analyses_job on public.candidate_analyses (job_id, created_at desc);

create table public.ats_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  candidate_analysis_id uuid not null,
  job_id uuid not null,
  resume_version_id uuid not null,
  score int check (score between 0 and 100),
  result jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (candidate_analysis_id, user_id) references public.candidate_analyses (id, user_id) on delete cascade
);

create table public.fit_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  candidate_analysis_id uuid not null,
  job_id uuid not null,
  resume_version_id uuid not null,
  score int check (score between 0 and 100),
  result jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (candidate_analysis_id, user_id) references public.candidate_analyses (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Preparation
-- ---------------------------------------------------------------------------

create table public.preparation_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null,
  resume_version_id uuid,
  personalized boolean not null,
  title text not null,
  summary text,
  duration_days int not null check (duration_days between 1 and 60),
  hours_per_day numeric(4, 1) not null,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade,
  foreign key (resume_version_id, user_id) references public.resume_versions (id, user_id) on delete set null (resume_version_id)
);

create table public.preparation_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid not null,
  day int not null check (day >= 1),
  position int not null,
  title text not null,
  detail text,
  kind text not null,
  estimated_minutes int,
  basis text[] not null default '{}',
  basis_type text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.preparation_plans (id, user_id) on delete cascade
);
create index preparation_tasks_plan on public.preparation_tasks (plan_id, day, position);

-- ---------------------------------------------------------------------------
-- Mock interviews
-- ---------------------------------------------------------------------------

create table public.mock_interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null,
  resume_version_id uuid,
  mode text not null check (mode in ('technical', 'behavioral', 'recruiter', 'hiring_manager', 'domain', 'case_study', 'mixed')),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  context jsonb not null,
  summary jsonb,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (id, user_id),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade,
  foreign key (resume_version_id, user_id) references public.resume_versions (id, user_id) on delete set null (resume_version_id)
);
create index mock_interviews_user on public.mock_interviews (user_id, created_at desc);

create table public.mock_interview_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  mock_interview_id uuid not null,
  seq int not null,
  role text not null check (role in ('interviewer', 'candidate')),
  content text not null check (char_length(content) <= 8000),
  feedback jsonb,
  created_at timestamptz not null default now(),
  unique (mock_interview_id, seq),
  foreign key (mock_interview_id, user_id) references public.mock_interviews (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Applications & scheduled interviews
-- ---------------------------------------------------------------------------

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null,
  status text not null default 'interested' check (status in (
    'interested', 'applied', 'assessment', 'interview', 'final_round', 'offer', 'rejected', 'withdrawn', 'archived')),
  applied_at timestamptz,
  notes text check (char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, job_id),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade
);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid not null,
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);

create or replace function public.log_application_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.application_events (user_id, application_id, from_status, to_status)
    values (new.user_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status);
  end if;
  return new;
end $$;
create trigger applications_status_log after insert or update of status on public.applications
  for each row execute function public.log_application_status();

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid not null,
  scheduled_at timestamptz not null,
  timezone text not null,
  round text not null check (char_length(round) <= 120),
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);
create index interview_sessions_upcoming on public.interview_sessions (user_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- Notifications & product analytics
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text check (link ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, created_at desc);

create table public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name in ('job_analyzed', 'resume_uploaded', 'job_saved', 'application_updated', 'preparation_started', 'mock_interview_started')),
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['profiles', 'user_preferences', 'resumes', 'jobs', 'job_analyses', 'job_research',
                           'preparation_plans', 'mock_interviews', 'applications', 'interview_sessions']
  loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security: owners only
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
create policy profiles_owner on public.profiles for all
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['user_preferences', 'resumes', 'resume_versions', 'jobs', 'saved_jobs', 'job_analyses',
                           'analysis_events', 'job_research', 'research_sources', 'interview_evidence',
                           'candidate_analyses', 'ats_analyses', 'fit_analyses', 'preparation_plans',
                           'preparation_tasks', 'mock_interviews', 'mock_interview_turns', 'applications',
                           'application_events', 'interview_sessions', 'notifications']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_owner', t);
  end loop;
end $$;

-- Product events are write-only for clients.
alter table public.product_events enable row level security;
create policy product_events_insert on public.product_events for insert with check (user_id = (select auth.uid()));

-- Status history is append-only.
revoke update, delete on public.application_events from authenticated;
revoke update on public.analysis_events from authenticated;
