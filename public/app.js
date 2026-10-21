/**
 * app.js — frontend controller.
 *
 * 1. POST /api/pair or /api/qr
 * 2. render the code / QR, then poll /api/session/:id every 2 s
 * 3. when status becomes "paired", swap in the download panel
 *
 * The pairing code only ever lives in this tab's memory and in our own API
 * response. It is never written to storage.
 */

const state = {
  mode: 'pair',
  session: null,
  pollTimer: null,
  tickTimer: null,
  tickExpiresAt: 0,
  totalMs: 0,
};

const $ = (id) => document.getElementById(id);

const STEPS = {
  pair: [
    'Open WhatsApp → <b>Settings</b> → <b>Linked Devices</b>',
    'Tap <b>Link a device</b>',
    'Pick <b>Link with phone number</b> and enter the code',
  ],
  qr: [
    'Open WhatsApp → <b>Settings</b> → <b>Linked Devices</b>',
    'Tap <b>Link a device</b>',
    'Scan the QR code above',
  ],
};

const BUTTON_LABEL = {
  pair: 'Generate pairing code',
  qr: 'Generate QR code',
};

const CARD_SUB = {
  pair: 'Enter your number to receive a code.',
  qr: 'Scan a one-time code with your phone.',
};

// ── HTTP ────────────────────────────────────────────────────────
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

// ── Small UI primitives ─────────────────────────────────────────
let toastTimer = null;

function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('is-visible'), 2400);
}

function showAlert(message) {
  const element = $('alert');
  element.textContent = message;
  element.classList.remove('is-hidden');
}

function hideAlert() {
  $('alert').classList.add('is-hidden');
  $('alert').textContent = '';
}

function setBadge(text, kind = '') {
  const badge = $('result-badge');
  badge.textContent = text;
  badge.className = `badge${kind ? ` is-${kind}` : ''}`;
}

function show(id, visible) {
  $(id).classList.toggle('is-hidden', !visible);
}

function setBusy(busy, mode) {
  for (const key of ['pair', 'qr']) {
    const button = $(key === 'pair' ? 'start-pair' : 'start-qr');
    button.disabled = busy;
    button.textContent = busy && key === mode ? 'Connecting…' : BUTTON_LABEL[key];
  }
}

// ── Timers ──────────────────────────────────────────────────────
function formatClock(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
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
    const left = Math.max(0, expiresAt - Date.now());
    const total = state.totalMs || left || 1;
    const percent = Math.max(0, Math.min(100, (left / total) * 100));
    const seconds = Math.ceil(left / 1000);

    $('timer').textContent = seconds > 0 ? formatClock(seconds) : 'expired';
    $('timer').classList.toggle('is-warn', left <= 30_000);
    $('progress-bar').style.width = `${percent}%`;
    $('progress-bar').classList.toggle('is-warn', left <= 30_000);
  };

  tick();
  state.tickTimer = setInterval(tick, 1000);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

// ── Session lifecycle ───────────────────────────────────────────
function releaseSession() {
  const id = state.session?.id;
  if (!id) return;
  fetch(`/api/session/${encodeURIComponent(id)}/release`, {
    method: 'POST',
    keepalive: true,
  }).catch(() => {});
}

function resetUi({ release = true } = {}) {
  if (release) releaseSession();
  stopPolling();
  stopCountdown();

  state.session = null;
  state.totalMs = 0;
  state.tickExpiresAt = 0;

  show('result', false);
  show('download-box', false);
  show('code-box', false);
  show('code-note', false);
  show('qr-box', false);
  show('qr-note', true);
  $('qr-image').removeAttribute('src');
  $('code-value').textContent = '';
  $('timer').textContent = '';
  $('progress-bar').style.width = '100%';
  $('progress-bar').classList.remove('is-warn');
  hideAlert();
  setBadge('Waiting');
}

function renderSteps(mode) {
  $('steps').innerHTML = STEPS[mode].map((line) => `<li>${line}</li>`).join('');
}

function renderSession(session) {
  if (session.status === 'failed') {
    stopPolling();
    stopCountdown();
    show('result', false);
    setBadge('Failed', 'error');
    showAlert(session.error ?? 'Something went wrong. Please try again.');
    return;
  }

  if (session.status === 'paired') {
    stopPolling();
    stopCountdown();
    hideAlert();
    show('result', false);
    show('download-box', true);
    $('download').href = `/api/session/${encodeURIComponent(session.id)}/download`;
    return;
  }

  hideAlert();
  show('result', true);
  renderSteps(session.mode);
  show('qr-note', false);

  if (session.mode === 'pair') {
    show('qr-box', false);
    show('code-box', Boolean(session.code));
    show('code-note', Boolean(session.code));
    show('copy', Boolean(session.code));
    if (session.code) $('code-value').textContent = session.code;
  } else {
    show('code-box', false);
    show('code-note', false);
    show('copy', false);
    show('qr-box', Boolean(session.qr));
    if (session.qr) $('qr-image').src = session.qr;
  }

  const ready = session.status === 'awaiting';
  setBadge(ready ? 'Live' : 'Connecting', ready ? 'live' : '');
  startCountdown(session.expiresAt);
}

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
        setBadge('Expired', 'error');
        showAlert('This session expired. Generate a new code.');
        return;
      }
      // Transient network errors are expected on free hosts — keep polling.
    }
  }, 2000);
}

async function startSession(mode) {
  resetUi();

  const typed = $('number').value.trim();
  if (mode === 'pair' && !isValidNumber(typed)) {
    showAlert('Enter a valid number with country code, e.g. 91 98765 43210.');
    $('number').focus();
    return;
  }

  setBusy(true, mode);
  setBadge('Connecting');

  try {
    const session = await requestJson(`/api/${mode}`, {
      method: 'POST',
      body: JSON.stringify(mode === 'pair' ? { number: `+${typed.replace(/^\+/, '')}` } : {}),
    });
    state.session = session;
    state.totalMs = Math.max(1, (session.secondsLeft ?? 300) * 1000);
    renderSession(session);
    startPolling();
  } catch (error) {
    setBadge('Failed', 'error');
    showAlert(error.message);
  } finally {
    setBusy(false, mode);
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
  $('segmented').dataset.mode = mode;
  $('card-sub').textContent = CARD_SUB[mode];

  for (const tab of document.querySelectorAll('.segmented__btn')) {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  }

  show('panel-pair', mode === 'pair');
  show('panel-qr', mode === 'qr');
}

async function copyCode() {
  const code = state.session?.code;
  if (!code) return;

  const plain = code.replace(/-/g, '');
  try {
    await navigator.clipboard.writeText(plain);
    toast('Code copied');
    return;
  } catch {
    // Clipboard API needs HTTPS or localhost — fall back to a temp input.
  }

  const input = document.createElement('input');
  input.value = plain;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  try {
    document.execCommand('copy');
    toast('Code copied');
  } catch {
    toast(`Copy failed — code: ${code}`);
  }
  input.remove();
}

async function loadConfig() {
  try {
    const config = await requestJson('/api/config');
    if (config.botName) {
      document.title = `${config.botName} — Link a WhatsApp device`;
      $('app-title').textContent = config.botName;
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
    // The defaults in the markup are already usable.
  }
}

function bindEvents() {
  for (const tab of document.querySelectorAll('.segmented__btn')) {
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

  // Stop polling while the tab is hidden; refresh when it comes back.
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
