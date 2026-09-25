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

// Профиль→Хабарландырулар-да "Жалпы еске салғыштарды қосу" таңдалған адамдарға арналған
// қысқа, айналмалы (rotating) сөйлемдер. Тек финанс алерты болмаған жағдайда ғана жіберіледі —
// бір cron өтуінде бір адамға екі хабарлама бірден кетпейді.
const GENERIC_LINES = [
  'Уақыт болды, өміріңді жүйеле!',
  'Кішкентай қадам жаса — бүгін де алға!',
  'Трекерлеріңді тексеріп, бүгінгі күнді белгіле.',
];
function genericReminderLine() {
  const start = new Date(new Date().getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start) / 86400000);
  return GENERIC_LINES[dayOfYear % GENERIC_LINES.length];
}

// Бұл cron енді GitHub Actions арқылы САҒАТ САЙЫН шақырылады (.github/workflows/hourly-push.yml,
// Vercel Hobby жоспарында cron күніне 1 реттен жиі жүрмейді — сол шектеуді айналып өту үшін).
// Сондықтан әр адамның Профиль→Хабарландырулар-да таңдаған жиілігін (`notifPrefs.freq`) осы
// жерде UTC сағатпен салыстырып сүземіз — әйтпесе "күніне 1 рет" таңдаған адамға сағат сайын
// хабарлама кетіп қалар еді.
function isGenericDue(freq, hourUTC) {
  if (freq === '1h') return true;
  if (freq === '3h') return hourUTC % 3 === 0;
  return hourUTC === 8; // 'daily' (әдепкі) — бұрынғы Vercel Cron уақыты, 08:00 UTC
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
    const hourUTC = new Date().getUTCHours();
    let sent = 0;

    for (const u of users) {
      const rows = await sql`select data from user_data where user_id = ${u.id}`;
      const data = (rows[0] && rows[0].data) || {};

      // Қаржы алерттері (бюджет асуы/қарыз мерзімі) күніне 1 рет қана тексеріледі — жиілік
      // таңдауына қарамай сағат сайын қайталанып, адамды мазаламау үшін.
      const overCats = hourUTC === 8 ? budgetOverages(data) : [];
      const dueDebts = hourUTC === 8 ? debtsDueSoon(data) : [];
      const freq = (data.notifPrefs && data.notifPrefs.freq) || 'daily';
      const wantsGeneric = !!(data.notifPrefs && data.notifPrefs.enabled) && isGenericDue(freq, hourUTC);

      let title = 'ÖZGERIS — Қаржы ескертуі';
      let body;
      if (overCats.length || dueDebts.length) {
        const lines = [];
        if (overCats.length) lines.push(`Бюджет асты: ${overCats.join(', ')}`);
        if (dueDebts.length) lines.push(`Қарыз мерзімі жақын: ${dueDebts.map((d) => d.person).join(', ')}`);
        body = lines.join(' · ');
      } else if (wantsGeneric) {
        // Финанс алерты жоқ, бірақ адам жалпы еске салғышты қосқан әрі таңдаған жиілігі
        // (сағат сайын/3 сағат сайын/күніне 1 рет) дәл осы сағатқа сай келді.
        title = 'ÖZGERIS';
        body = genericReminderLine();
      } else {
        continue;
      }

      const subs = await sql`select endpoint, p256dh, auth from push_subscriptions where user_id = ${u.id}`;
      for (const s of subs) {
        const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        try {
          await webpush.sendNotification(sub, JSON.stringify({ title, body }));
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
