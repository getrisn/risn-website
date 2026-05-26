// api/check-session.js
// Checks if an email has an active session in Supabase
// Returns session data including plan caps

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

  const { email } = req.body;
  if (!email) return res.status(400).json({ valid: false, error: 'Email required.' });

  const emailKey = email.toLowerCase().trim();
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

  try {
    const res2 = await fetch(
      `${SUPABASE_URL}/rest/v1/sessions?email=eq.${encodeURIComponent(emailKey)}&select=*&order=created_at.desc&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const sessions = await res2.json();

    if (!sessions || sessions.length === 0) {
      return res.status(200).json({ valid: false, reason: 'No active session found.' });
    }

    const session = sessions[0];

    // Check expiry
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      return res.status(200).json({ valid: false, reason: 'Session expired.' });
    }

    // Check sessions remaining
    if (session.type === 'sessions' && session.sessions_remaining <= 0) {
      return res.status(200).json({ valid: false, reason: 'No sessions remaining.' });
    }

    // Determine plan type for cap enforcement
    const isPaidPlan = !session.code || session.code.startsWith('stripe_');
    const plan = session.days === 7 ? 'week'
      : session.days === 30 && !isPaidPlan ? 'promo_month'
      : isPaidPlan ? 'paid'
      : 'sessions';

    // Heartbeat — keeps Supabase free tier active by logging timestamp
    fetch(`${SUPABASE_URL}/rest/v1/usage_log`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        email: 'heartbeat@getrisn.com',
        date: new Date().toISOString().split('T')[0],
        count: 1,
        tool: 'heartbeat'
      })
    }).catch(() => {}); // Silent — never block on heartbeat failure

    return res.status(200).json({
      valid: true,
      type: session.type,
      sessionsRemaining: session.sessions_remaining,
      expiresAt: session.expires_at,
      sessionId: session.id,
      feedbackCap: session.feedback_cap ?? (isPaidPlan ? 6 : 3),
      questionCap: session.question_cap ?? (isPaidPlan ? null : 2),
      interviewerCap: session.interviewer_cap ?? (isPaidPlan ? 10 : 4),
      dailyCap: session.daily_cap ?? (isPaidPlan ? 15 : 5),
      isPaidPlan,
      plan
    });

  } catch (err) {
    console.error('Check session error:', err);
    return res.status(500).json({ valid: false, error: 'Server error.' });
  }
}
