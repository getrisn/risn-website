// api/validate-code.js
// Server-side promo code validation for RISN
// Uses Supabase to persistently track used codes per email

// ─── Valid Codes ─────────────────────────────────────────────────────────────
// Format: RISN-XXXX-XXXX-XXXX — randomly generated, unguessable
// To add personalized codes copy a line and generate a new code at the bottom
const VALID_CODES = {
  // Single use (1 session, 2 feedbacks, 12 questions)
  'RISN-C937-HZM6-KCZK': { sessions: 1, days: null, type: 'sessions', interviewerCap: 1, dailyCap: null, questionCap: 12, feedbackCap: 2 },
  'RISN-SE3J-3PFA-EDD9': { sessions: 1, days: null, type: 'sessions', interviewerCap: 1, dailyCap: null, questionCap: 12, feedbackCap: 2 },

  // Starter pack (5 sessions, 2 feedbacks, 12 questions)
  'RISN-AT28-UW4G-SX64': { sessions: 5, days: null, type: 'sessions', interviewerCap: 1, dailyCap: null, questionCap: 12, feedbackCap: 2 },
  'RISN-YRVS-FUX3-RCS8': { sessions: 5, days: null, type: 'sessions', interviewerCap: 1, dailyCap: null, questionCap: 12, feedbackCap: 2 },

  // Week access (7 days, 5/day, 2 interviewers, 2 feedbacks, 12 questions)
  'RISN-WWMH-CK5T-KJR6': { sessions: null, days: 7, type: 'unlimited', interviewerCap: 2, dailyCap: 5, questionCap: 12, feedbackCap: 2 },
  'RISN-5M4Y-YRSM-4PNS': { sessions: null, days: 7, type: 'unlimited', interviewerCap: 2, dailyCap: 5, questionCap: 12, feedbackCap: 2 },

  // Month access (30 days, 5/day, 4 interviewers, 3 feedbacks, 12 questions)
  'RISN-QWKW-58TN-VX8F': { sessions: null, days: 30, type: 'unlimited', interviewerCap: 4, dailyCap: 5, questionCap: 12, feedbackCap: 3 },
  'RISN-M8UL-F9YL-5CDT': { sessions: null, days: 30, type: 'unlimited', interviewerCap: 4, dailyCap: 5, questionCap: 12, feedbackCap: 3 },

  // Add personalized codes below:
  // 'RISN-XXXX-XXXX-XXXX': { sessions: 1, days: null, type: 'sessions', interviewerCap: 1, dailyCap: null, questionCap: 12, feedbackCap: 2 },
};

function parseCode(code) {
  if (!code) return null;
  const upper = code.toUpperCase().trim();
  if (VALID_CODES[upper]) {
    return { base: upper, access: VALID_CODES[upper] };
  }
  return null;
}

// ─── Failed Attempt Rate Limiter ─────────────────────────────────────────────
// Blocks IPs after 3 failed code attempts for 1 hour
const failedAttempts = new Map();

function checkFailedAttempts(ip) {
  const now = Date.now();
  const blockDuration = 60 * 60 * 1000; // 1 hour
  const maxAttempts = 3;

  if (!failedAttempts.has(ip)) return { blocked: false };

  const record = failedAttempts.get(ip);

  // Check if still blocked
  if (record.blockedUntil && now < record.blockedUntil) {
    const minutesLeft = Math.ceil((record.blockedUntil - now) / 60000);
    return { blocked: true, minutesLeft };
  }

  // Reset if block has expired
  if (record.blockedUntil && now >= record.blockedUntil) {
    failedAttempts.delete(ip);
    return { blocked: false };
  }

  return { blocked: false, attempts: record.attempts };
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const blockDuration = 60 * 60 * 1000;
  const maxAttempts = 3;

  const record = failedAttempts.get(ip) || { attempts: 0, blockedUntil: null };
  record.attempts += 1;

  if (record.attempts >= maxAttempts) {
    record.blockedUntil = now + blockDuration;
  }

  failedAttempts.set(ip, record);
}

function clearFailedAttempts(ip) {
  failedAttempts.delete(ip);
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

  // Check if IP is blocked from too many failed attempts
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const ipCheck = checkFailedAttempts(clientIP);
  if (ipCheck.blocked) {
    return res.status(429).json({
      valid: false,
      error: `Too many invalid attempts. Please try again later.`
    });
  }

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
      recordFailedAttempt(clientIP);
      return res.status(200).json({
        valid: false,
        error: 'This code is no longer valid. Please check and try again.'
      });
    }

    // Clear failed attempts on success
    clearFailedAttempts(clientIP);

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
        expires_at: expiresAt,
        feedback_cap: access.feedbackCap || 2,
        question_cap: access.questionCap || 12,
        interviewer_cap: access.interviewerCap || 1,
        daily_cap: access.dailyCap || null,
        days: access.days || null
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
