// api/get-token.js
// Returns the API signing token to the frontend
// Only accessible from getrisn.com origins

export default async function handler(req, res) {
  const allowedOrigins = ['https://getrisn.com', 'https://www.getrisn.com'];
  const origin = req.headers.origin || req.headers.referer || '';

  // Allow requests from getrisn.com — check origin or referer
  const isAllowed = allowedOrigins.some(o => origin.startsWith(o))
    || allowedOrigins.includes(origin);

  if (!isAllowed) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.RISN_API_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server configuration error — RISN_API_SECRET not set' });
  }

  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.status(200).json({ token: secret });
}
