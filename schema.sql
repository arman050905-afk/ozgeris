-- ÖZGERIS — Neon (Postgres) схемасы
-- Neon SQL Editor-де осыны бір рет орында.

create extension if not exists pgcrypto;

create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null unique,
  pass_hash  text not null,
  created_at timestamptz not null default now()
);

create table if not exists user_data (
  user_id    uuid primary key references users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
