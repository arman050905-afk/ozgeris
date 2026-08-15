-- ÖZGERIS — Neon (Postgres) схемасы
-- Neon SQL Editor-де осыны бір рет орында.

create extension if not exists pgcrypto;

create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null unique,
  pass_hash  text not null,
  is_admin   boolean not null default false,
  active     boolean not null default false, -- төлем расталғанша аккаунт күтуде тұрады
  created_at timestamptz not null default now()
);

-- Бірінші admin-ды қолмен тағайында (өз email-ыңды қой):
-- update users set is_admin = true, active = true where email = 'сенің email-ың';

create table if not exists user_data (
  user_id    uuid primary key references users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- Қаржы модулі кеңеюі: AI көмекші + push ескертулер ----------
-- Ескі (production) базада бұл баған-кестелер жоқ болуы мүмкін — Neon SQL Editor-де
-- төмендегі блокты бір рет қолмен орында (идемпотентті, қайта орындасаң да қауіпсіз).

-- AI Қаржылық көмекші — LLM шақыруды күніне DAILY_LIMIT-ке дейін шектеу (api/ai-advice.js)
alter table users add column if not exists ai_calls_today int not null default 0;
alter table users add column if not exists ai_calls_reset_at date not null default current_date;

-- Нағыз браузер push ескертулері (бюджет асуы, қарыз мерзімі) — api/push/*.js, api/cron/check-alerts.js
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
