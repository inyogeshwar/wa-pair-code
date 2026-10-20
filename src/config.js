/**
 * config.js — environment loading and validation.
 *
 * Every value has a safe default so the service can boot on a free host with
 * zero configuration. Nothing secret lives here; the service needs no API keys
 * and no database.
 */
import 'dotenv/config';

/** Read a trimmed string or return the default. */
function str(env, key, fallback = '') {
  const raw = env[key];
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value === '' ? fallback : value;
}

/** Read a positive integer (or return the default); throws on garbage. */
function int(env, key, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = str(env, key);
  if (raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max} (got "${raw}").`);
  }
  return value;
}

/** Read a boolean ("true"/"false", "1"/"0", "yes"/"no"). */
function bool(env, key, fallback) {
  const raw = str(env, key).toLowerCase();
  if (raw === '') return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`${key} must be true or false (got "${raw}").`);
}

export const config = Object.freeze({
  /** HTTP port. Render/Heroku inject PORT automatically. */
  port: int(process.env, 'PORT', 3000, { min: 1, max: 65535 }),
  host: str(process.env, 'HOST', '0.0.0.0'),

  /** Shown in the page title and header. */
  botName: str(process.env, 'BOT_NAME', 'WA Pair Code'),

  /** Feature switches — turn either tab off without redeploying code. */
  allowPairing: bool(process.env, 'ALLOW_PAIRING', true),
  allowQr: bool(process.env, 'ALLOW_QR', true),

  /**
   * Hard cap on simultaneous sockets. Each Baileys socket costs roughly
   * 60-120 MB, and free hosts give 512 MB, so keep this small (2 is safe,
   * 3 is the practical maximum on Render's free plan).
   */
  maxSessions: int(process.env, 'MAX_SESSIONS', 2, { min: 1, max: 10 }),

  /** How long a session may wait for the user to pair (ms). */
  sessionTtlMs: int(process.env, 'SESSION_TTL_MS', 5 * 60_000, { min: 60_000, max: 15 * 60_000 }),
  /** How long a PAIRED session stays downloadable (ms). */
  pairedKeepMs: int(process.env, 'PAIRED_KEEP_MS', 10 * 60_000, { min: 60_000, max: 30 * 60_000 }),
  /** How long to wait for WhatsApp's first QR/ready signal (ms). */
  readyTimeoutMs: int(process.env, 'READY_TIMEOUT_MS', 30_000, { min: 10_000, max: 60_000 }),

  /** Per-IP request budget. */
  rateLimit: int(process.env, 'RATE_LIMIT', 5, { min: 1, max: 100 }),
  rateWindowMs: int(process.env, 'RATE_WINDOW_MS', 10 * 60_000, { min: 60_000, max: 60 * 60_000 }),

  /** Per-number request budget (WhatsApp also throttles pairing attempts). */
  numberLimit: int(process.env, 'NUMBER_LIMIT', 2, { min: 1, max: 10 }),
  numberWindowMs: int(process.env, 'NUMBER_WINDOW_MS', 10 * 60_000, { min: 60_000, max: 60 * 60_000 }),

  /** Set to 1 behind a reverse proxy (Render, Railway, Fly) for real client IPs. */
  trustProxy: bool(process.env, 'TRUST_PROXY', true),
});
