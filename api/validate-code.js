// api/validate-code.js
// Server-side promo code validation for RISN
// Uses Supabase to persistently track used codes per email

// ─── Valid Codes ─────────────────────────────────────────────────────────────
// Add new codes here. Dash-suffix variants removed for security.
// To create personalized codes, add them explicitly e.g. 'GETRISN1-ELI'
const VALID_CODES = {
  // Base codes
  'GETRISN1': { sessions: 1, days: null, type: 'sessions', interviewerCap: 1, dailyCap: null, questionCap: 12, feedbackCap: 2 },
  'GETRISN5': { sessions: 5, days: null, type: 'sessions', interviewerCap: 1, dailyCap: null, questionCap: 12, feedbackCap: 2 },
  'GETRISNWEEK': { sessions: null, days: 7, type: 'unlimited', interviewerCap: 2, dailyCap: 5, questionCap: 12, feedbackCap: 2 },
  'GETRISNUNLIMITED': { sessions: null, days: 30, type: 'unlimited', interviewerCap: 4, dailyCap: 5, questionCap: 12, feedbackCap: 2 },
  // Add personalized codes below as needed:
  // 'GETRISN1-ELI': { sessions: 1, days: null, type: 'sessions', interviewerCap: 1, dailyCap: null },
  // 'GETRISN5-KIM': { sessions: 5, days: null, type: 'sessions', interviewerCap: 1, dailyCap: null },
  // 'GETRISNWEEK-JUAN': { sessions: null, days: 7, type: 'unlimited', interviewerCap: 2, dailyCap: 5, questionCap: 12, feedbackCap: 2 },
  // 'GETRISNUNLIMITED-JUAN': { sessions: null, days: 30, type: 'unlimited', interviewerCap: 4, dailyCap: 5, questionCap: 12, feedbackCap: 2 },
};

function parseCode(code) {
  if (!code) return null;
  const upper = code.toUpperCase().trim();
  if (VALID_CODES[upper]) {
    return { base: upper, access: VALID_CODES[upper] };
  }
  return null;
}

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

  const { code, email } = req.body;

  if (!code || !email) {
    return res.status(400).json({ valid: false, error: 'Code and email are required.' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ valid: false, error: 'Please enter a valid email address.' });
  }

  const parsed = parseCode(code);
  if (!parsed) {
    return res.status(200).json({ valid: false, error: 'Invalid code. Please check and try again.' });
  }

  const emailKey = email.toLowerCase().trim();
  const codeKey = parsed.base;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

  try {
    // Check if this email+code combo has already been used
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/used_codes?email=eq.${encodeURIComponent(emailKey)}&code=eq.${encodeURIComponent(codeKey)}&select=id`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const existing = await checkRes.json();

    if (existing && existing.length > 0) {
      return res.status(200).json({
        valid: false,
        error: 'This code has already been used with this email address. Each code can only be used once per email.'
      });
    }

    // Record the use in used_codes table
    await fetch(`${SUPABASE_URL}/rest/v1/used_codes`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ email: emailKey, code: codeKey })
    });

    // Create an active session in Supabase
    const access = parsed.access;
    const expiresAt = access.days
      ? new Date(Date.now() + access.days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const sessionRes = await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        email: emailKey,
        code: codeKey,
        type: access.type,
        sessions_remaining: access.sessions,
        expires_at: expiresAt
      })
    });

    const sessionData = await sessionRes.json();
    const sessionId = sessionData[0]?.id;

    return res.status(200).json({
      valid: true,
      type: access.type,
      sessions: access.sessions,
      sessionsRemaining: access.sessions,
      days: access.days,
      expiresAt,
      email: emailKey,
      sessionId,
      interviewerCap: access.interviewerCap || 1,
      dailyCap: access.dailyCap || null,
      questionCap: access.questionCap || null,
      feedbackCap: access.feedbackCap || 3,
      isPaidPlan: false,
      message: access.type === 'sessions'
        ? `Code accepted! You have ${access.sessions} session${access.sessions > 1 ? 's' : ''} to use.`
        : access.days === 7
        ? `Code accepted! You have 1 week of access — up to ${access.dailyCap} sessions per day.`
        : `Code accepted! You have unlimited access for ${access.days} days.`
    });

  } catch (err) {
    console.error('Supabase error:', err);
    return res.status(500).json({ valid: false, error: 'Server error. Please try again.' });
  }
}
