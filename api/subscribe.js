// api/subscribe.js
// Saves email subscribers to Supabase subscribers table

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://getrisn.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required.' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
  }

  const emailKey = email.toLowerCase().trim();
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

  try {
    // Check if already subscribed
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(emailKey)}&select=id`,
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
      // Already subscribed — return success silently so UX is smooth
      return res.status(200).json({ success: true, message: "You're already subscribed!" });
    }

    // Save new subscriber
    await fetch(`${SUPABASE_URL}/rest/v1/subscribers`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ email: emailKey })
    });

    return res.status(200).json({
      success: true,
      message: "You're in! Welcome to the RISN community."
    });

  } catch (err) {
    console.error('Supabase subscribe error:', err);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
}
