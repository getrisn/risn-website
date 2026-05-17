// api/claude.js
// RISN API Proxy — forwards requests to Anthropic with security layers
// Security: request signing, IP rate limiting, daily usage cap

// ─── Model Configuration ──────────────────────────────────────────────────────
const APPROVED_MODELS = {
  'claude-sonnet-4-5': true,
  'claude-haiku-4-5-20251001': true,
};
const DEFAULT_MODEL = 'claude-sonnet-4-5';
const UNLIMITED_DAILY_CAP = 15;

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

// ─── Daily Usage Cap (Supabase) ───────────────────────────────────────────────
async function checkAndLogUsage(email, tool) {
  if (!email) return { allowed: true };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return { allowed: true };

  try {
    const today = new Date().toISOString().split('T')[0];
    const emailKey = email.toLowerCase().trim();

    // Get today's total usage for this email
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/usage_log?email=eq.${encodeURIComponent(emailKey)}&date=eq.${today}&select=id,count,tool`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        }
      }
    );
    const rows = await checkRes.json();

    // Calculate total usage today across all tools
    const totalToday = rows.reduce((sum, r) => sum + (r.count || 0), 0);

    if (totalToday >= UNLIMITED_DAILY_CAP) {
      return {
        allowed: false,
        message: `Daily limit of ${UNLIMITED_DAILY_CAP} generations reached. Resets at midnight. This keeps RISN fast and fair for everyone.`
      };
    }

    // Find or create row for this tool today
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

    return { allowed: true, totalToday: totalToday + 1 };
  } catch (err) {
    console.error('Usage check error:', err);
    return { allowed: true }; // Fail open — never block legitimate users due to DB issues
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
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

  // Layer 1: Request signing
  const { risn_email, risn_unlimited, risn_web_search, risn_secret, risn_tool, ...claudeBody } = req.body;
  const expectedSecret = process.env.RISN_API_SECRET;
  if (expectedSecret && (!risn_secret || risn_secret !== expectedSecret)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // Layer 2: IP rate limiting
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkIPLimit(clientIP)) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }

  // Layer 3: Daily usage cap for unlimited subscribers
  if (risn_email && risn_unlimited) {
    const usageCheck = await checkAndLogUsage(risn_email, risn_tool || 'unknown');
    if (!usageCheck.allowed) {
      return res.status(429).json({ error: usageCheck.message });
    }
  }

  // Build clean body for Anthropic
  const requestedModel = claudeBody.model;
  const model = (requestedModel && APPROVED_MODELS[requestedModel]) ? requestedModel : DEFAULT_MODEL;
  const body = { ...claudeBody, model };

  // Add web search tool if requested
  const useWebSearch = risn_web_search === true;
  if (useWebSearch) {
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

    // Extract just the text block if web search was used
    if (useWebSearch && data.content) {
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
