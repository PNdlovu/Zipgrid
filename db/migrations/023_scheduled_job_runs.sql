-- 023_scheduled_job_runs.sql
-- Bookkeeping for the scheduler (POST /api/v1/cron/tick).
-- Daily jobs claim one row per job per UTC day before running, so overlapping
-- ticks never run them twice and a failed run (row deleted) is retried on the
-- next tick. The rows double as a history of daily job results.

CREATE TABLE IF NOT EXISTS scheduled_job_runs (
    job_name     VARCHAR(60) NOT NULL,
    run_date     DATE        NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at  TIMESTAMPTZ,
    result       JSONB,
    error        TEXT,
    PRIMARY KEY (job_name, run_date)
);
