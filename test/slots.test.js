/**
 * Slot accounting — the scaling rule that keeps a busy server responsive.
 *
 * A linked session only keeps its auth files so the user can download them.
 * It must NOT occupy one of the MAX_SESSIONS socket slots, otherwise one
 * pairing blocks new visitors for PAIRED_KEEP_MS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { _sessionsForTests, activeSlots } from '../src/session-manager.js';

test('only sessions that still need a socket occupy a slot', () => {
  _sessionsForTests.clear();

  _sessionsForTests.set('linked', { id: 'linked', status: 'paired' });
  _sessionsForTests.set('waiting', { id: 'waiting', status: 'awaiting' });
  _sessionsForTests.set('starting', { id: 'starting', status: 'requesting' });
  _sessionsForTests.set('broken', { id: 'broken', status: 'failed' });

  assert.equal(activeSlots(), 2, 'requesting + awaiting hold sockets; paired + failed do not');

  _sessionsForTests.clear();
  assert.equal(activeSlots(), 0);
});
