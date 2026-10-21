/**
 * logger.js — one structured logger for the whole service.
 *
 * Keeping a single instance means every module writes the same JSON shape,
 * so `npm start 2>&1 | jq` stays useful. Set LOG_LEVEL=debug for more detail.
 */
import pino from 'pino';

export const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });
