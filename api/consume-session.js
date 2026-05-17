// api/consume-session.js
// Decrements sessions_remaining when a user generates content
// Called after each successful AI generation

export default async function handler(req, res) {
  const allowedOrigins = ['https://getrisn.com', 'https://www.getrisn.com'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Session ID required.' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

  try {
    // Get current session
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sessions?id=eq.${sessionId}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const sessions = await getRes.json();
    if (!sessions || sessions.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found.' });
    }

    const session = sessions[0];

    // Only decrement for session-based (not unlimited)
    if (session.type === 'sessions' && session.sessions_remaining > 0) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/sessions?id=eq.${sessionId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ sessions_remaining: session.sessions_remaining - 1 })
        }
      );
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Consume session error:', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
}
