// api/get-token.js
// Serves the API signing secret to authenticated frontend pages
// Validates the request comes from getrisn.com via referer or origin

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://getrisn.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Check origin or referer to verify request comes from getrisn.com
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const host = req.headers.host || '';

  const allowedDomains = ['getrisn.com', 'www.getrisn.com'];
  const isAllowed =
    allowedDomains.some(d => origin.includes(d)) ||
    allowedDomains.some(d => referer.includes(d)) ||
    allowedDomains.some(d => host.includes(d));

  if (!isAllowed) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const secret = process.env.RISN_API_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.status(200).json({ token: secret });
}
