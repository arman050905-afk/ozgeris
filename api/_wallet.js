const crypto = require('crypto');
const { sql } = require('./_db');

// Apple Pay → ÖZGERIS: iPhone «Команды» қосымшасының «Транзакция» автоматизациясы әр төлемнен кейін
// жеке сілтемеге (/w/<token> → /api/data?wallet=<token>) сома мен дүкен атын POST етеді. Төлем
// wallet_inbox-қа түседі, клиент оны келесі ашылғанда txs-ке қосып, ack етеді (user_data-ға сервер
// өзі жазбайды — клиенттің толық PUT синхроны оны ескі күйімен қайта жазып жіберер еді).
// Токен тек шығын қосуға жарайды; базада sha256 хэші ғана сақталады.
const INBOX_MAX = 300;

let schemaReady = null;
function ensureWalletSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const r = await sql`
        select
          (select count(*)::int from information_schema.columns
            where table_name = 'users' and column_name in ('wallet_token_hash','wallet_last_at')) as cols,
          to_regclass('public.wallet_inbox') is not null as has_inbox
      `;
      if (r[0].cols === 2 && r[0].has_inbox) return;
      await sql`alter table users add column if not exists wallet_token_hash text`;
      await sql`alter table users add column if not exists wallet_last_at timestamptz`;
      await sql`create unique index if not exists users_wallet_token_idx on users (wallet_token_hash)`;
      await sql`
        create table if not exists wallet_inbox (
          id         bigserial primary key,
          user_id    uuid not null references users(id) on delete cascade,
          amount     numeric(14,2) not null,
          currency   text not null default 'KZT',
          merchant   text,
          card       text,
          cat        text,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists wallet_inbox_user_idx on wallet_inbox (user_id, id)`;
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// Shortcuts сомасы құрылғы тіліне қарай әртүрлі мәтін болып келеді:
// "₸1 990,00" / "1 990,00 ₸" / "KZT 1,990.00" / "$12.99" / 1990 → { amount, currency }
const CURRENCIES = [
  [/₸|KZT|тг|тенге|теңге/i, 'KZT'], [/\$|USD/i, 'USD'], [/€|EUR/i, 'EUR'],
  [/₽|RUB|руб/i, 'RUB'], [/₺|TRY/i, 'TRY'], [/AED/i, 'AED'], [/£|GBP/i, 'GBP'], [/¥|CNY|JPY/i, 'CNY'],
];
function parseAmount(raw) {
  if (typeof raw === 'number') return raw > 0 ? { amount: Math.round(raw * 100) / 100, currency: 'KZT' } : null;
  const s = String(raw || '');
  const m = s.match(/\d[\d\s\u00a0\u202f.,']*/);
  if (!m) return null;
  let n = m[0].replace(/[\s\u00a0\u202f']/g, '').replace(/[.,]+$/, '');
  const lastDot = n.lastIndexOf('.'), lastComma = n.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // екеуі де бар — соңғысы ондық бөлгіш
    const dec = lastDot > lastComma ? '.' : ',';
    n = n.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = n.split(sep);
    // "1,990" / "1.990.000" — мыңдық; "12,5" / "12.99" — ондық
    n = parts.length === 2 && parts[1].length <= 2 ? parts.join('.') : parts.join('');
  }
  const amount = Math.round(parseFloat(n) * 100) / 100;
  if (!(amount > 0) || amount > 1e9) return null;
  const cur = CURRENCIES.find(([re]) => re.test(s));
  return { amount, currency: cur ? cur[1] : 'KZT' };
}

const clip = (v, n) => {
  const s = (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, n) : null;
};
function pick(body, query, keys) {
  for (const k of keys) {
    if (body && body[k] != null && body[k] !== '') return body[k];
    if (query && query[k] != null && query[k] !== '') return query[k];
  }
  return null;
}

// POST /w/<token> — iPhone автоматизациясынан (JWT жоқ, тек токен)
async function ingest(req, res) {
  await ensureWalletSchema();
  const token = String(req.query.wallet || '');
  if (token.length < 20) return res.status(404).json({ error: 'not found' });
  const rows = await sql`select id from users where wallet_token_hash = ${hashToken(token)}`;
  if (!rows[0]) return res.status(404).json({ error: 'Сілтеме ескірген — ÖZGERIS-тен жаңасын ал' });
  const userId = rows[0].id;

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = { amount: body }; } }
  body = body || {};
  const rawAmount = pick(body, req.query, ['amount', 'Amount', 'сумма', 'Сумма', 'sum', 'a']);
  let merchant = clip(pick(body, req.query, ['merchant', 'Merchant', 'продавец', 'Продавец', 'shop', 'name', 'm']), 80);
  const parsed = parseAmount(rawAmount);

  // Сомасыз шақыру (мыс. командты қолмен іске қосу) — байланысты тексеру ғана
  await sql`update users set wallet_last_at = now() where id = ${userId}`;
  if (!parsed) return res.status(200).json({ ok: true, ping: true });
  // Бір өріске бәрі келсе ("₸1 990 MAGNUM") — сомадан кейінгі мәтін дүкен аты
  if (!merchant && typeof rawAmount === 'string') {
    merchant = clip(rawAmount.replace(/\d[\d\s\u00a0\u202f.,']*/, ' ').replace(/₸|KZT|\$|USD|€|EUR|₽|RUB/gi, ' '), 80);
  }

  const cnt = await sql`select count(*)::int as n from wallet_inbox where user_id = ${userId}`;
  if (cnt[0].n >= INBOX_MAX) return res.status(429).json({ error: 'ÖZGERIS-ті ашып, жиналған төлемдерді қабылда' });
  await sql`
    insert into wallet_inbox (user_id, amount, currency, merchant, card, cat)
    values (${userId}, ${parsed.amount}, ${parsed.currency}, ${merchant},
            ${clip(pick(body, req.query, ['card', 'Card', 'карта']), 40)}, ${clip(pick(body, req.query, ['cat', 'category', 'категория']), 40)})
  `;
  return res.status(200).json({ ok: true });
}

// Клиент (JWT, доступ тексерілген): GET → кезектегі төлемдер, POST {action} → link/unlink/ack
async function inbox(req, res, uid) {
  await ensureWalletSchema();
  if (req.method === 'GET') {
    const u = await sql`select wallet_token_hash is not null as linked, wallet_last_at from users where id = ${uid}`;
    const items = await sql`
      select id, amount::float8 as amount, currency, merchant, card, cat, created_at
      from wallet_inbox where user_id = ${uid} order by id limit 100
    `;
    return res.status(200).json({ linked: !!(u[0] && u[0].linked), lastAt: u[0] ? u[0].wallet_last_at : null, items });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const { action, ids } = req.body || {};
  if (action === 'link') {
    // Жаңа токен ескісін бірден жарамсыз етеді
    const token = crypto.randomBytes(24).toString('base64url');
    await sql`update users set wallet_token_hash = ${hashToken(token)} where id = ${uid}`;
    return res.status(200).json({ token });
  }
  if (action === 'unlink') {
    await sql`update users set wallet_token_hash = null where id = ${uid}`;
    return res.status(200).json({ ok: true });
  }
  if (action === 'ack') {
    const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger).slice(0, 200);
    if (list.length) await sql`delete from wallet_inbox where user_id = ${uid} and id = any(${list}::bigint[])`;
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: 'unknown action' });
}

module.exports = { ingest, inbox, parseAmount };
