/** Shares server events only. Credentials never leave the socket-owning tab. */
export function createRealtimeTabCoordinator(
  scope: string,
  callbacks: {
    onLeadership: (leader: boolean) => void;
    onEvent: (value: unknown) => void;
    onResync: () => void;
  },
) {
  let channel: BroadcastChannel | null = null;
  let stopped = false;
  let leader = false;
  let ready = false;
  let eligible = false;
  let controller: AbortController | null = null;
  let release: (() => void) | null = null;
  const participant = crypto.randomUUID();
  // Locks provide atomic election and automatic release when a tab disappears.
  // If either API is missing/blocked, preserve the independent-tab transport.
  if (typeof BroadcastChannel !== 'undefined' && typeof navigator.locks?.request === 'function') {
    try { channel = new BroadcastChannel(`novae:realtime:v1:${scope}`); } catch { /* fallback */ }
  }
  const post = (message: unknown) => channel?.postMessage(message);
  if (channel) {
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (stopped || !data || typeof data !== 'object') return;
      const message = data as { type?: string; value?: unknown; target?: string; sender?: string };
      if (message.type === 'hello' && leader && ready) post({ type: 'ready', target: message.sender });
      if (message.type === 'event' && !leader) callbacks.onEvent(message.value);
      if (message.type === 'ready' && eligible && !leader
        && (!message.target || message.target === participant)) callbacks.onResync();
    };
  }
  const setLeader = (next: boolean) => {
    if (leader === next) return;
    leader = next;
    ready = false;
    callbacks.onLeadership(next);
  };
  return {
    setEligible(nextEligible: boolean) {
      if (stopped) return;
      const resumed = nextEligible && !eligible;
      eligible = nextEligible;
      if (!channel) { setLeader(eligible); return; }
      if (!eligible) {
        controller?.abort();
        controller = null;
        setLeader(false);
        release?.();
        release = null;
        return;
      }
      // A background follower still invalidates caches from events, but only
      // asks for a fresh read once it can display the result again.
      if (resumed) post({ type: 'hello', sender: participant });
      if (controller) return;
      const pending = new AbortController();
      controller = pending;
      void navigator.locks.request(`novae:realtime:v1:${scope}`, { signal: pending.signal }, async () => {
        if (stopped || pending.signal.aborted) return;
        await new Promise<void>((resolve) => {
          release = resolve;
          setLeader(true);
        });
      }).catch(() => {
        if (stopped || pending.signal.aborted || controller !== pending) return;
        // Some embedded browsers expose Locks but reject requests.
        channel?.close();
        channel = null;
        setLeader(true);
      });
    },
    publish(value: unknown) { if (leader) post({ type: 'event', value }); },
    connected() {
      if (!leader) return;
      ready = true;
      post({ type: 'ready' });
    },
    stop() {
      stopped = true;
      controller?.abort();
      setLeader(false);
      release?.();
      channel?.close();
      channel = null;
    },
  };
}
