// api/keepalive.js
// Standalone keep-alive endpoint, triggered by Vercel Cron on a fixed daily
// schedule (see vercel.json). Unlike the heartbeat inside check-session.js,
// this does NOT depend on user traffic — Vercel calls it every day regardless,
// so the Supabase free-tier project never hits the 7-day inactivity pause.
//
// It performs a tiny write + read against Supabase so the database registers
// genuine activity. Failures are logged but never throw.

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

  // Optional: block public abuse. Vercel Cron sends a special header/secret.
  // If CRON_SECRET is set, require it (Vercel sends it as a Bearer token).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    // 1) Write a single keep-alive row (a real INSERT = real DB activity).
    await fetch(`${SUPABASE_URL}/rest/v1/usage_log`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        email: 'cron-keepalive@getrisn.com',
        date: new Date().toISOString().split('T')[0],
        count: 1,
        tool: 'cron_keepalive'
      })
    });

    // 2) Also do a tiny read so both read+write paths register activity.
    await fetch(`${SUPABASE_URL}/rest/v1/usage_log?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    return res.status(200).json({
      ok: true,
      pinged: new Date().toISOString(),
      message: 'Supabase keep-alive successful'
    });
  } catch (err) {
    console.error('Keep-alive error:', err);
    return res.status(500).json({ ok: false, error: 'Keep-alive failed' });
  }
}
