-- school76 mission schema (PostgreSQL 17).
--
-- This file is the single source of truth for the relational shape of the
-- mission state. It is applied idempotently by server/postgresState.ts on
-- startup, so adding a column here is enough to migrate an existing database.
--
-- Conventions:
--   * Text ids are kept as-is (`SAT-101`, `usr-artem`, ...) so the JSON seed and
--     the relational store share one identity space.
--   * Free-form structure the UI owns (checklists, tags, workspace JSON) is
--     stored as jsonb rather than shredded into extra tables: it is always read
--     and written as a whole document, and jsonb keeps that round-trip lossless.
--   * Timestamps are timestamptz; the API hands out ISO-8601 strings.

create table if not exists users (
  id                 text primary key,
  username           text        not null unique,
  display_name       text        not null,
  role               text        not null default '',
  subsystem          text        not null default 'OBC',
  bio                text        not null default '',
  skills             jsonb       not null default '[]'::jsonb,
  followers          jsonb       not null default '[]'::jsonb,
  following          jsonb       not null default '[]'::jsonb,
  joined_project_ids jsonb       not null default '[]'::jsonb,
  password_hash      text        not null,
  created_at         timestamptz not null default now()
);

create table if not exists projects (
  id              text primary key,
  slug            text        not null unique,
  name            text        not null,
  description     text        not null default '',
  category        text        not null default '',
  tags            jsonb       not null default '[]'::jsonb,
  owner_id        text        not null,
  member_ids      jsonb       not null default '[]'::jsonb,
  forgejo_repo    text        not null,
  github_repo     text,
  lifecycle_stage text,
  s3_bucket       text        not null,
  created_at      timestamptz not null default now(),
  constraint projects_lifecycle_stage_check
    check (lifecycle_stage is null or lifecycle_stage in ('design', 'assembly', 'testing', 'launch'))
);

create table if not exists tasks (
  id                text primary key,
  project_id        text        not null references projects (id) on delete cascade,
  title             text        not null,
  description       text        not null default '',
  subsystem         text        not null,
  status            text        not null default 'backlog',
  priority          text        not null default 'medium',
  assignee          text        not null default '',
  linked_program_id text,
  linked_channel    text,
  start_date        date,
  due_date          date,
  progress_pct      integer     not null default 0,
  depends_on        jsonb       not null default '[]'::jsonb,
  checklist         jsonb       not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint tasks_subsystem_check
    check (subsystem in ('OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND')),
  constraint tasks_status_check
    check (status in ('backlog', 'in_progress', 'review', 'done')),
  constraint tasks_priority_check
    check (priority in ('low', 'medium', 'high', 'critical')),
  constraint tasks_progress_check check (progress_pct between 0 and 100)
);

create index if not exists tasks_project_status_idx on tasks (project_id, status);
create index if not exists tasks_subsystem_idx on tasks (subsystem);

create table if not exists messages (
  id              text primary key,
  project_id      text        not null references projects (id) on delete cascade,
  channel         text        not null,
  author          text        not null,
  author_role     text        not null default '',
  text            text        not null,
  kind            text,
  command         text,
  task_ref_id     text,
  program_ref_id  text,
  code_snippet    jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists messages_project_channel_idx on messages (project_id, channel, created_at);

create table if not exists programs (
  id             text primary key,
  project_id     text        not null references projects (id) on delete cascade,
  name           text        not null,
  subsystem      text        not null,
  target_board   text        not null,
  author         text        not null default '',
  description    text        not null default '',
  workspace_json jsonb       not null default '{}'::jsonb,
  python_code    text        not null default '',
  cpp_code       text        not null default '',
  versions       jsonb       not null default '[]'::jsonb,
  updated_at     timestamptz not null default now(),
  constraint programs_subsystem_check
    check (subsystem in ('OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'))
);

create index if not exists programs_project_idx on programs (project_id);

create table if not exists posts (
  id            text primary key,
  project_id    text,
  author_id     text        not null,
  author_name   text        not null,
  author_handle text        not null default '',
  author_role   text        not null default '',
  text          text        not null,
  media_urls    jsonb       not null default '[]'::jsonb,
  likes         jsonb       not null default '[]'::jsonb,
  comments      jsonb       not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists posts_created_at_idx on posts (created_at desc);

create table if not exists crm_contacts (
  id              text primary key,
  first_name      text        not null,
  last_name       text        not null,
  email           text        not null,
  phone           text        not null default '',
  organization    text        not null,
  role            text        not null default '',
  subsystem_focus text        not null default 'OBC',
  segment         text        not null default 'school',
  notes           text        not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists crm_deals (
  id                  text primary key,
  title               text        not null,
  organization        text        not null default '',
  contact_id          text,
  stage               text        not null default 'lead',
  amount_rub          numeric(14, 2) not null default 0,
  probability_pct     integer     not null default 50,
  subsystem           text        not null default 'PAYLOAD',
  expected_close_date text,
  owner_name          text        not null default '',
  description         text        not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Bookkeeping for the JSON -> relational import, so re-running the app never
-- duplicates seed rows and an operator can see which snapshot was migrated.
create table if not exists schema_migrations (
  id         text primary key,
  applied_at timestamptz not null default now(),
  details    jsonb not null default '{}'::jsonb
);
