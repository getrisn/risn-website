// api/claude.js
// RISN API Proxy — secure, rate-limited, cost-controlled

// ─── Approved Models ──────────────────────────────────────────────────────────
const APPROVED_MODELS = {
  'claude-sonnet-4-5': true,
  'claude-haiku-4-5-20251001': true,
};
const DEFAULT_MODEL = 'claude-sonnet-4-5';

// ─── Usage Caps ───────────────────────────────────────────────────────────────
// PAID UNLIMITED PLAN
const PAID_DAILY_CAP = 15;
const PAID_COACH_MONTHLY_CAP = 25;
const PAID_INTERVIEWER_MONTHLY_CAP = 10;
const PAID_FEEDBACK_CAP = 6;

// PROMO CODE PLANS (enforced via feedbackCap/questionCap in validate-code.js)
// GETRISNWEEK: dailyCap=5, interviewerCap=2, feedbackCap=2, questionCap=12
// GETRISNUNLIMITED: dailyCap=5, interviewerCap=4, feedbackCap=3, questionCap=12

// FEEDBACK CAP (server-side enforcement)
const FEEDBACK_PER_SESSION_CAP = 6; // Max for paid — promo codes enforce their own via client

// ─── IP Rate Limiter ──────────────────────────────────────────────────────────
const ipRequests = new Map();

function checkIPLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 30;
  if (!ipRequests.has(ip)) ipRequests.set(ip, []);
  const requests = ipRequests.get(ip).filter(t => now - t < windowMs);
  requests.push(now);
  ipRequests.set(ip, requests);
  return requests.length <= maxRequests;
}

// ─── Usage Tracking + Monthly Cap Enforcement ─────────────────────────────────
async function checkAndLogUsage(email, tool, plan) {
  if (!email) return { allowed: true };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return { allowed: true };

  try {
    const today = new Date().toISOString().split('T')[0];
    const emailKey = email.toLowerCase().trim();
    const monthStart = today.substring(0, 7) + '-01';
    const monthEnd = today.substring(0, 7) + '-31';

    // ── Monthly cap: Interview Coach ──────────────────────────────────────────
    if (tool === 'interview') {
      const monthRes = await fetch(
        `${SUPABASE_URL}/rest/v1/usage_log?email=eq.${encodeURIComponent(emailKey)}&tool=eq.interview&date=gte.${monthStart}&date=lte.${monthEnd}&select=count`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      const monthRows = await monthRes.json();
      const monthTotal = monthRows.reduce((sum, r) => sum + (r.count || 0), 0);

      // Promo month codes get lower cap
      const coachCap = (plan === 'promo_month') ? 15
        : (plan === 'week') ? 10
        : PAID_COACH_MONTHLY_CAP;

      if (monthTotal >= coachCap) {
        return {
          allowed: false,
          message: `You've reached your ${coachCap} Interview Coach sessions for this month. Your limit resets on the 1st.`
        };
      }
    }

    // ── Monthly cap: Interviewer Profiles ─────────────────────────────────────
    if (tool === 'interviewer_profiles') {
      const monthRes = await fetch(
        `${SUPABASE_URL}/rest/v1/usage_log?email=eq.${encodeURIComponent(emailKey)}&tool=eq.interviewer_profiles&date=gte.${monthStart}&date=lte.${monthEnd}&select=count`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      const monthRows = await monthRes.json();
      const monthTotal = monthRows.reduce((sum, r) => sum + (r.count || 0), 0);

      // Cap by plan type
      const interviewerCap = (plan === 'week') ? 2
        : (plan === 'promo_month') ? 4
        : PAID_INTERVIEWER_MONTHLY_CAP;

      if (monthTotal >= interviewerCap) {
        return {
          allowed: false,
          message: `You've reached your Interviewer Profile limit for this period. Resets on the 1st.`
        };
      }
    }

    // ── Daily cap ─────────────────────────────────────────────────────────────
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/usage_log?email=eq.${encodeURIComponent(emailKey)}&date=eq.${today}&select=id,count,tool`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await checkRes.json();
    const totalToday = rows.reduce((sum, r) => sum + (r.count || 0), 0);

    // Daily cap depends on plan
    const dailyCap = (plan === 'week' || plan === 'promo_month') ? 5 : PAID_DAILY_CAP;

    if (totalToday >= dailyCap) {
      return {
        allowed: false,
        message: `Daily limit of ${dailyCap} generations reached. Resets at midnight.`
      };
    }

    // ── Log usage ─────────────────────────────────────────────────────────────
    const toolRow = rows.find(r => r.tool === tool);
    if (toolRow) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/usage_log?id=eq.${toolRow.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ count: (toolRow.count || 0) + 1 })
        }
      );
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/usage_log`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ email: emailKey, date: today, count: 1, tool: tool || 'unknown' })
      });
    }

    return { allowed: true };

  } catch (err) {
    console.error('Usage check error:', err);
    return { allowed: true }; // Fail open — never block on DB errors
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const allowedOrigins = ['https://getrisn.com', 'https://www.getrisn.com'];
  const origin = req.headers.origin || '';
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Layer 1: Request signing ──────────────────────────────────────────────
  const {
    risn_email,
    risn_unlimited,
    risn_web_search,
    risn_secret,
    risn_tool,
    risn_plan,
    risn_feedback_count,
    ...claudeBody
  } = req.body;

  const expectedSecret = process.env.RISN_API_SECRET;
  if (expectedSecret && (!risn_secret || risn_secret !== expectedSecret)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // ── Layer 2: IP rate limiting ─────────────────────────────────────────────
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkIPLimit(clientIP)) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }

  // ── Layer 3: Feedback cap (server-side) ───────────────────────────────────
  if (risn_tool === 'interview_feedback') {
    const feedbackCount = parseInt(risn_feedback_count) || 0;
    if (feedbackCount >= FEEDBACK_PER_SESSION_CAP) {
      return res.status(429).json({
        error: `You've reached the feedback limit for this session. Start a new session for more feedback.`
      });
    }
  }

  // ── Layer 4: Daily + monthly usage caps ───────────────────────────────────
  if (risn_email && risn_unlimited) {
    const usageCheck = await checkAndLogUsage(
      risn_email,
      risn_tool || 'unknown',
      risn_plan || 'paid'
    );
    if (!usageCheck.allowed) {
      return res.status(429).json({ error: usageCheck.message });
    }
  }

  // ── Build clean body for Anthropic ───────────────────────────────────────
  const requestedModel = claudeBody.model;
  const model = (requestedModel && APPROVED_MODELS[requestedModel])
    ? requestedModel
    : DEFAULT_MODEL;
  const body = { ...claudeBody, model };

  // ── Add web search if requested ───────────────────────────────────────────
  if (risn_web_search === true) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    // Extract text block if web search was used
    if (risn_web_search && data.content) {
      const textBlock = data.content.find(b => b.type === 'text');
      if (textBlock) {
        return res.status(200).json({ ...data, content: [textBlock] });
      }
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('Claude API error:', err);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
}
