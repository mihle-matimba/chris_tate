// Serves public RSVP settings from Vercel environment variables.
// Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel > Project > Settings > Environment Variables.
// (The anon key is designed to be public; the table is locked down by supabase/rsvp.sql.)
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send(
    'window.RSVP_CONFIG=' +
      JSON.stringify({
        supabaseUrl: process.env.SUPABASE_URL || '',
        anonKey: process.env.SUPABASE_ANON_KEY || '',
      }) +
      ';'
  );
};
