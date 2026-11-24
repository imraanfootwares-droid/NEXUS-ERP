const DAY_MS = 24 * 60 * 60 * 1000;
const IST_MS = 5.5 * 60 * 60 * 1000;
const ALWAYS_KEEP = 3;

/**
 * Sized for free storage: keeps every backup for 2 days, the newest per day for
 * 14 days, and the newest per month for 6 months. The three most recent are never removed.
 */
export function backupsToPrune<T extends { id: string; created_at: string | Date }>(list: T[], now = new Date()): string[] {
  const sorted = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const days = new Set<string>();
  const months = new Set<string>();
  const remove: string[] = [];

  sorted.forEach((backup, index) => {
    const at = new Date(backup.created_at);
    const age = now.getTime() - at.getTime();
    const day = new Date(at.getTime() + IST_MS).toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const firstOfDay = !days.has(day);
    const firstOfMonth = !months.has(month);
    days.add(day);
    months.add(month);

    const keep =
      index < ALWAYS_KEEP ||
      age <= 2 * DAY_MS ||
      (age <= 14 * DAY_MS && firstOfDay) ||
      (age <= 180 * DAY_MS && firstOfMonth);
    if (!keep) remove.push(backup.id);
  });
  return remove;
}
