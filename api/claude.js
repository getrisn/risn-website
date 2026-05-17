// ─── Model Configuration ─────────────────────────────────────────────────────
// Approved models — only these can be used by the frontend
const APPROVED_MODELS = {
  'claude-sonnet-4-5': true,        // Default — resume, interview, company intel
  'claude-haiku-4-5-20251001': true, // Budget — cover letters, simple tasks
};
const DEFAULT_MODEL = 'claude-sonnet-4-5';

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Max generations per day for unlimited subscribers
const UNLIMITED_DAILY_CAP = 15;

async function checkRateLimit(email) {
  if (!email) return { allowed: true };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) return { allowed: true };

  try {
    // Get today's usage for this email
    const today = new Date().toISOString().split('T')[0];
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/usage_log?email=eq.${encodeURIComponent(email)}&date=eq.${today}&select=count`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const rows = await checkRes.json();
    const todayCount = rows && rows.length > 0 ? (rows[0].count || 0) : 0;

    if (todayCount >= UNLIMITED_DAILY_CAP) {
      return {
        allowed: false,
        message: `Daily limit of ${UNLIMITED_DAILY_CAP} generations reached. Resets at midnight. This keeps RISN fast and reliable for everyone.`
      };
    }

    // Log this usage
    if (rows && rows.length > 0) {
      // Update existing record
      await fetch(
        `${SUPABASE_URL}/rest/v1/usage_log?email=eq.${encodeURIComponent(email)}&date=eq.${today}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ count: todayCount + 1 })
        }
      );
    } else {
      // Create new record
      await fetch(`${SUPABASE_URL}/rest/v1/usage_log`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ email, date: today, count: 1 })
      });
    }

    return { allowed: true, todayCount: todayCount + 1 };

  } catch (err) {
    // If rate limit check fails, allow the request rather than block legitimate users
    console.error('Rate limit check error:', err);
    return { allowed: true };
  }
}

export default async function handler(req, res) {
  const allowedOrigins = ['https://getrisn.com', 'https://www.getrisn.com'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check rate limit for unlimited subscribers only
    const email = req.body.risn_email;
    const isUnlimited = req.body.risn_unlimited;

    if (email && isUnlimited) {
      const rateCheck = await checkRateLimit(email.toLowerCase().trim());
      if (!rateCheck.allowed) {
        return res.status(429).json({ error: rateCheck.message });
      }
    }

    // Always use the centrally configured model
    const { risn_email, risn_unlimited, risn_web_search, ...claudeBody } = req.body;
    // Use requested model if approved, otherwise fall back to default
    const requestedModel = claudeBody.model;
    const model = (requestedModel && APPROVED_MODELS[requestedModel]) ? requestedModel : DEFAULT_MODEL;
    const body = { ...claudeBody, model };

    // Add web search tool for company intel requests
    const useWebSearch = risn_web_search === true;
    if (useWebSearch) {
      body.tools = [{
        type: 'web_search_20250305',
        name: 'web_search'
      }];
    }

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

    // If web search was used, extract just the final text response
    if (useWebSearch && data.content) {
      const textBlock = data.content.find(b => b.type === 'text');
      if (textBlock) {
        return res.status(200).json({
          ...data,
          content: [textBlock]
        });
      }
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
}
