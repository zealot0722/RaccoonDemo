create extension if not exists "pgcrypto";

create table if not exists faq_articles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  question text not null,
  keywords text[] not null default '{}',
  answer text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_zh text not null,
  name_original text,
  category text not null,
  price integer not null check (price >= 0),
  image_url text not null,
  product_url text not null,
  description_zh text not null,
  tags text[] not null default '{}',
  use_cases text[] not null default '{}',
  stock_status text not null default '有庫存',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique,
  customer_id text not null default 'web-demo',
  status text not null default 'auto_replied',
  summary text,
  intent text,
  priority text not null default 'normal',
  handoff_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  role text not null check (role in ('customer', 'ai', 'agent', 'system')),
  content text not null,
  staff_name text,
  created_at timestamptz not null default now()
);

create table if not exists ai_decisions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  intent text not null,
  confidence numeric(4,3) not null default 0,
  tone text not null default 'neutral',
  decision text not null check (decision in ('auto_reply', 'needs_review', 'error')),
  reasons jsonb not null default '[]'::jsonb,
  risk_flags jsonb not null default '[]'::jsonb,
  matched_faq_code text,
  recommended_product_codes jsonb not null default '[]'::jsonb,
  handoff_reason text,
  raw_classification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tickets_created_at on tickets(created_at desc);
create index if not exists idx_messages_ticket_id on messages(ticket_id, created_at);
create index if not exists idx_ai_decisions_ticket_id on ai_decisions(ticket_id, created_at desc);
create index if not exists idx_products_code on products(code);
create index if not exists idx_faq_articles_code on faq_articles(code);

alter table faq_articles enable row level security;
alter table products enable row level security;
alter table tickets enable row level security;
alter table messages enable row level security;
alter table ai_decisions enable row level security;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tickets_set_updated_at on tickets;
create trigger tickets_set_updated_at
before update on tickets
for each row execute function set_updated_at();
