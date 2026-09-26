const { sql } = require('../_db');
const webpush = require('web-push');

// Vercel Cron жіберетін сұраныстарда `Authorization: Bearer $CRON_SECRET` автоматты
// түрде қосылады (env var атын дәл осылай қойсаң) — сырттан шақыруды осылай бөгейміз.
function isAuthorizedCron(req) {
  if (!process.env.CRON_SECRET) return false;
  const h = req.headers.authorization || '';
  return h === `Bearer ${process.env.CRON_SECRET}`;
}

// index.html-дегі recurIsOverdue()-мен бірдей логика — сервер де клиентпен қатар,
// қосымша ешбір бет ашылмаса да, "мерзімі өтті" push жіберуі үшін.
function recurringOverdue(data) {
  const items = data.recurring || [];
  const now = new Date();
  const curMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  return items.filter((r) => {
    const paid = r.paid || {};
    if (r.kind === 'daily') {
      const y = new Date(Date.now() - 86400000);
      const yKey = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
      return !paid[yKey];
    }
    if (!r.dueDay) return false; // күні белгіленбеген — мерзімге негізделген overdue жоқ
    if (paid[curMonthKey]) return false;
    const createdAt = r.createdAt || '';
    const createdKey = createdAt.slice(0, 7);
    const createdDay = +createdAt.slice(8, 10);
    if (curMonthKey === createdKey && createdDay > r.dueDay) return false; // бірінші ай — жеңілдік кезеңі
    return now.getDate() > r.dueDay;
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
  '5 минут бөл — болашақта өзіңе рахмет айтасың.',
  'Білесің ғой — бүгін жасамасаң, ертең де жасамайсың.',
  'Өзіңе берген сертіңді ұмытпа — бір белгі қой.',
  'Ешкім сен үшін өзгермейді. Тек өзің ғана.',
];
function genericReminderLine() {
  const start = new Date(new Date().getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start) / 86400000);
  return GENERIC_LINES[dayOfYear % GENERIC_LINES.length];
}

// Бұл cron енді GitHub Actions арқылы ӘР 15 МИНУТ САЙЫН шақырылады (.github/workflows/
// push-reminders.yml — Vercel Hobby жоспарында cron күніне 1 реттен жиі жүрмейді, сол шектеуді
// айналып өту үшін). Профиль→Хабарландырулар-да адам өзі минутпен интервал таңдайды
// (`notifPrefs.intervalMin`, кемінде 15) — соңғы жіберілген уақыттан бері сол уақыт өтті ме,
// соны users.last_reminder_sent_at-пен (СЕРВЕРЛІК баған, client sync-пен ешбір қатысы жоқ)
// салыстырып шешеміз. Нақты жеткізу дәлдігі ~15 минутқа дейін ауытқуы мүмкін — cron тексерісі
// сол жиілікте өтеді.
function isGenericDue(intervalMin, lastSentAt) {
  if (!lastSentAt) return true;
  const elapsedMin = (Date.now() - new Date(lastSentAt).getTime()) / 60000;
  return elapsedMin >= intervalMin;
}

module.exports = async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'unauthorized' });

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(200).json({ ok: true, skipped: 'vapid keys not set' });
  }
  try {
    // Дұрыс емес VAPID баптауы (мыс. subject `mailto:`/`https:` емес) осы жерде синхронды
    // throw жасайды — try/catch-тан тыс қалса, бүкіл cron JSON емес мәтінмен құлайды.
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@ozgeris.app',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } catch (e) {
    return res.status(200).json({ ok: false, skipped: 'vapid config invalid: ' + e.message });
  }

  try {
    const users = await sql`select id, last_reminder_sent_at from users where active = true`;
    const now = new Date();
    const hourUTC = now.getUTCHours();
    const minuteUTC = now.getUTCMinutes();
    // Қаржы алерттері (бюджет асуы/қарыз мерзімі) күніне 1 рет қана тексеріледі — 08:00-08:15
    // UTC аралығындағы бірінші 15-минуттық тексерісте ғана, әйтпесе сол сағат ішіндегі
    // қалған 15-минуттық тиктерде (08:15, 08:30, 08:45) қайталанып кетер еді.
    const financialDue = hourUTC === 8 && minuteUTC < 15;
    let sent = 0;

    for (const u of users) {
      const rows = await sql`select data from user_data where user_id = ${u.id}`;
      const data = (rows[0] && rows[0].data) || {};

      const overdueRecur = financialDue ? recurringOverdue(data) : [];
      const dueDebts = financialDue ? debtsDueSoon(data) : [];
      const intervalMin = Math.max(15, (data.notifPrefs && data.notifPrefs.intervalMin) || 1440);
      const wantsGeneric = !!(data.notifPrefs && data.notifPrefs.enabled)
        && isGenericDue(intervalMin, u.last_reminder_sent_at);

      let title = 'ÖZGERIS';
      let body;
      let isGeneric = false;
      if (overdueRecur.length || dueDebts.length) {
        const lines = [];
        if (overdueRecur.length) lines.push(`Мерзімі өткен төлемдер: ${overdueRecur.map((r) => r.name).join(', ')}`);
        if (dueDebts.length) lines.push(`Қарыз мерзімі жақын: ${dueDebts.map((d) => d.person).join(', ')}`);
        body = lines.join(' · ');
      } else if (wantsGeneric) {
        // Финанс алерты жоқ, бірақ адам жалпы еске салғышты қосқан әрі таңдаған интервалы
        // (кемінде 15 минут) дәл осы тексеріске сай келді.
        title = 'ÖZGERIS';
        body = genericReminderLine();
        isGeneric = true;
      } else {
        continue;
      }

      const subs = await sql`select endpoint, p256dh, auth from push_subscriptions where user_id = ${u.id}`;
      let sentToThisUser = 0;
      for (const s of subs) {
        const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        try {
          await webpush.sendNotification(sub, JSON.stringify({ title, body }));
          sent++;
          sentToThisUser++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await sql`delete from push_subscriptions where endpoint = ${s.endpoint}`;
          }
        }
      }
      // Жалпы еске салғыш іс жүзінде жіберілгенде ғана "соңғы жіберілген уақытты" жаңартамыз —
      // подписка мүлде жоқ адамға таймер үнемі "due" болып қала береді, ол зиянсыз.
      if (isGeneric && sentToThisUser > 0) {
        await sql`update users set last_reminder_sent_at = now() where id = ${u.id}`;
      }
    }

    return res.status(200).json({ ok: true, sent });
  } catch (e) {
    console.error('check-alerts failed:', e);
    return res.status(500).json({ error: 'Сервер қатесі: ' + e.message });
  }
};
