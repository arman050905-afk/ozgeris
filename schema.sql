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
  email_verified       boolean not null default false, -- поштаға жіберілген кодты растағанша true болмайды
  verify_code          text,          -- ағымдағы 6 таңбалы растау коды (расталғаннан кейін null)
  verify_code_expires  timestamptz,   -- кодтың жарамдылық мерзімі (15 минут)
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

-- Еске салғыштың соңғы жіберілген уақыты — тек api/cron/check-alerts.js жазады/оқиды, СЕРВЕРЛІК.
-- Қасақана user_data.data jsonb ішінде емес: ол толығымен клиенттің syncToCloud()-ы арқылы
-- үстінен жазылып тұрады, сол жерде сақтасақ, келесі синхронда клиент ескі мәнмен қайта басып
-- кетер еді (race condition). Бұл баған тек users кестесінде, клиент оны ешқашан жазбайды.
alter table users add column if not exists last_reminder_sent_at timestamptz;

-- ---------- Жазылым (Kaspi Pay → xpayment.kz) + email-воронка ----------
-- Қолмен орындау МІНДЕТТІ ЕМЕС: api/_billing.js-тегі ensureBillingSchema() бұл бағандар/кестені
-- бірінші сұраныста өзі қосады. Мұнда тек құжат ретінде тұр.
alter table users add column if not exists paid_until     timestamptz;                 -- ақылы жазылым осы уақытқа дейін (users.active = мәңгілік доступ)
alter table users add column if not exists funnel_stage   int not null default 0;      -- төлемегендерге қай сату хатына дейін жіберілді (0..4)
alter table users add column if not exists funnel_sent_at timestamptz;
alter table users add column if not exists renew_stage    int not null default 0;      -- ұзарту еске салғышы (0..3), әр төлемде 0-ге түседі
alter table users add column if not exists mail_optout    boolean not null default false; -- хаттан бас тартқан

create table if not exists payments (
  id         uuid primary key default gen_random_uuid(),   -- xpayment-ке merchant_order_id ретінде кетеді
  user_id    uuid not null references users(id) on delete cascade,
  phone      text not null,
  amount     int  not null,
  days       int  not null,
  status     text not null default 'NEW',                  -- NEW | PENDING | COMPLETED | CANCELLED | FAILED | EXPIRED
  xp_id      text,                                         -- xpayment payment id
  created_at timestamptz not null default now(),
  paid_at    timestamptz
);
create index if not exists payments_user_idx on payments (user_id, created_at desc);
create index if not exists payments_xp_idx on payments (xp_id);
