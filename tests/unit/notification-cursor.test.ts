import { describe, expect, it } from 'vitest';
import { normalizeNotificationCursor } from '@/services/notification-cursor';

describe('notification cursor', () => {
  it('keeps the database timestamp precision across page requests', () => {
    const cursor = { id: 'notification-id', createdAt: '2026-01-01T00:00:00.123456+00:00' };
    expect(normalizeNotificationCursor(cursor)).toEqual(cursor);
  });

  it.each([null, {}, { id: 'id', createdAt: 'invalid' }, { createdAt: '2026-01-01' }])(
    'rejects invalid cursors: %j', (cursor) => {
      expect(normalizeNotificationCursor(cursor)).toBeNull();
    },
  );
});
