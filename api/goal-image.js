module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const q = (req.query.q || '').toString().trim().slice(0, 100);
  if (!q) return res.status(400).json({ error: 'q қажет' });

  if (!process.env.PEXELS_API_KEY) {
    return res.status(200).json({ image: null });
  }

  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }
    );
    if (!r.ok) return res.status(200).json({ image: null });
    const data = await r.json();
    const photo = data.photos && data.photos[0];
    const image = photo ? (photo.src.large || photo.src.medium || null) : null;
    return res.status(200).json({ image });
  } catch (e) {
    return res.status(200).json({ image: null });
  }
};
