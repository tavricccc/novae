"use client";
import { t as translate, useI18n as useLocaleSubscription } from "@/i18n";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { useContentRealtime } from "@/hooks/use-content-realtime";
import { AppLocaleGate } from "@/components/app-locale-gate";
import { AppShell } from "@/components/app-shell";
import { BrandLockup } from "@/components/ui/brand";
import { RouteSurface } from "@/components/motion/route-surface";

const STARTUP_LABELS = {
  account: "ui.app.startup.account",
  content: "ui.app.startup.content",
  ready: "ui.app.startup.ready",
  security: "ui.app.startup.security",
  session: "ui.app.startup.session",
} as const;

export function AppStartupScreen({
  phase = "session",
}: {
  phase?: keyof typeof STARTUP_LABELS;
}) {
  useLocaleSubscription();
  const label = translate(STARTUP_LABELS[phase]);
  return (
    <div className="app-start-surface grid place-items-center">
      <div className="t-startup-sequence flex flex-col items-center gap-3 text-center">
        <BrandLockup
          className="t-startup-brand flex-col gap-2 [&>span:last-child]:text-2xl"
          markClassName="size-24 rounded-3xl p-4"
        />
        <div className="t-startup-status mt-0.5 min-h-6" aria-live="polite">
          <p
            className="t-shimmer text-base text-muted-foreground"
            data-text={label}
            key={phase}
          >{label}</p>
        </div>
      </div>
    </div>
  );
}

export function ProtectedApp({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const { initialized, loading, roleLoading, setupCompleted, startupPhase, user } = session;
  const [hasRetainedSession, setHasRetainedSession] = React.useState(false);
  useContentRealtime(pathname, Boolean(user && setupCompleted));

  React.useEffect(() => {
    if (!user) {
      setHasRetainedSession(false);
      return;
    }
    if (!loading && !roleLoading) setHasRetainedSession(true);
  }, [loading, roleLoading, user]);

  React.useEffect(() => {
    if (!initialized || loading || roleLoading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!setupCompleted && pathname !== "/setup") {
      router.replace("/setup");
      return;
    }
    if (setupCompleted && pathname === "/setup")
      router.replace("/issues");
  }, [
    initialized,
    loading,
    pathname,
    roleLoading,
    router,
    setupCompleted,
    user,
  ]);

  const waitingForFirstSession = !hasRetainedSession && (
    !initialized || loading || roleLoading
  );
  if (waitingForFirstSession)
    return <AppStartupScreen phase={startupPhase} />;
  if (!user) return <AppStartupScreen phase={startupPhase} />;
  if (!setupCompleted && pathname !== "/setup" && !hasRetainedSession)
    return <AppStartupScreen phase={startupPhase} />;
  if (setupCompleted && pathname === "/setup") return <AppStartupScreen phase={startupPhase} />;
  if (pathname === "/setup")
    return (
      <AppLocaleGate>
        <RouteSurface>{children}</RouteSurface>
      </AppLocaleGate>
    );
  return (
    <AppLocaleGate>
      <AppShell>{children}</AppShell>
    </AppLocaleGate>
  );
}
