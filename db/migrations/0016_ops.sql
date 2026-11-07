-- =====================================================================
-- Operations: scheduled-job run log (for monitoring that cron is alive).
-- =====================================================================
create table shop.job_runs (
    id           bigint generated always as identity primary key,
    job          text not null check (char_length(job) <= 60),
    started_at   timestamptz not null default now(),
    finished_at  timestamptz,
    ok           boolean,
    details      jsonb,
    error        text check (char_length(error) <= 1000)
);
create index job_runs_job_idx on shop.job_runs (job, started_at desc);

do $$
begin
    execute 'alter table shop.job_runs enable row level security';
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;
