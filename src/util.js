/**
 * util.js — pure helpers shared by the server and the tests.
 *
 * No network, no filesystem: everything here is a plain string function so it
 * can be unit-tested without touching WhatsApp.
 */

/**
 * Normalize a user-typed phone number into the digits-only form that
 * Baileys' `requestPairingCode` expects.
 *
 * Accepts "+91 98765 43210", "0091-98765-43210", "(91) 98765 43210", etc.
 * Returns null when the input cannot be a valid international number.
 */
export function normalizeNumber(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[^\d]/g, '');
  // International prefix "00" is the same as "+".
  if (digits.startsWith('00')) digits = digits.slice(2);
  // E.164: country code + subscriber, 7-15 digits total, no leading zero.
  if (!/^[1-9]\d{6,14}$/.test(digits)) return null;
  return digits;
}

/** "ABCDEFGH" -> "ABCD-EFGH" (WhatsApp shows codes in 4-character groups). */
export function formatCode(raw) {
  const clean = String(raw ?? '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
  if (!clean) return '';
  return clean.match(/.{1,4}/g)?.join('-') ?? clean;
}

/** "919876543210" -> "********3210" — safe for logs and API responses. */
export function maskNumber(number) {
  const value = String(number ?? '');
  if (value.length <= 4) return '****';
  return `${'*'.repeat(Math.min(value.length - 4, 8))}${value.slice(-4)}`;
}
