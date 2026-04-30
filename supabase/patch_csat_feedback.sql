-- Production patch: add CSAT feedback storage if an older demo DB was created
-- before csat_feedback existed in schema.sql.

create extension if not exists "pgcrypto";

create table if not exists csat_feedback (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  customer_id text not null default 'web-demo',
  score integer not null check (score between 1 and 5),
  comment text,
  source text not null default 'web_chat',
  created_at timestamptz not null default now()
);

create index if not exists idx_csat_feedback_ticket_id
  on csat_feedback(ticket_id, created_at desc);

alter table csat_feedback enable row level security;
