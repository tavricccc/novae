/** Coalesce event bursts, bound staleness, and queue one refresh behind a slow read. */
export function createRefreshScheduler(
  refresh: () => void | Promise<void>,
  available: () => boolean,
  { delayMs = 200, maxWaitMs = 1_000 }: { delayMs?: number; maxWaitMs?: number } = {},
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirtySince: number | null = null;
  let running = false;
  let disposed = false;
  const clear = () => { clearTimeout(timer); timer = undefined; };
  const schedule = (immediate = false) => {
    clear();
    if (disposed || running || dirtySince === null || !available()) return;
    const wait = immediate ? 0 : Math.min(delayMs, Math.max(0, maxWaitMs - (Date.now() - dirtySince)));
    timer = setTimeout(() => void run(), wait);
  };
  const run = async () => {
    clear();
    if (disposed || running || dirtySince === null || !available()) return;
    dirtySince = null;
    running = true;
    try {
      await refresh();
    } catch {
      // Refresh callbacks present their own errors; the next event can retry.
    } finally {
      running = false;
      schedule();
    }
  };
  return {
    request() {
      if (disposed) return;
      dirtySince ??= Date.now();
      schedule();
    },
    resume() { schedule(true); },
    dispose() { disposed = true; dirtySince = null; clear(); },
  };
}
