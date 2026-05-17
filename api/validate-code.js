// api/validate-code.js
// Server-side promo code validation for RISN
// Stores used codes in memory (resets on redeploy)
// For production: replace usedCodes with a Supabase table

const usedCodes = new Map(); // email -> [codes used]

// Valid base codes and their access levels
const BASE_CODES = {
  'GETRISN1': { sessions: 1, days: null, type: 'sessions' },
  'GETRISN3': { sessions: 3, days: null, type: 'sessions' },
  'GETRISN100': { sessions: null, days: 7, type: 'unlimited' },
  'GETRISNUNLIMITED': { sessions: null, days: 30, type: 'unlimited' },
};

function parseCode(code) {
  if (!code) return null;
  const upper = code.toUpperCase().trim();

  // Check exact match first
  if (BASE_CODES[upper]) {
    return { base: upper, access: BASE_CODES[upper] };
  }

  // Check prefix match for personalized codes (e.g. GETRISN1-ELI)
  for (const [base, access] of Object.entries(BASE_CODES)) {
    if (upper.startsWith(base + '-') && upper.length > base.length + 1) {
      return { base: upper, access }; // Full code is unique key
    }
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://getrisn.com');
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

  // Check if this email has already used this code
  const emailKey = email.toLowerCase().trim();
  const codeKey = parsed.base;
  const usedByEmail = usedCodes.get(emailKey) || [];

  if (usedByEmail.includes(codeKey)) {
    return res.status(200).json({
      valid: false,
      error: 'This code has already been used with this email address. Each code can only be used once per email.'
    });
  }

  // Mark code as used for this email
  usedByEmail.push(codeKey);
  usedCodes.set(emailKey, usedByEmail);

  // Build access grant
  const access = parsed.access;
  const expiresAt = access.days
    ? new Date(Date.now() + access.days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  return res.status(200).json({
    valid: true,
    type: access.type,
    sessions: access.sessions,
    days: access.days,
    expiresAt,
    email: emailKey,
    message: access.type === 'sessions'
      ? `Code accepted! You have ${access.sessions} session${access.sessions > 1 ? 's' : ''} to use.`
      : `Code accepted! You have unlimited access for ${access.days} days.`
  });
}
