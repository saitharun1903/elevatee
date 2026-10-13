-- Hardening from the production review.

-- At most one in-flight analysis per job. Concurrent starts (double click, extension + web
-- capturing the same posting) now collide here instead of running two pipelines.
create unique index job_analyses_one_active on public.job_analyses (job_id)
  where status not in ('COMPLETED', 'PARTIAL', 'FAILED', 'TIMEOUT');

-- Indexes for RLS filters, embeds and cascades on hot paths.
create index if not exists resumes_user on public.resumes (user_id);
create index if not exists preparation_plans_job on public.preparation_plans (user_id, job_id, created_at desc);
create index if not exists ats_analyses_candidate on public.ats_analyses (candidate_analysis_id);
create index if not exists fit_analyses_candidate on public.fit_analyses (candidate_analysis_id);
create index if not exists application_events_application on public.application_events (application_id, created_at desc);
create index if not exists interview_sessions_application on public.interview_sessions (application_id);
create index if not exists job_analyses_user_created on public.job_analyses (user_id, created_at desc);
create index if not exists mock_interview_turns_session on public.mock_interview_turns (mock_interview_id, seq);
create index if not exists saved_jobs_job on public.saved_jobs (job_id);
create index if not exists applications_job on public.applications (job_id);

-- Atomically make one resume primary. Unique indexes are checked row by row in PostgreSQL, so
-- clear the old primary first, then set the new one; both run in this function's transaction.
create or replace function public.set_primary_resume(target uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.resumes where id = target and user_id = (select auth.uid())) then
    return false;
  end if;
  update public.resumes set is_primary = false
   where user_id = (select auth.uid()) and is_primary and id <> target;
  update public.resumes set is_primary = true
   where id = target and user_id = (select auth.uid());
  return true;
end $$;
