/**
 * session-manager.js — the only module that talks to makeWASocket.
 *
 * One "session" = one temporary Baileys socket used to link a device:
 *
 *   mode "pair" → wait for the first ready signal, ask WhatsApp for an
 *                 8-character pairing code for the given number, hand it back
 *   mode "qr"   → wait for the first QR payload, render it as a PNG data URL
 *
 * Why the first `qr` event and not an immediate call: `requestPairingCode`
 * throws "Connection Closed" if the socket has not finished its handshake.
 * The `qr` update is Baileys' own "I am ready" signal, so we key off that.
 *
 * Lifecycle guarantees:
 *   - hard cap on concurrent sockets (memory on free hosts)
 *   - every session expires; a sweeper closes the socket and wipes its auth dir
 *   - sockets are ended, never logged out — logging out would invalidate the
 *     credentials the user is about to download
 */
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { config } from './config.js';
import { log } from './logger.js';
import { formatCode, isLiveStatus } from './util.js';

/** Baileys is chatty on stdout; keep it quiet unless asked. */
const baileysLog = pino({ level: process.env.BAILEYS_LOG_LEVEL ?? 'silent' });

/** @type {Map<string, object>} session id → session */
const sessions = new Map();
let sweeper = null;

/** Error with an HTTP-friendly status and a stable machine code. */
export class SessionError extends Error {
  constructor(message, code = 'SESSION_ERROR', status = 400) {
    super(message);
    this.name = 'SessionError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Sessions that currently need a socket. Waiting sessions are live slots;
 * paired sessions only keep files on disk so the user can download them.
 */
export function activeSlots() {
  let count = 0;
  for (const session of sessions.values()) {
    if (isLiveStatus(session.status)) count += 1;
  }
  return count;
}

/**
 * Create a session and wait until it has a pairing code or a QR image.
 * Throws SessionError on capacity, timeout, or WhatsApp refusal.
 */
export async function createSession({ number = null, mode }) {
  if (sessions.size >= config.maxStoredSessions || activeSlots() >= config.maxSessions) {
    throw new SessionError(
      'The server is handling too many sessions right now. Please try again in a minute.',
      'BUSY',
      503
    );
  }

  const session = {
    id: randomUUID(),
    mode,
    number,
    status: 'requesting',
    code: null,
    qrDataUrl: null,
    error: null,
    authDir: path.join(os.tmpdir(), 'wa-pair-code', randomUUID()),
    sock: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + config.sessionTtlMs,
    released: false,
  };

  // Reserve the slot before the first await: two requests arriving together
  // must not both pass the capacity check above.
  sessions.set(session.id, session);

  try {
    await mkdir(session.authDir, { recursive: true });
    await openSocket(session);
  } catch (error) {
    await destroySession(session.id);
    throw error;
  }

  return publicView(session);
}

/** How many times one session may reopen its socket before giving up. */
const MAX_RECONNECTS = 10;

/** Open the socket and resolve as soon as we have a code / QR / open session. */
async function openSocket(session) {
  let settled = false;
  let resolveReady;
  let rejectReady;

  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  let timer = null;

  const ctx = {
    /** First QR / code / open arrived — the HTTP request can be answered. */
    ready() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveReady();
    },
    fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectReady(error);
    },
    /** Give the next connection attempt a fresh window. */
    rearm() {
      if (settled) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        ctx.fail(
          new SessionError(
            'WhatsApp did not respond in time. Please try again.',
            'TIMEOUT',
            504
          )
        );
      }, config.readyTimeoutMs);
    },
  };

  ctx.rearm();
  await connectSocket(session, ctx, 0);
  await ready;
}

/**
 * Create one socket and wire its lifecycle.
 *
 * Baileys never reconnects on its own. WhatsApp drops the socket as soon as
 * it has handed out its last QR ref (roughly two minutes) and again with 515
 * once a device links, so reopening it is the caller's job. Without that the
 * page keeps showing a QR that WhatsApp has already invalidated — exactly the
 * "couldn't log in" the phone reports when it scans a dead code — and a
 * successful pairing never reaches the "paired" state the download needs.
 */
async function connectSocket(session, ctx, attempt) {
  // The session may have been released or swept while the retry was queued.
  if (!sessions.has(session.id)) return;

  const { state, saveCreds } = await useMultiFileAuthState(session.authDir);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, baileysLog),
    },
    browser: Browsers.ubuntu('WA Pair Code'),
    // Do not announce "online" to contacts while linking.
    markOnlineOnConnect: false,
    // A linked device needs no history for this use case.
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    // This service never processes messages — it only links a device.
    shouldIgnoreJid: () => true,
    logger: baileysLog,
  });

  session.sock = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    try {
      const { connection, lastDisconnect, qr } = update;

      // ── Ready signal: a fresh QR payload ───────────────────────────
      if (qr) {
        if (session.mode === 'qr') {
          session.qrDataUrl = await QRCode.toDataURL(qr, {
            width: 340,
            margin: 1,
            errorCorrectionLevel: 'M',
          }).catch(() => null);
          if (session.status === 'requesting') session.status = 'awaiting';
          ctx.ready();
        } else if (session.mode === 'pair' && !session.code) {
          try {
            const raw = await sock.requestPairingCode(session.number);
            session.code = formatCode(raw);
            session.status = 'awaiting';
            ctx.ready();
          } catch {
            session.status = 'failed';
            session.error =
              'WhatsApp refused the pairing request. Check the number (with country code) and try again.';
            ctx.fail(new SessionError(session.error, 'PAIR_FAILED', 502));
          }
        }
      }

      // ── Device linked ──────────────────────────────────────────────
      if (connection === 'open') {
        session.status = 'paired';
        session.pairedAt = Date.now();
        session.expiresAt = Date.now() + config.pairedKeepMs;
        session.qrDataUrl = null;
        log.info({ session: session.id, me: session.number ?? 'linked' }, 'device linked');
        ctx.ready();

        // The auth directory is everything the download needs. Let the
        // handshake settle, then drop the socket so this slot is free for the
        // next visitor while the session stays downloadable.
        setTimeout(() => {
          if (session.status !== 'paired') return;
          closeSocket(session);
        }, 1500).unref?.();
      }

      // ── Closed: give up, or reopen and keep the code fresh ─────────
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          session.status = 'failed';
          session.error = 'WhatsApp rejected this session. Generate a new code.';
          ctx.fail(new SessionError(session.error, 'LOGGED_OUT', 409));
          return;
        }

        // Paired, released, or swept away — nothing left to keep alive.
        if (session.status === 'paired' || !sessions.has(session.id)) return;

        const canRetry =
          attempt < MAX_RECONNECTS &&
          session.status !== 'failed' &&
          Date.now() < session.expiresAt;

        if (!canRetry) {
          if (session.status !== 'failed') {
            session.status = 'failed';
            session.error = 'WhatsApp stopped answering. Generate a new code.';
          }
          return;
        }

        // The QR on screen belongs to the socket that just died. Drop it so
        // nobody scans a dead code, then open a fresh connection.
        session.qrDataUrl = null;
        if (session.mode === 'qr') session.status = 'requesting';
        log.info(
          {
            session: session.id,
            mode: session.mode,
            statusCode: statusCode ?? null,
            attempt: attempt + 1,
          },
          'socket closed; reopening'
        );
        ctx.rearm();

        setTimeout(() => {
          if (session.status === 'paired' || !sessions.has(session.id)) return;
          // Flush the credentials a just-finished pairing produced before the
          // next socket reads them back from disk.
          saveCreds()
            .catch(() => {})
            .finally(() => {
              if (session.status === 'paired' || !sessions.has(session.id)) return;
              connectSocket(session, ctx, attempt + 1).catch(() => {});
            });
        }, 500);
      }
    } catch {
      // A listener must never throw into the socket's emitter.
    }
  });
}

/** Public, secret-free representation sent to the browser. */
export function publicView(session) {
  return {
    id: session.id,
    mode: session.mode,
    status: session.status,
    code: session.code,
    qr: session.qrDataUrl,
    error: session.error,
    expiresAt: session.expiresAt,
    secondsLeft: Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000)),
  };
}

/** Look up a session by id. Returns null when it never existed or expired. */
export function getSession(id) {
  return sessions.get(String(id ?? '')) ?? null;
}

/** Close the socket WITHOUT logging out (keeps the linked device valid). */
function closeSocket(session) {
  try {
    session.sock?.end(undefined);
  } catch {
    /* already closed */
  }
  session.sock = null;
}

/** Close the socket, wipe its auth directory, and forget the session. */
export async function destroySession(id) {
  const session = sessions.get(String(id ?? ''));
  if (!session) return false;
  sessions.delete(session.id);
  closeSocket(session);
  await rm(session.authDir, { recursive: true, force: true }).catch(() => {});
  return true;
}

/**
 * Zip the session's auth files so the user can run their own bot with them.
 * Also releases the socket: two clients must never share one credential set
 * at the same time.
 */
export async function buildSessionArchive(id) {
  const session = getSession(id);
  if (!session) {
    throw new SessionError('Session not found or already expired.', 'NOT_FOUND', 404);
  }
  if (session.status !== 'paired') {
    throw new SessionError('This device is not linked yet.', 'NOT_PAIRED', 409);
  }

  const zip = new JSZip();
  const entries = await readdir(session.authDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    zip.file(entry.name, await readFile(path.join(session.authDir, entry.name)));
  }

  // Hand the credential over: stop using it here so the user's bot can connect.
  closeSocket(session);
  session.released = true;

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Number of live sessions (used by /healthz and the load-shedding check). */
export function activeCount() {
  return sessions.size;
}

/** Periodically drop expired sessions and their auth directories. */
export function startSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const session of [...sessions.values()]) {
      if (now >= session.expiresAt) {
        destroySession(session.id).catch(() => {});
      }
    }
  }, 15_000);
  sweeper.unref?.();
}

export function stopSweeper() {
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
}

/** Shutdown hook: close every socket and remove every auth directory. */
export async function destroyAll() {
  stopSweeper();
  await Promise.all([...sessions.keys()].map((id) => destroySession(id)));
}

export { sessions as _sessionsForTests };
