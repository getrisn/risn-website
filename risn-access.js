// risn-access.js
// RISN Access Control System
// Uses Supabase for persistent session management across tabs and browsers

const RISN_EMAIL_KEY = 'risn_user_email';

// ─── Email Storage ────────────────────────────────────────────────────────────

function getSavedEmail() {
  try { return localStorage.getItem(RISN_EMAIL_KEY) || ''; } catch { return ''; }
}

function saveEmail(email) {
  try { localStorage.setItem(RISN_EMAIL_KEY, email); } catch {}
}

// ─── Session Check via API ────────────────────────────────────────────────────

async function checkActiveSession(email) {
  if (!email) return null;
  try {
    const response = await fetch('/api/check-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (data.valid) return data;
    return null;
  } catch {
    return null;
  }
}

async function consumeSession(sessionId) {
  if (!sessionId) return;
  try {
    await fetch('/api/consume-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
  } catch {}
}

// ─── Modal HTML ───────────────────────────────────────────────────────────────

function injectModal() {
  const modal = document.createElement('div');
  modal.id = 'risnAccessModal';
  modal.innerHTML = `
    <div id="risnModalOverlay" style="
      display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);
      z-index:9999;align-items:center;justify-content:center;
      padding:1rem;backdrop-filter:blur(4px);pointer-events:none;
    ">
      <div style="
        background:white;border-radius:20px;width:100%;max-width:460px;
        overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.3);
        max-height:90vh;overflow-y:auto;
      ">
        <div style="background:#0a0a0a;padding:1.5rem 1.75rem;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;">
          <div>
            <p style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:white;letter-spacing:2px;line-height:1;">RISN</p>
            <p style="font-size:12px;color:#555;margin-top:2px;">Start your session</p>
          </div>
          <button onclick="closeRisnModal()" style="background:none;border:none;color:#555;font-size:22px;cursor:pointer;padding:4px;">✕</button>
        </div>

        <!-- Returning user check -->
        <div id="risnReturningSection" style="padding:1.25rem 1.75rem;background:#F5F0FF;border-bottom:0.5px solid #e8e8e8;display:none;">
          <p style="font-size:13px;color:#6D28D9;font-weight:500;margin-bottom:8px;">Already have access? Check your active session:</p>
          <div style="display:flex;gap:8px;">
            <input type="email" id="risnReturningEmail" placeholder="Enter your email" style="flex:1;padding:9px 14px;border:1px solid #e8e8e8;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;" />
            <button onclick="checkReturningUser()" style="padding:9px 16px;background:#7C3AFF;color:white;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;">Check</button>
          </div>
          <div id="risnReturningResult" style="margin-top:8px;font-size:12px;"></div>
        </div>

        <!-- Tabs -->
        <div style="display:flex;border-bottom:0.5px solid #e8e8e8;">
          <button id="tabPay" onclick="switchTab('pay')" style="flex:1;padding:14px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;border:none;background:#f7f7f7;color:#0a0a0a;cursor:pointer;border-bottom:2px solid #7C3AFF;">Pay to access</button>
          <button id="tabCode" onclick="switchTab('code')" style="flex:1;padding:14px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;border:none;background:white;color:#888;cursor:pointer;border-bottom:2px solid transparent;">Have a code?</button>
        </div>

        <!-- Pay Tab -->
        <div id="risnPayTab" style="padding:1.5rem 1.75rem;">
          <p style="font-size:13px;color:#888;margin-bottom:1.25rem;">Choose your plan — pay once, use immediately.</p>
          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:1.25rem;">
            <div style="border:0.5px solid #e8e8e8;border-radius:10px;padding:1rem 1.25rem;display:flex;align-items:center;justify-content:space-between;">
              <div>
                <p style="font-size:14px;font-weight:700;color:#0a0a0a;">Single use</p>
                <p style="font-size:12px;color:#888;">1 session — any tool</p>
              </div>
              <a href="#" id="payBtn1" style="background:#7C3AFF;color:white;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;padding:9px 18px;border-radius:6px;text-decoration:none;white-space:nowrap;">$4.99</a>
            </div>
            <div style="border:2px solid #7C3AFF;border-radius:10px;padding:1rem 1.25rem;display:flex;align-items:center;justify-content:space-between;position:relative;">
              <div style="position:absolute;top:-10px;left:12px;background:#7C3AFF;color:white;font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px;">MOST POPULAR</div>
              <div>
                <p style="font-size:14px;font-weight:700;color:#0a0a0a;">Starter pack</p>
                <p style="font-size:12px;color:#888;">3 sessions — mix any tools</p>
              </div>
              <a href="#" id="payBtn3" style="background:#7C3AFF;color:white;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;padding:9px 18px;border-radius:6px;text-decoration:none;white-space:nowrap;">$9.99</a>
            </div>
            <div style="border:0.5px solid #e8e8e8;border-radius:10px;padding:1rem 1.25rem;display:flex;align-items:center;justify-content:space-between;">
              <div>
                <p style="font-size:14px;font-weight:700;color:#0a0a0a;">Unlimited</p>
                <p style="font-size:12px;color:#888;">All tools, all month</p>
              </div>
              <a href="#" id="payBtnUnlimited" style="background:#7C3AFF;color:white;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;padding:9px 18px;border-radius:6px;text-decoration:none;white-space:nowrap;">$19.99/mo</a>
            </div>
          </div>
          <p style="font-size:11px;color:#bbb;text-align:center;">Secured by Stripe · SSL encrypted · No account required</p>
        </div>

        <!-- Code Tab -->
        <div id="risnCodeTab" style="padding:1.5rem 1.75rem;display:none;">
          <p style="font-size:13px;color:#888;margin-bottom:1.25rem;">Enter your email and promo code. Each code can only be used once per email address.</p>
          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:13px;font-weight:500;color:#0a0a0a;margin-bottom:6px;">Email address</label>
            <input type="email" id="risnCodeEmail" placeholder="your@email.com" style="width:100%;padding:10px 14px;border:1px solid #e8e8e8;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;outline:none;" />
          </div>
          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:13px;font-weight:500;color:#0a0a0a;margin-bottom:6px;">Promo code</label>
            <input type="text" id="risnCodeInput" placeholder="Enter your code here" style="width:100%;padding:10px 14px;border:1px solid #e8e8e8;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;outline:none;text-transform:uppercase;letter-spacing:1px;" />
          </div>
          <div id="risnCodeError" style="display:none;background:#FCEBEB;border:1px solid #F09595;border-radius:8px;padding:10px 14px;font-size:13px;color:#791F1F;margin-bottom:1rem;"></div>
          <div id="risnCodeSuccess" style="display:none;background:#D1FAE5;border:1px solid #6EE7B7;border-radius:8px;padding:10px 14px;font-size:13px;color:#065F46;margin-bottom:1rem;"></div>
          <button onclick="validateCode()" id="risnCodeBtn" style="width:100%;padding:12px;background:#7C3AFF;color:white;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">Apply Code</button>
          <p style="font-size:11px;color:#bbb;text-align:center;margin-top:1rem;">Already used a code? <a href="#" onclick="document.getElementById('risnReturningSection').style.display='block';return false;" style="color:#7C3AFF;">Check your session →</a></p>
          <p style="font-size:11px;color:#bbb;text-align:center;margin-top:6px;">Don't have a code? <a href="#" onclick="switchTab('pay');return false;" style="color:#7C3AFF;">Choose a plan →</a></p>
        </div>

      </div>
    </div>`;
  document.body.appendChild(modal);
}

// ─── Modal Controls ───────────────────────────────────────────────────────────

function openRisnModal(onSuccess) {
  window._risnOnSuccess = onSuccess;
  const overlay = document.getElementById('risnModalOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.style.pointerEvents = 'all';
    const saved = getSavedEmail();
    if (saved) {
      const emailInput = document.getElementById('risnCodeEmail');
      const returningInput = document.getElementById('risnReturningEmail');
      if (emailInput) emailInput.value = saved;
      if (returningInput) returningInput.value = saved;
      // Auto-show returning section if email is saved
      document.getElementById('risnReturningSection').style.display = 'block';
    }
  }
}

function closeRisnModal() {
  const overlay = document.getElementById('risnModalOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.style.pointerEvents = 'none';
  }
}

function switchTab(tab) {
  const payTab = document.getElementById('risnPayTab');
  const codeTab = document.getElementById('risnCodeTab');
  const tabPay = document.getElementById('tabPay');
  const tabCode = document.getElementById('tabCode');

  if (tab === 'pay') {
    payTab.style.display = 'block';
    codeTab.style.display = 'none';
    tabPay.style.background = '#f7f7f7';
    tabPay.style.color = '#0a0a0a';
    tabPay.style.fontWeight = '700';
    tabPay.style.borderBottom = '2px solid #7C3AFF';
    tabCode.style.background = 'white';
    tabCode.style.color = '#888';
    tabCode.style.fontWeight = '500';
    tabCode.style.borderBottom = '2px solid transparent';
  } else {
    payTab.style.display = 'none';
    codeTab.style.display = 'block';
    tabCode.style.background = '#f7f7f7';
    tabCode.style.color = '#0a0a0a';
    tabCode.style.fontWeight = '700';
    tabCode.style.borderBottom = '2px solid #7C3AFF';
    tabPay.style.background = 'white';
    tabPay.style.color = '#888';
    tabPay.style.fontWeight = '500';
    tabPay.style.borderBottom = '2px solid transparent';
  }
}

// ─── Returning User Check ─────────────────────────────────────────────────────

async function checkReturningUser() {
  const email = document.getElementById('risnReturningEmail').value.trim();
  const resultEl = document.getElementById('risnReturningResult');

  if (!email || !email.includes('@')) {
    resultEl.innerHTML = '<span style="color:#E24B4A;">Please enter a valid email.</span>';
    return;
  }

  resultEl.innerHTML = '<span style="color:#888;">Checking...</span>';

  const session = await checkActiveSession(email);

  if (session) {
    saveEmail(email);
    const expiry = session.expiresAt ? new Date(session.expiresAt).toLocaleDateString() : 'never';
    const msg = session.type === 'unlimited'
      ? `Unlimited access active — expires ${expiry}`
      : `${session.sessionsRemaining} session${session.sessionsRemaining !== 1 ? 's' : ''} remaining`;
    resultEl.innerHTML = `<span style="color:#065F46;font-weight:500;">✓ ${msg}</span>`;

    setTimeout(() => {
      closeRisnModal();
      if (window._risnOnSuccess) window._risnOnSuccess(session);
    }, 1500);
  } else {
    resultEl.innerHTML = '<span style="color:#E24B4A;">No active session found. Please use a code or purchase access below.</span>';
  }
}

// ─── Code Validation ──────────────────────────────────────────────────────────

async function validateCode() {
  const email = document.getElementById('risnCodeEmail').value.trim();
  const code = document.getElementById('risnCodeInput').value.trim();
  const errorEl = document.getElementById('risnCodeError');
  const successEl = document.getElementById('risnCodeSuccess');
  const btn = document.getElementById('risnCodeBtn');

  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  if (!email || !code) {
    errorEl.textContent = 'Please enter both your email and promo code.';
    errorEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Validating...';
  btn.disabled = true;

  try {
    const response = await fetch('/api/validate-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, email })
    });

    const data = await response.json();

    if (!data.valid) {
      errorEl.textContent = data.error || 'Invalid code. Please try again.';
      errorEl.style.display = 'block';
      btn.textContent = 'Apply Code';
      btn.disabled = false;
      return;
    }

    saveEmail(email);
    successEl.textContent = data.message;
    successEl.style.display = 'block';
    btn.textContent = 'Apply Code';
    btn.disabled = false;

    setTimeout(() => {
      closeRisnModal();
      if (window._risnOnSuccess) window._risnOnSuccess(data);
    }, 1500);

  } catch (err) {
    errorEl.textContent = 'Something went wrong. Please try again.';
    errorEl.style.display = 'block';
    btn.textContent = 'Apply Code';
    btn.disabled = false;
  }
}

// ─── Main Gate Function ───────────────────────────────────────────────────────

async function risnGate(callback) {
  const savedEmail = getSavedEmail();

  if (savedEmail) {
    const session = await checkActiveSession(savedEmail);
    if (session) {
      await consumeSession(session.sessionId);
      callback();
      return;
    }
  }

  openRisnModal(async (sessionData) => {
    if (sessionData && sessionData.sessionId) {
      await consumeSession(sessionData.sessionId);
    }
    callback();
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  injectModal();

  document.getElementById('risnModalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('risnModalOverlay')) closeRisnModal();
  });

  const codeInput = document.getElementById('risnCodeInput');
  if (codeInput) {
    codeInput.addEventListener('input', () => {
      const pos = codeInput.selectionStart;
      codeInput.value = codeInput.value.toUpperCase();
      codeInput.setSelectionRange(pos, pos);
    });
  }
});
