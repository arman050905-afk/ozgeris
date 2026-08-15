const { sql } = require('../_db');
const webpush = require('web-push');

// Vercel Cron жіберетін сұраныстарда `Authorization: Bearer $CRON_SECRET` автоматты
// түрде қосылады (env var атын дәл осылай қойсаң) — сырттан шақыруды осылай бөгейміз.
function isAuthorizedCron(req) {
  if (!process.env.CRON_SECRET) return false;
  const h = req.headers.authorization || '';
  return h === `Bearer ${process.env.CRON_SECRET}`;
}

function monthRange() {
  const now = new Date();
  const from = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

function budgetOverages(data) {
  const budgets = data.budgets || {};
  const txs = data.txs || [];
  const { from, to } = monthRange();
  return Object.keys(budgets).filter((cat) => {
    const limit = budgets[cat];
    if (!limit) return false;
    const spent = txs
      .filter((t) => t.type === 'out' && t.cat === cat && t.date >= from && t.date <= to)
      .reduce((s, t) => s + t.amount, 0);
    return spent > limit;
  });
}

function debtsDueSoon(data) {
  const debts = data.debts || [];
  const today = new Date().toISOString().slice(0, 10);
  return debts.filter((d) => {
    if (d.closedAt || !d.due) return false;
    const diff = Math.ceil((new Date(d.due) - new Date(today)) / 86400000);
    return diff <= 3;
  });
}

module.exports = async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'unauthorized' });

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(200).json({ ok: true, skipped: 'vapid keys not set' });
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@ozgeris.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  try {
    const users = await sql`select id from users where active = true`;
    let sent = 0;

    for (const u of users) {
      const rows = await sql`select data from user_data where user_id = ${u.id}`;
      const data = (rows[0] && rows[0].data) || {};

      const overCats = budgetOverages(data);
      const dueDebts = debtsDueSoon(data);
      if (!overCats.length && !dueDebts.length) continue;

      const lines = [];
      if (overCats.length) lines.push(`Бюджет асты: ${overCats.join(', ')}`);
      if (dueDebts.length) lines.push(`Қарыз мерзімі жақын: ${dueDebts.map((d) => d.person).join(', ')}`);
      const body = lines.join(' · ');

      const subs = await sql`select endpoint, p256dh, auth from push_subscriptions where user_id = ${u.id}`;
      for (const s of subs) {
        const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        try {
          await webpush.sendNotification(sub, JSON.stringify({ title: 'ÖZGERIS — Қаржы ескертуі', body }));
          sent++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await sql`delete from push_subscriptions where endpoint = ${s.endpoint}`;
          }
        }
      }
    }

    return res.status(200).json({ ok: true, sent });
  } catch (e) {
    return res.status(500).json({ error: 'Сервер қатесі' });
  }
};
