// api/get-token.js
// Serves the API signing secret to RISN frontend pages.
//
// HONEST SECURITY NOTE: A no-login browser app cannot perfectly hide a secret —
// origin/referer headers can be spoofed by a determined attacker using a direct
// HTTP client. This endpoint is a SOFT gate. The real protection against abuse of
// a leaked secret is the Supabase-backed IP rate limiter in claude.js plus the
// monthly Anthropic spend cap. This function just raises the bar against casual
// scraping: it requires BOTH origin and referer to match, rejects everything that
// isn't a same-site request, and refuses to let the token sit in any cache.

export default async function handler(req, res) {
  const allowedDomains = ['getrisn.com', 'www.getrisn.com'];
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';

  // Reflect a valid origin only.
  const matchedOrigin = allowedDomains.find(d => origin.includes(d));
  if (matchedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Require BOTH an allowed origin AND an allowed referer. Spoofing one is easy;
  // spoofing both consistently is harder and filters out casual scraping.
  const originOk = allowedDomains.some(d => origin.includes(d));
  const refererOk = allowedDomains.some(d => referer.includes(d));

  if (!originOk || !refererOk) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const secret = process.env.RISN_API_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Never cache the secret anywhere — not in the browser, not in a CDN.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  return res.status(200).json({ token: secret });
}
