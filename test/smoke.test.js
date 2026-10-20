/**
 * Pure-helper tests. No network, no Baileys — safe to run in CI.
 *
 *   npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCode, maskNumber, normalizeNumber } from '../src/util.js';

test('normalizeNumber accepts common formatting', () => {
  assert.equal(normalizeNumber('+91 98765 43210'), '919876543210');
  assert.equal(normalizeNumber('0091-98765-43210'), '919876543210');
  assert.equal(normalizeNumber('(91) 98765 43210'), '919876543210');
  assert.equal(normalizeNumber('15551234567'), '15551234567');
});

test('normalizeNumber rejects garbage and impossible numbers', () => {
  assert.equal(normalizeNumber(''), null);
  assert.equal(normalizeNumber(null), null);
  assert.equal(normalizeNumber(undefined), null);
  assert.equal(normalizeNumber('abc'), null);
  assert.equal(normalizeNumber('123'), null);
  assert.equal(normalizeNumber('0123456789'), null, 'no leading zero after country code');
  assert.equal(normalizeNumber('1234567890123456'), null, 'more than 15 digits');
});

test('formatCode groups characters in fours', () => {
  assert.equal(formatCode('ABCDEFGH'), 'ABCD-EFGH');
  assert.equal(formatCode('abcd-efgh'), 'ABCD-EFGH');
  assert.equal(formatCode('ABCD'), 'ABCD');
  assert.equal(formatCode(''), '');
  assert.equal(formatCode(null), '');
});

test('maskNumber keeps only the tail', () => {
  assert.equal(maskNumber('919876543210'), '********3210');
  assert.equal(maskNumber('1234'), '****');
  assert.equal(maskNumber(''), '****');
});
