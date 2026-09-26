const { sql } = require('./_db');
const { verify } = require('./_auth');
const webpush = require('web-push');

// Push жазылу/жазылудан бас тарту/тестілік жіберу бір файлда — Vercel Hobby жоспарының
// 12 функция лимитіне сыю үшін subscribe.js/unsubscribe.js/test.js осында біріктірілді.
module.exports = async (req, res) => {
  const payload = verify(req);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });

  // "Тестілік хабарлама жіберу" батырмасы — сағат/cron-ды күтпей, push дұрыс жұмыс
  // істейтінін дереу тексеруге арналған. Тек ағымдағы қолданушының өз subscription-дарына жібереді.
  if (req.method === 'POST' && req.body && req.body.action === 'test') {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return res.status(200).json({ ok: false, error: 'VAPID кілттері серверде орнатылмаған' });
    }
    try {
      // setVapidDetails кілттер/subject форматы дұрыс болмаса (мыс. subject `mailto:...`
      // немесе `https://...` емес) СИНХРОНДЫ throw жасайды — try/catch-тан тыс қалса, бүкіл
      // функция JSON емес "FUNCTION_INVOCATION_FAILED" мәтінімен құлайды да, клиент оны
      // parse ете алмай жалпы "Қате шықты, қайта көр" деп көрсетеді.
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@ozgeris.app',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    } catch (e) {
      return res.status(200).json({ ok: false, error: 'VAPID баптауы дұрыс емес: ' + e.message });
    }
    try {
      const subs = await sql`select endpoint, p256dh, auth from push_subscriptions where user_id = ${payload.uid}`;
      if (!subs.length) return res.status(200).json({ ok: false, error: 'Алдымен жоғарыдағы «Push ескертулерді қосу» батырмасын бас' });
      let sent = 0;
      for (const s of subs) {
        const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        try {
          await webpush.sendNotification(sub, JSON.stringify({
            title: 'ÖZGERIS',
            body: 'Бұл тестілік хабарлама. Көріп тұрсаң — push дұрыс жұмыс істейді!',
          }));
          sent++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await sql`delete from push_subscriptions where endpoint = ${s.endpoint}`;
          }
        }
      }
      return res.status(200).json({ ok: sent > 0, sent });
    } catch (e) {
      return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
    }
  }

  if (req.method === 'POST') {
    const sub = req.body && req.body.subscription;
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return res.status(400).json({ error: 'subscription дұрыс емес' });
    }
    try {
      await sql`
        insert into push_subscriptions (user_id, endpoint, p256dh, auth)
        values (${payload.uid}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
        on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
      `;
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
    }
  }

  if (req.method === 'DELETE') {
    const endpoint = req.body && req.body.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'endpoint қажет' });
    try {
      await sql`delete from push_subscriptions where user_id = ${payload.uid} and endpoint = ${endpoint}`;
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
};
