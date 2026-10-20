/**
 * app.js — frontend controller.
 *
 * Flow:
 *   1. POST /api/pair or /api/qr
 *   2. render the code / QR and poll /api/session/:id every 2 s
 *   3. on status "paired", show the session download
 *
 * The pairing code itself is never stored anywhere but in this page's memory
 * and in the response from our own server.
 */

const state = {
  mode: 'pair',
  session: null,
  pollTimer: null,
  tickTimer: null,
  tickExpiresAt: 0,
};

const $ = (id) => document.getElementById(id);

const STEP_HTML = {
  pair: [
    'Open WhatsApp → <b>Settings</b> → <b>Linked Devices</b>',
    'Tap <b>Link a Device</b> → <b>Link with phone number instead</b>',
    'Enter the code shown above',
  ],
  qr: [
    'Open WhatsApp → <b>Settings</b> → <b>Linked Devices</b>',
    'Tap <b>Link a Device</b>',
    'Point your phone at the QR code above',
  ],
};

// ── HTTP helpers ────────────────────────────────────────────────
async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.error ?? `Request failed (${response.status})`);
    error.code = data?.code ?? 'HTTP_ERROR';
    error.status = response.status;
    throw error;
  }
  return data;
}

// ── UI helpers ──────────────────────────────────────────────────
function setStatus(text, kind = '') {
  const element = $('status');
  element.textContent = text;
  element.className = `status${kind ? ` is-${kind}` : ''}`;
}

function setBusy(busy) {
  $('start-pair').disabled = busy;
  $('start-qr').disabled = busy;
}

function show(id, visible) {
  $(id).classList.toggle('is-hidden', !visible);
}

function renderSteps(mode) {
  $('steps').innerHTML = STEP_HTML[mode].map((line) => `<li>${line}</li>`).join('');
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function stopCountdown() {
  if (state.tickTimer) clearInterval(state.tickTimer);
  state.tickTimer = null;
  state.tickExpiresAt = 0;
}

function startCountdown(expiresAt) {
  if (state.tickTimer && state.tickExpiresAt === expiresAt) return;
  stopCountdown();
  state.tickExpiresAt = expiresAt;

  const tick = () => {
    const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    const timer = $('timer');
    if (left <= 0) {
      timer.textContent = 'Expired';
      timer.classList.add('is-warn');
      return;
    }
    const minutes = Math.floor(left / 60);
    const seconds = String(left % 60).padStart(2, '0');
    timer.textContent = `Expires in ${minutes}:${seconds}`;
    timer.classList.toggle('is-warn', left <= 30);
  };

  tick();
  state.tickTimer = setInterval(tick, 1000);
}

function resetUi({ release = true } = {}) {
  if (release) releaseSession();
  stopPolling();
  stopCountdown();
  state.session = null;
  state.tickExpiresAt = 0;

  show('result', false);
  show('download-box', false);
  show('code-box', false);
  show('qr-box', false);
  $('qr-image').removeAttribute('src');
  $('code-value').textContent = '';
  $('timer').textContent = '';
  setStatus('');
}

function releaseSession() {
  const id = state.session?.id;
  if (!id) return;
  fetch(`/api/session/${encodeURIComponent(id)}/release`, {
    method: 'POST',
    keepalive: true,
  }).catch(() => {});
}

// ── Rendering ───────────────────────────────────────────────────
function renderSession(session) {
  if (session.status === 'failed') {
    stopPolling();
    stopCountdown();
    show('result', false);
    setStatus(session.error ?? 'Something went wrong. Please try again.', 'error');
    return;
  }

  if (session.status === 'paired') {
    stopPolling();
    stopCountdown();
    show('result', false);
    show('download-box', true);
    $('download').href = `/api/session/${encodeURIComponent(session.id)}/download`;
    setStatus('Session ready — download it and keep it private.', 'ok');
    return;
  }

  show('result', true);
  renderSteps(session.mode);

  if (session.mode === 'pair') {
    show('qr-box', false);
    show('code-box', Boolean(session.code));
    show('copy', Boolean(session.code));
    if (session.code) $('code-value').textContent = session.code;
  } else {
    show('code-box', false);
    show('copy', false);
    show('qr-box', Boolean(session.qr));
    if (session.qr) $('qr-image').src = session.qr;
  }

  if (session.status === 'awaiting') {
    setStatus(
      session.mode === 'pair'
        ? 'Code ready — enter it in WhatsApp now. It expires in about 2 minutes.'
        : 'Scan the QR code from WhatsApp → Linked Devices.',
      'info'
    );
  } else {
    setStatus('Connecting to WhatsApp…', 'info');
  }

  startCountdown(session.expiresAt);
}

// ── Session lifecycle ───────────────────────────────────────────
function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(async () => {
    if (!state.session) return;
    try {
      const session = await requestJson(`/api/session/${encodeURIComponent(state.session.id)}`);
      state.session = session;
      renderSession(session);
    } catch (error) {
      if (error.code === 'NOT_FOUND') {
        stopPolling();
        stopCountdown();
        show('result', false);
        setStatus('This session expired. Generate a new one.', 'error');
        return;
      }
      // Network blips are normal on free hosts; keep polling.
    }
  }, 2000);
}

async function startSession(mode) {
  resetUi();

  const number = $('number').value.trim();
  if (mode === 'pair' && !isValidNumber(number)) {
    setStatus('Enter a valid number with country code, e.g. +91 98765 43210.', 'error');
    $('number').focus();
    return;
  }

  setBusy(true);
  setStatus(mode === 'pair' ? 'Requesting a pairing code…' : 'Creating a QR code…', 'info');

  try {
    const session = await requestJson(`/api/${mode}`, {
      method: 'POST',
      body: JSON.stringify(mode === 'pair' ? { number } : {}),
    });
    state.session = session;
    renderSession(session);
    startPolling();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

function isValidNumber(value) {
  let digits = String(value).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return /^[1-9]\d{6,14}$/.test(digits);
}

// ── Interaction ─────────────────────────────────────────────────
function selectMode(mode) {
  if (state.mode === mode) return;
  resetUi();
  state.mode = mode;

  for (const tab of document.querySelectorAll('.tab')) {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  }

  show('panel-pair', mode === 'pair');
  show('panel-qr', mode === 'qr');
  setStatus('');
}

async function copyCode() {
  const code = state.session?.code;
  if (!code) return;

  const plain = code.replace(/-/g, '');
  try {
    await navigator.clipboard.writeText(plain);
    setStatus('Code copied. Paste it in WhatsApp.', 'ok');
  } catch {
    // Clipboard API needs HTTPS/localhost — fall back to a temporary input.
    const input = document.createElement('input');
    input.value = plain;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    try {
      document.execCommand('copy');
      setStatus('Code copied. Paste it in WhatsApp.', 'ok');
    } catch {
      setStatus(`Copy failed — type this code: ${code}`, 'error');
    }
    input.remove();
  }
}

async function loadConfig() {
  try {
    const config = await requestJson('/api/config');
    if (config.botName) {
      document.title = `${config.botName} — Link your WhatsApp device`;
      $('app-title').textContent = config.botName;
      $('footer-name').textContent = config.botName;
    }
    if (!config.allowPairing) {
      $('tab-pair').disabled = true;
      selectMode('qr');
    }
    if (!config.allowQr) {
      $('tab-qr').disabled = true;
      selectMode('pair');
    }
  } catch {
    // Defaults in the HTML are already usable.
  }
}

function bindEvents() {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      if (!tab.disabled) selectMode(tab.dataset.mode);
    });
  }

  $('start-pair').addEventListener('click', () => startSession('pair'));
  $('start-qr').addEventListener('click', () => startSession('qr'));
  $('copy').addEventListener('click', copyCode);
  $('reset').addEventListener('click', () => resetUi());

  $('number').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') startSession('pair');
  });

  $('api-button').addEventListener('click', () => $('api-dialog').showModal());
  $('api-close').addEventListener('click', () => $('api-dialog').close());

  // Stop polling when the tab is hidden; resume (with a fresh fetch) on return.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else if (state.session && !['paired', 'failed'].includes(state.session.status)) {
      startPolling();
    }
  });
}

bindEvents();
loadConfig();
