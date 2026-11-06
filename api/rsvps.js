// Password-protected RSVP list for the dashboard at /admin.
// Env vars (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (secret!), ADMIN_PASSWORD
const crypto = require('crypto');

function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Dashboard is not configured (missing environment variables).' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (!body.password || !same(body.password, ADMIN_PASSWORD)) {
    await new Promise(r => setTimeout(r, 800)); // slow down guessing
    return res.status(401).json({ error: 'Wrong password.' });
  }
  try {
    const r = await fetch(
      SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rsvps?select=*&order=created_at.desc&limit=2000',
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY } }
    );
    if (!r.ok) return res.status(502).json({ error: 'Database error (' + r.status + ').' });
    return res.status(200).json({ rows: await r.json() });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach the database.' });
  }
};
