/**
 * server.js — HTTP API + static frontend for the pairing-code service.
 *
 * Endpoints
 *   POST /api/pair                { number }  → create a pairing-code session
 *   POST /api/qr                              → create a QR session
 *   GET  /api/session/:id                     → poll status / refreshed QR
 *   GET  /api/session/:id/download            → zip of the auth files (paired only)
 *   GET  /api/config                          → public feature flags for the UI
 *   GET  /healthz                             → liveness probe
 *
 * The service stores nothing in a database. Sessions live in memory, auth
 * files live in the OS temp directory, and both are deleted on expiry.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { log } from './logger.js';
import { maskNumber, normalizeNumber } from './util.js';
import {
  SessionError,
  activeCount,
  activeSlots,
  buildSessionArchive,
  createSession,
  destroyAll,
  destroySession,
  getSession,
  publicView,
  startSweeper,
} from './session-manager.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(express.json({ limit: '8kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
// Static assets are not fingerprinted, so a long max-age would keep serving a
// stale app.js after a deploy. Revalidate on every request instead: unchanged
// files come back as a 304, which costs almost nothing.
app.use(express.static(publicDir, { etag: true, lastModified: true, maxAge: 0 }));

/** Wrap an async route so rejections reach the error handler. */
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ── Rate limiting ───────────────────────────────────────────────────
/** Per-IP budget: protects the box from a single abusive client. */
function createIpLimiter({ limit, windowMs }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) hits.delete(key);
    }
  }, Math.min(windowMs, 60_000)).unref?.();

  return (req, res, next) => {
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      const minutes = Math.max(1, Math.ceil((entry.resetAt - now) / 60_000));
      res.status(429).json({
        error: `Too many requests from this network. Try again in ${minutes} minute(s).`,
        code: 'RATE_LIMITED',
      });
      return;
    }
    next();
  };
}

const ipLimiter = createIpLimiter({ limit: config.rateLimit, windowMs: config.rateWindowMs });

/** Per-number budget: WhatsApp throttles pairing attempts per number anyway. */
const numberHits = new Map();
function allowNumber(number) {
  const now = Date.now();
  const recent = (numberHits.get(number) ?? []).filter((t) => now - t < config.numberWindowMs);
  if (recent.length >= config.numberLimit) return false;
  recent.push(now);
  numberHits.set(number, recent);
  return true;
}

// ── Routes ──────────────────────────────────────────────────────────
app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    sessions: activeCount(),
    slots: activeSlots(),
    maxSlots: config.maxSessions,
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    botName: config.botName,
    allowPairing: config.allowPairing,
    allowQr: config.allowQr,
    maxSessions: config.maxSessions,
    sessionTtlMs: config.sessionTtlMs,
  });
});

app.post(
  '/api/pair',
  ipLimiter,
  wrap(async (req, res) => {
    if (!config.allowPairing) {
      res.status(403).json({ error: 'Pairing codes are disabled on this server.', code: 'DISABLED' });
      return;
    }

    const number = normalizeNumber(req.body?.number);
    if (!number) {
      res.status(400).json({
        error: 'Enter a valid WhatsApp number with country code, e.g. +91 98765 43210.',
        code: 'BAD_NUMBER',
      });
      return;
    }

    if (!allowNumber(number)) {
      res.status(429).json({
        error: 'Too many code requests for this number. Wait a few minutes and try again.',
        code: 'NUMBER_RATE_LIMITED',
      });
      return;
    }

    const session = await createSession({ number, mode: 'pair' });
    log.info(
      { session: session.id.slice(0, 8), number: maskNumber(number) },
      'pairing code generated'
    );
    res.status(201).json(session);
  })
);

app.post(
  '/api/qr',
  ipLimiter,
  wrap(async (req, res) => {
    if (!config.allowQr) {
      res.status(403).json({ error: 'QR login is disabled on this server.', code: 'DISABLED' });
      return;
    }
    const session = await createSession({ mode: 'qr' });
    log.info({ session: session.id.slice(0, 8) }, 'qr session created');
    res.status(201).json(session);
  })
);

app.get(
  '/api/session/:id',
  wrap(async (req, res) => {
    const session = getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found or already expired.', code: 'NOT_FOUND' });
      return;
    }
    res.json(publicView(session));
  })
);

app.get(
  '/api/session/:id/download',
  wrap(async (req, res) => {
    const archive = await buildSessionArchive(req.params.id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="wa-session-${String(req.params.id).slice(0, 8)}.zip"`
    );
    res.send(archive);
  })
);

app.post(
  '/api/session/:id/release',
  wrap(async (req, res) => {
    const session = getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found.', code: 'NOT_FOUND' });
      return;
    }
    await destroySession(session.id);
    res.json({ ok: true });
  })
);

// Unknown API routes get JSON, not the HTML index.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' });
});

// ── Error handling ──────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity
app.use((error, req, res, next) => {
  if (error instanceof SessionError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  log.error({ err: error?.message, stack: error?.stack }, 'unhandled request error');
  res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' });
});

// ── Boot ────────────────────────────────────────────────────────────
startSweeper();

const server = app.listen(config.port, config.host, () => {
  log.info(
    {
      port: config.port,
      maxSessions: config.maxSessions,
      allowPairing: config.allowPairing,
      allowQr: config.allowQr,
    },
    'pairing web service listening'
  );
});

/** Close sockets and wipe temp auth dirs before exiting. */
async function shutdown(signal) {
  log.info({ signal }, 'shutting down');
  server.close();
  await destroyAll().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export { app, server };
