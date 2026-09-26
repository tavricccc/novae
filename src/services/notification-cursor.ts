export type NotificationCursor = { createdAt: string; id: string } | null;

export function normalizeNotificationCursor(data: unknown): NotificationCursor {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : '';
  // Validate without round-tripping through Date, which loses cursor microseconds.
  return id && createdAt && Number.isFinite(Date.parse(createdAt)) ? { id, createdAt } : null;
}
