// risn-access.js
// Shared access control system for all RISN tool pages
// Handles promo codes, session counting, and payment gating

const RISN_ACCESS_KEY = 'risn_access';

// ─── Session Management ───────────────────────────────────────────────────────

function getAccess() {
  try {
    const raw = sessionStorage.getItem(RISN_ACCESS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    // Check expiry for unlimited codes
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      sessionStorage.removeItem(RISN_ACCESS_KEY);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function setAccess(data) {
  sessionStorage.setItem(RISN_ACCESS_KEY, JSON.stringify(data));
}

function hasAccess() {
  const access = getAccess();
  if (!access) return false;
  if (access.type === 'unlimited') return true;
  if (access.type === 'sessions' && access.sessionsRemaining > 0) return true;
  return false;
}

function consumeSession() {
  const access = getAccess();
  if (!access) return false;
  if (access.type === 'unlimited') return true;
  if (access.sessionsRemaining > 0) {
    access.sessionsRemaining--;
    setAccess(access);
    return true;
  }
  return false;
}

function getSessionsRemaining() {
  const access = getAccess();
  if (!access) return 0;
  if (access.type === 'unlimited') return '∞';
  return access.sessionsRemaining || 0;
}

// ─── Modal HTML ───────────────────────────────────────────────────────────────

function injectModal() {
  const modal = document.createElement('div');
  modal.id = 'risnAccessModal';
  modal.innerHTML = `
    <div id="risnModalOverlay" style="
      display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);
      z-index:9999;display:flex;align-items:center;justify-content:center;
      padding:1rem;backdrop-filter:blur(4px);
    ">
      <div style="
        background:white;border-radius:20px;width:100%;max-width:460px;
        overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.3);
      ">
        <!-- Header -->
        <div style="background:#0a0a0a;padding:1.5rem 1.75rem;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <p style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:white;letter-spacing:2px;line-height:1;">RISN</p>
            <p style="font-size:12px;color:#555;margin-top:2px;">Start your session</p>
          </div>
          <button onclick="closeRisnModal()" style="background:none;border:none;color:#555;font-size:22px;cursor:pointer;padding:4px;">✕</button>
        </div>

        <!-- Session indicator (shown if has partial access) -->
        <div id="risnSessionBanner" style="display:none;background:#F5F0FF;padding:10px 1.75rem;border-bottom:0.5px solid #e8e8e8;">
          <p style="font-size:13px;color:#7C3AFF;font-weight:500;" id="risnSessionText"></p>
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
              <a href="#" id="payBtn1" style="background:#7C3AFF;color:white;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;padding:9px 18px;border-radius:6px;text-decoration:none;white-space:nowrap;">$3.99</a>
            </div>
            <div style="border:2px solid #7C3AFF;border-radius:10px;padding:1rem 1.25rem;display:flex;align-items:center;justify-content:space-between;position:relative;">
              <div style="position:absolute;top:-10px;left:12px;background:#7C3AFF;color:white;font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px;">MOST POPULAR</div>
              <div>
                <p style="font-size:14px;font-weight:700;color:#0a0a0a;">Starter pack</p>
                <p style="font-size:12px;color:#888;">3 sessions — mix any tools</p>
              </div>
              <a href="#" id="payBtn3" style="background:#7C3AFF;color:white;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;padding:9px 18px;border-radius:6px;text-decoration:none;white-space:nowrap;">$7.99</a>
            </div>
            <div style="border:0.5px solid #e8e8e8;border-radius:10px;padding:1rem 1.25rem;display:flex;align-items:center;justify-content:space-between;">
              <div>
                <p style="font-size:14px;font-weight:700;color:#0a0a0a;">Unlimited</p>
                <p style="font-size:12px;color:#888;">All tools, all month</p>
              </div>
              <a href="#" id="payBtnUnlimited" style="background:#7C3AFF;color:white;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;padding:9px 18px;border-radius:6px;text-decoration:none;white-space:nowrap;">$14.99/mo</a>
            </div>
          </div>

          <p style="font-size:11px;color:#bbb;text-align:center;">Secured by Stripe · SSL encrypted · No account required</p>
        </div>

        <!-- Code Tab -->
        <div id="risnCodeTab" style="padding:1.5rem 1.75rem;display:none;">
          <p style="font-size:13px;color:#888;margin-bottom:1.25rem;">Enter your promo code and email address. Each code can only be used once per email.</p>

          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:13px;font-weight:500;color:#0a0a0a;margin-bottom:6px;">Email address</label>
            <input type="email" id="risnCodeEmail" placeholder="your@email.com" style="width:100%;padding:10px 14px;border:1px solid #e8e8e8;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;outline:none;" />
          </div>

          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:13px;font-weight:500;color:#0a0a0a;margin-bottom:6px;">Promo code</label>
            <input type="text" id="risnCodeInput" placeholder="e.g. GETRISN3-KIM" style="width:100%;padding:10px 14px;border:1px solid #e8e8e8;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;outline:none;text-transform:uppercase;letter-spacing:1px;" />
          </div>

          <div id="risnCodeError" style="display:none;background:#FCEBEB;border:1px solid #F09595;border-radius:8px;padding:10px 14px;font-size:13px;color:#791F1F;margin-bottom:1rem;"></div>
          <div id="risnCodeSuccess" style="display:none;background:#D1FAE5;border:1px solid #6EE7B7;border-radius:8px;padding:10px 14px;font-size:13px;color:#065F46;margin-bottom:1rem;"></div>

          <button onclick="validateCode()" id="risnCodeBtn" style="width:100%;padding:12px;background:#7C3AFF;color:white;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">Apply Code</button>

          <p style="font-size:11px;color:#bbb;text-align:center;margin-top:1rem;">Don't have a code? <a href="#" onclick="switchTab('pay');return false;" style="color:#7C3AFF;">Choose a plan →</a></p>
        </div>

      </div>
    </div>`;
  document.body.appendChild(modal);

  // Update session banner if has access
  updateSessionBanner();
}

function updateSessionBanner() {
  const banner = document.getElementById('risnSessionBanner');
  const text = document.getElementById('risnSessionText');
  if (!banner || !text) return;

  const access = getAccess();
  if (access && access.type === 'sessions' && access.sessionsRemaining > 0) {
    banner.style.display = 'block';
    text.textContent = `You have ${access.sessionsRemaining} session${access.sessionsRemaining !== 1 ? 's' : ''} remaining`;
  } else if (access && access.type === 'unlimited') {
    banner.style.display = 'block';
    const exp = access.expiresAt ? new Date(access.expiresAt).toLocaleDateString() : 'soon';
    text.textContent = `Unlimited access active · expires ${exp}`;
  }
}

// ─── Modal Controls ───────────────────────────────────────────────────────────

function openRisnModal(onSuccess) {
  window._risnOnSuccess = onSuccess;
  const overlay = document.getElementById('risnModalOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    updateSessionBanner();
  }
}

function closeRisnModal() {
  const overlay = document.getElementById('risnModalOverlay');
  if (overlay) overlay.style.display = 'none';
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

    // Store access
    setAccess({
      type: data.type,
      sessionsRemaining: data.sessions,
      expiresAt: data.expiresAt,
      email: email,
      code: code
    });

    successEl.textContent = data.message;
    successEl.style.display = 'block';
    btn.textContent = 'Apply Code';
    btn.disabled = false;

    // Auto-close and proceed after 1.5s
    setTimeout(() => {
      closeRisnModal();
      if (window._risnOnSuccess) window._risnOnSuccess();
    }, 1500);

  } catch (err) {
    errorEl.textContent = 'Something went wrong. Please try again.';
    errorEl.style.display = 'block';
    btn.textContent = 'Apply Code';
    btn.disabled = false;
  }
}

// ─── Main Gate Function ───────────────────────────────────────────────────────
// Call this before any AI generation. Passes through if access exists,
// otherwise shows modal. Calls callback when access is confirmed.

function risnGate(callback) {
  if (hasAccess()) {
    // Has valid access — consume a session and proceed
    consumeSession();
    callback();
    return;
  }
  // No access — show modal
  openRisnModal(() => {
    // After successful code entry, consume session and proceed
    consumeSession();
    callback();
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  injectModal();

  // Close modal on overlay click
  document.getElementById('risnModalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('risnModalOverlay')) closeRisnModal();
  });

  // Uppercase code input as user types
  const codeInput = document.getElementById('risnCodeInput');
  if (codeInput) {
    codeInput.addEventListener('input', () => {
      const pos = codeInput.selectionStart;
      codeInput.value = codeInput.value.toUpperCase();
      codeInput.setSelectionRange(pos, pos);
    });
  }
});
