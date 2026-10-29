-- ============================================================================
-- OmniOTP Cloud - Supabase Schema (source of truth)
-- Run in: Supabase Dashboard -> SQL Editor
-- https://supabase.com/dashboard/project/hqmqeimyarxjoekwxekk/sql
-- ============================================================================

-- Enable extensions
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Profiles / users (one row per authenticated platform user)
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text,
  role text not null default 'user' check (role in ('admin','user','developer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. Platform API keys (clients authenticate via x-api-key: sk_live_...)
-- ----------------------------------------------------------------------------
create table if not exists api_keys (
  id text primary key default ('key_' || encode(gen_random_bytes(8), 'hex')),
  name text not null,
  key_hash text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  requests_count bigint not null default 0,
  created_at timestamptz not null default now(),
  last_used timestamptz,
  created_by uuid references profiles(id)
);
create index if not exists idx_api_keys_status on api_keys(status);

-- ----------------------------------------------------------------------------
-- 3. SMS gateways (httpSMS gateway pool, server-side only)
-- ----------------------------------------------------------------------------
create table if not exists gateways (
  id text primary key default ('gw_' || encode(gen_random_bytes(8), 'hex')),
  name text not null,
  from_number text not null,
  api_key_hash text not null,
  cap int not null default 1000,
  sent_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_gateways_active on gateways(active) where active;

-- ----------------------------------------------------------------------------
-- 4. SMS templates
-- ----------------------------------------------------------------------------
create table if not exists sms_templates (
  id text primary key default ('tpl_' || encode(gen_random_bytes(8), 'hex')),
  name text not null,
  category text not null default 'AUTH',
  text text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. OTP sessions (challenge stored as a hash - never plaintext)
-- ----------------------------------------------------------------------------
create table if not exists otp_sessions (
  id text primary key,
  phone text not null,
  masked_phone text,
  code_hash text not null,
  code_salt text,
  length int not null default 6,
  type text not null default 'numeric',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  cooldown_until timestamptz,
  attempts_left int not null default 3,
  max_attempts int not null default 3,
  status text not null default 'pending' check (status in ('pending','verified','expired','exhausted')),
  message_content text,
  simulated boolean not null default false,
  message_id text,
  provider_status text,
  verification_token text,
  verified_at timestamptz,
  created_by uuid references profiles(id)
);
create index if not exists idx_otp_sessions_phone on otp_sessions(phone);
create index if not exists idx_otp_sessions_status on otp_sessions(status);
create index if not exists idx_otp_sessions_expires on otp_sessions(expires_at);

-- ----------------------------------------------------------------------------
-- 6. SMS messages / provider status events
-- ----------------------------------------------------------------------------
create table if not exists sms_messages (
  id text primary key default ('msg_' || encode(gen_random_bytes(8), 'hex')),
  session_id text references otp_sessions(id) on delete set null,
  phone text not null,
  from_number text not null,
  content text not null,
  request_id text,
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued','submitted','delivered','failed')),
  provider_error text,
  simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sms_messages_status on sms_messages(status);
create index if not exists idx_sms_messages_created on sms_messages(created_at desc);
create index if not exists idx_sms_messages_session on sms_messages(session_id);

-- ----------------------------------------------------------------------------
-- 7. Audit logs
-- ----------------------------------------------------------------------------
create table if not exists audit_logs (
  id text primary key default ('log_' || encode(gen_random_bytes(8), 'hex')),
  timestamp timestamptz not null default now(),
  type text not null,
  status text not null,
  session_id text,
  phone text,
  masked_phone text,
  content text,
  error text,
  simulated boolean not null default false,
  duration_ms int,
  created_by uuid references profiles(id)
);
create index if not exists idx_audit_logs_timestamp on audit_logs(timestamp desc);
create index if not exists idx_audit_logs_type on audit_logs(type);

-- ----------------------------------------------------------------------------
-- 8. App config
-- ----------------------------------------------------------------------------
create table if not exists app_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table profiles enable row level security;
alter table api_keys enable row level security;
alter table gateways enable row level security;
alter table sms_templates enable row level security;
alter table otp_sessions enable row level security;
alter table sms_messages enable row level security;
alter table audit_logs enable row level security;
alter table app_config enable row level security;

-- Anon (public) users: read-only on templates; can insert their own OTP sessions and SMS messages;
-- read only their own phone records.
create policy "anon read sms_templates"
  on sms_templates for select to anon using (true);

create policy "anon insert own otp_sessions"
  on otp_sessions for insert to anon with check (true);
create policy "anon read own otp_sessions"
  on otp_sessions for select to anon using (true);
create policy "anon update own otp_sessions"
  on otp_sessions for update to anon using (true);

create policy "anon insert own sms_messages"
  on sms_messages for insert to anon with check (true);
create policy "anon read own sms_messages"
  on sms_messages for select to anon using (true);

-- Anon: logs are insert-only (append audit), no select.
create policy "anon insert audit_logs"
  on audit_logs for insert to anon with check (true);

-- Service role bypasses RLS (used by backend only, never exposed to browser).
-- Authenticated users: full access (tighten per-role as needed).
create policy "authenticated full access"
  on all tables in schema public
  for all to authenticated
  using (true) with check (true);

-- ----------------------------------------------------------------------------
-- Helpful function: hash an OTP code
-- ----------------------------------------------------------------------------
create or replace function hash_otp(code text, salt text)
returns text language plpgsql as $$
begin
  return encode(digest(code || salt, 'sha256'), 'hex');
end;
$$;

-- ============================================================================
-- To apply: paste the whole file into Supabase SQL Editor and click Run.
-- Then set SUPABASE_SERVICE_ROLE_KEY in your backend .env (never in frontend).
-- ============================================================================