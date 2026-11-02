const bcrypt = require('bcryptjs');
const { sql } = require('./_db');
const { verify } = require('./_auth');
const { ensureBillingSchema, hasAccess } = require('./_billing');

module.exports = async (req, res) => {
  const payload = verify(req);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });

  if (req.method === 'GET') {
    try {
      await ensureBillingSchema();
      const rows = await sql`select name, email, is_admin, active, paid_until from users where id = ${payload.uid}`;
      const u = rows[0];
      if (!u) return res.status(404).json({ error: 'not found' });
      // active — клиент үшін «доступ бар ма» (мәңгілік НЕМЕСЕ жазылым), lifetime — тек мәңгілік
      const user = { name: u.name, email: u.email, is_admin: u.is_admin, active: hasAccess(u), lifetime: !!u.active, paid_until: u.paid_until };
      return res.status(200).json({ user });
    } catch (e) {
      return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
    }
  }

  if (req.method === 'PUT') {
    const body = req.body || {};

    // Пароль ауыстыру — {action:'changePassword', currentPass, newPass}
    if (body.action === 'changePassword') {
      const { currentPass, newPass } = body;
      if (!currentPass || !newPass) return res.status(400).json({ error: 'Барлық өрісті толтыр' });
      if (String(newPass).length < 4) return res.status(400).json({ error: 'Пароль кемінде 4 таңба' });

      try {
        const rows = await sql`select pass_hash from users where id = ${payload.uid}`;
        const user = rows[0];
        if (!user) return res.status(404).json({ error: 'not found' });

        const ok = await bcrypt.compare(String(currentPass), user.pass_hash);
        if (!ok) return res.status(401).json({ error: 'Ағымдағы пароль қате' });

        const hash = await bcrypt.hash(String(newPass), 10);
        await sql`update users set pass_hash = ${hash} where id = ${payload.uid}`;
        return res.status(200).json({ ok: true });
      } catch (e) {
        return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
      }
    }

    // Атын өзгерту — {name}
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Атыңды енгіз' });
    try {
      const rows = await sql`update users set name = ${name} where id = ${payload.uid} returning name, email`;
      const user = rows[0];
      if (!user) return res.status(404).json({ error: 'not found' });
      return res.status(200).json({ user });
    } catch (e) {
      return res.status(500).json({ error: 'Сервер қатесі, кейінірек көр' });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
};
