-- Client error reports: self-hosted error reporting, no third-party trackers.
--
-- The report-error Edge Function is the only writer (service role); there are
-- deliberately NO client policies at all - not even read. Rows carry no user
-- identifiers: message, stack, page path, app version, user agent. Read them
-- with psql on the host or Supabase Studio:
--   select at, version, page, message from client_errors order by at desc limit 50;
-- Retention is manual: delete from client_errors where at < now() - interval '90 days';

create table client_errors (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  message    text not null,
  stack      text,
  page       text,
  version    text,
  user_agent text
);

create index client_errors_at_idx on client_errors (at desc);

alter table client_errors enable row level security;
