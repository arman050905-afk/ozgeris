const { sql } = require('./_db');
const { verify } = require('./_auth');
const B = require('./_billing');

// Бір функцияда үшеуі (Vercel Hobby 12-функция шегі):
//   GET  /api/pay[?order=<id>]        — баға/күй + PENDING төлемді xpayment-пен салыстыру (JWT)
//   POST /api/pay {phone}             — Kaspi-ге шот жіберу (JWT)
//   POST /api/pay + X-xPayment-Signature — xpayment webhook (JWT жоқ, HMAC-пен расталады)
module.exports = async (req, res) => {
  if (req.method === 'POST' && req.headers['x-xpayment-signature'] !== undefined) return webhook(req, res);

  const payload = verify(req);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  const uid = payload.uid;

  try {
    await B.ensureBillingSchema();

    if (req.method === 'GET') {
      const order = String((req.query && req.query.order) || '');
      const rows = order
        ? await sql`select id, status, phone, xp_id from payments where id::text = ${order} and user_id = ${uid}`
        : await sql`select id, status, phone, xp_id from payments where user_id = ${uid} order by created_at desc limit 1`;
      const row = rows[0] || null;
      let status = row ? row.status : null;
      if (row && row.status === 'PENDING') status = await B.syncPayment(row).catch(() => 'PENDING');
      const u = (await sql`select active, paid_until from users where id = ${uid}`)[0];
      if (!u) return res.status(404).json({ error: 'not found' });
      return res.status(200).json({
        enabled: !!B.XP_KEY,
        price: B.PRICE_KZT,
        days: B.PLAN_DAYS,
        order: row ? { id: row.id, status, phone: row.phone } : null,
        access: B.hasAccess(u),
        lifetime: !!u.active,
        paidUntil: u.paid_until,
      });
    }

    if (req.method === 'POST') {
      if (!B.XP_KEY) return res.status(503).json({ error: 'Kaspi төлемі әлі қосылмаған — WhatsApp арқылы жаз', disabled: true });
      const phone = B.normalizePhone(req.body && req.body.phone);
      if (!phone) return res.status(400).json({ error: 'Нөмірді +7 7XX XXX XX XX түрінде жаз' });

      // Бөтен нөмірлерге шот жаудыруға жол бермеу
      const recent = await sql`select count(*)::int as n from payments where user_id = ${uid} and created_at > now() - interval '1 hour'`;
      if (recent[0].n >= 5) return res.status(429).json({ error: 'Тым көп әрекет — бір сағаттан кейін қайта көр' });

      // Ескі төленбеген шоттарды жабамыз; біреуі сол арада төленіп кетсе — жаңасын ашпаймыз
      const pending = await sql`select id, status, xp_id from payments where user_id = ${uid} and status = 'PENDING'`;
      for (const o of pending) {
        try {
          await B.xp('POST', '/payments/' + encodeURIComponent(o.xp_id) + '/cancel');
          await sql`update payments set status = 'CANCELLED' where id = ${o.id} and status = 'PENDING'`;
        } catch (e) {
          const st = await B.syncPayment(o).catch(() => 'PENDING');
          if (st === 'COMPLETED') return res.status(200).json({ orderId: o.id, status: 'COMPLETED' });
        }
      }

      const ins = await sql`
        insert into payments (user_id, phone, amount, days, status)
        values (${uid}, ${phone}, ${B.PRICE_KZT}, ${B.PLAN_DAYS}, 'NEW') returning id
      `;
      const orderId = ins[0].id;
      let p;
      try {
        p = await B.xp('POST', '/payments', {
          payer_phone: phone,
          amount: B.PRICE_KZT,
          comment: `ÖZGERIS — ${B.PLAN_DAYS} күндік жазылым`,
          merchant_order_id: orderId,
        }, orderId);
      } catch (e) {
        await sql`update payments set status = 'FAILED' where id = ${orderId}`;
        console.error('xpayment create failed:', e.status, e.code, e.message);
        const msg = e.status === 400
          ? 'Бұл нөмір Kaspi-де табылмады — Kaspi-ге тіркелген нөмірді жаз'
          : 'Kaspi уақытша жауап бермей тұр — сәлден кейін қайта көр немесе WhatsApp-қа жаз';
        return res.status(502).json({ error: msg, code: e.code || null });
      }
      const st = String(p.status || 'PENDING').toUpperCase();
      await sql`update payments set xp_id = ${p.id || null}, status = ${st === 'PENDING' ? 'PENDING' : st} where id = ${orderId}`;
      if (st !== 'PENDING') {
        return res.status(502).json({ error: 'Kaspi шотты қабылдамады — нөмірді тексеріп, қайта көр', orderId, status: st });
      }
      return res.status(200).json({ orderId, status: 'PENDING', phone, amount: B.PRICE_KZT });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error('pay failed:', e);
    return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
  }
};

function rawCandidates(req) {
  const out = [];
  if (Buffer.isBuffer(req.rawBody)) out.push(req.rawBody);
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) out.push(req.body);
  else if (req.body && typeof req.body === 'object') out.push(JSON.stringify(req.body));
  return out;
}

async function webhook(req, res) {
  let body = req.body || {};
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    try { body = JSON.parse(body.toString()); } catch (e) { return res.status(400).json({ error: 'bad json' }); }
  }
  const signed = B.verifyWebhookSignature(rawCandidates(req), req.headers['x-xpayment-signature']);
  if (B.XP_WEBHOOK_SECRET && !signed) return res.status(401).json({ error: 'bad signature' });

  try {
    await B.ensureBillingSchema();
    const rows = await sql`
      select id, status, xp_id from payments
      where id::text = ${String(body.merchant_order_id || '')} or xp_id = ${String(body.payment_id || '')}
      limit 1
    `;
    if (!rows[0]) return res.status(200).json({ ok: true, ignored: true });
    // Қолтаңба расталса — оқиғаға сенеміз; әйтпесе (secret қойылмаған) күйді xpayment API-ден өзіміз сұраймыз
    if (signed && body.event === 'payment.completed') await B.markPaid(rows[0].id);
    else await B.syncPayment(rows[0]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('webhook failed:', e);
    return res.status(500).json({ error: 'retry' }); // xpayment 1 және 5 минуттан кейін қайта жібереді
  }
}
