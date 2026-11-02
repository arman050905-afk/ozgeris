const crypto = require('crypto');
const { sql } = require('./_db');

// Жазылым: Kaspi Pay → xpayment.kz (webhook береді) → users.paid_until ұзарады.
// XPAYMENT_API_KEY орнатылмаса, төлем батырмасы шықпайды (WhatsApp қалады) және email-воронка жүрмейді.
const PRICE_KZT = Number(process.env.PRICE_KZT) || 1990;
const PLAN_DAYS = Number(process.env.PLAN_DAYS) || 30;
const XP_BASE = 'https://api.xpayment.kz/v1';
const XP_KEY = process.env.XPAYMENT_API_KEY || '';
const XP_WEBHOOK_SECRET = process.env.XPAYMENT_WEBHOOK_SECRET || '';
const APP_URL = process.env.APP_URL || 'https://www.ozgeris.asia';

// Жаңа бағандар/кесте production базада өзі пайда болады — қолмен ALTER TABLE керек емес.
// Бәрі бар болса, бір ғана select жасап шығады (инстанс тірі тұрғанша қайталанбайды).
let schemaReady = null;
function ensureBillingSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const r = await sql`
        select
          (select count(*)::int from information_schema.columns
            where table_name = 'users'
              and column_name in ('paid_until','funnel_stage','funnel_sent_at','renew_stage','mail_optout')) as cols,
          to_regclass('public.payments') is not null as has_payments
      `;
      if (r[0].cols === 5 && r[0].has_payments) return;
      await sql`alter table users add column if not exists paid_until timestamptz`;
      await sql`alter table users add column if not exists funnel_stage int not null default 0`;
      await sql`alter table users add column if not exists funnel_sent_at timestamptz`;
      await sql`alter table users add column if not exists renew_stage int not null default 0`;
      await sql`alter table users add column if not exists mail_optout boolean not null default false`;
      await sql`
        create table if not exists payments (
          id         uuid primary key default gen_random_uuid(),
          user_id    uuid not null references users(id) on delete cascade,
          phone      text not null,
          amount     int  not null,
          days       int  not null,
          status     text not null default 'NEW',
          xp_id      text,
          created_at timestamptz not null default now(),
          paid_at    timestamptz
        )
      `;
      await sql`create index if not exists payments_user_idx on payments (user_id, created_at desc)`;
      await sql`create index if not exists payments_xp_idx on payments (xp_id)`;
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

// users.active — қолмен берілген мәңгілік доступ (ескі төлегендер, админ); paid_until — ақылы жазылым
function hasAccess(u) {
  return !!(u && (u.active || (u.paid_until && new Date(u.paid_until) > new Date())));
}

// 8 707 123 45 67 / 7071234567 / +7 (707) 123-45-67 → +77071234567
function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return /^7\d{10}$/.test(d) ? '+' + d : null;
}

async function xp(method, path, body, idempotencyKey) {
  const headers = { Authorization: 'Bearer ' + XP_KEY, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  const r = await fetch(XP_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  let json = {};
  try { json = await r.json(); } catch (e) {}
  if (!r.ok) {
    const errObj = json.error && typeof json.error === 'object' ? json.error : json;
    const err = new Error(errObj.message || (typeof json.error === 'string' ? json.error : '') || 'xpayment ' + r.status);
    err.status = r.status;
    err.code = errObj.code || (typeof json.error === 'string' ? json.error : null);
    throw err;
  }
  return json;
}

// Бір SQL ішінде: төлемді COMPLETED етеді де, тек сол сәтте ғана paid_until-ге күн қосады.
// Webhook пен клиенттің статус тексерісі қатар келсе де, күн екі рет қосылмайды.
async function markPaid(orderId) {
  const rows = await sql`
    with p as (
      update payments set status = 'COMPLETED', paid_at = now()
      where id = ${orderId} and status <> 'COMPLETED'
      returning user_id, days
    )
    update users u
    set paid_until = greatest(coalesce(u.paid_until, now()), now()) + make_interval(days => p.days),
        renew_stage = 0
    from p where u.id = p.user_id
    returning u.paid_until
  `;
  return rows[0] ? rows[0].paid_until : null;
}

const FINAL = { CANCELLED: 'CANCELLED', CANCELED: 'CANCELLED', FAILED: 'FAILED', EXPIRED: 'EXPIRED' };

// PENDING төлемнің нақты күйін xpayment-тен сұрап, базаға түсіреді (webhook келмей қалса да жұмыс істейді)
async function syncPayment(row) {
  if (!row || row.status !== 'PENDING' || !row.xp_id || !XP_KEY) return row ? row.status : null;
  const p = await xp('GET', '/payments/' + encodeURIComponent(row.xp_id));
  const st = String(p.status || '').toUpperCase();
  if (st === 'COMPLETED') {
    await markPaid(row.id);
    return 'COMPLETED';
  }
  if (FINAL[st]) {
    await sql`update payments set status = ${FINAL[st]} where id = ${row.id} and status = 'PENDING'`;
    return FINAL[st];
  }
  return 'PENDING';
}

// X-xPayment-Signature = lowercase_hex(HMAC-SHA256(secret, raw_body)). Vercel денені алдын ала
// JSON етіп оқып қоятындықтан, бірнеше нұсқаны (шикі дене, қайта сериализацияланған JSON) тексереміз —
// құпиясыз дұрыс HMAC жасау мүмкін емес, сондықтан бұл қауіпсіздікті әлсіретпейді.
function verifyWebhookSignature(rawCandidates, signature) {
  if (!XP_WEBHOOK_SECRET || !/^[0-9a-f]{64}$/i.test(String(signature || ''))) return false;
  const want = Buffer.from(String(signature).toLowerCase(), 'hex');
  return rawCandidates.some((raw) => {
    if (raw == null) return false;
    const got = crypto.createHmac('sha256', XP_WEBHOOK_SECRET).update(raw).digest();
    return crypto.timingSafeEqual(got, want);
  });
}

function unsubToken(userId) {
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update('unsub:' + userId).digest('hex').slice(0, 32);
  return userId + '.' + sig;
}
function checkUnsubToken(token) {
  const [uid, sig] = String(token || '').split('.');
  if (!uid || !sig || !process.env.JWT_SECRET) return null;
  const want = unsubToken(uid).split('.')[1];
  if (sig.length !== want.length) return null;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want)) ? uid : null;
}

module.exports = {
  PRICE_KZT, PLAN_DAYS, XP_KEY, XP_WEBHOOK_SECRET, APP_URL,
  ensureBillingSchema, hasAccess, normalizePhone, xp, markPaid, syncPayment,
  verifyWebhookSignature, unsubToken, checkUnsubToken,
};
