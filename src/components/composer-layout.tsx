"use client";
import { t as translate, useI18n as useLocaleSubscription } from "@/i18n";

import type { FormEvent, ReactNode } from "react";
import { ArrowUp } from "lucide-react";
import { useCloseRouteOverlay } from "@/components/detail-sheet";
import { SecondaryToolbar } from "@/components/detail-toolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HeaderBackdrop } from "@/components/ui/header-backdrop";
import { BusyLabel, PageHeader } from "@/components/ui/page-state";

/**
 * The frame every composer route is drawn in — and the frame its route skeleton
 * is drawn in as well.
 *
 * A skeleton that rebuilds the frame by hand drifts from it: different padding,
 * a card that bleeds to the screen edge in one and not the other, a field that
 * exists on one side only. The handoff from skeleton to form then reads as the
 * page rebuilding itself rather than finishing loading. Sharing the frame makes
 * that drift impossible, which is the whole reason this component exists.
 */
export function ComposerLayout({
  busy = false,
  children,
  onBack,
  onSubmit,
  submitBusyLabel,
  submitDisabled,
  submitLabel,
  succeeded = false,
  title,
}: {
  busy?: boolean;
  children: ReactNode;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitBusyLabel: string;
  submitDisabled: boolean;
  submitLabel: string;
  succeeded?: boolean;
  title: string;
}) {
  useLocaleSubscription();
  const closeRouteOverlay = useCloseRouteOverlay();
  const toolbar = (
    <SecondaryToolbar backLabel={translate("ui.common.back")} onBack={onBack} />
  );
  const form = (
    <form className="min-w-0" onSubmit={onSubmit}>
      <Card className="min-w-0 py-5 sm:py-6">
        <CardContent className="grid min-w-0 max-w-full gap-5 px-4 sm:px-6">
          <fieldset className="contents" disabled={busy} inert={busy}>
            {children}
          </fieldset>
          <div className="flex justify-end">
            <Button disabled={submitDisabled} type="submit">
              {busy ? null : <ArrowUp />}
              <BusyLabel
                busy={busy}
                busyLabel={submitBusyLabel}
                label={submitLabel}
                success={succeeded}
              />
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );

  if (closeRouteOverlay) {
    return (
      <div>
        <header className="detail-header">
          <HeaderBackdrop />
          {toolbar}
        </header>
        <div className="pt-2">{form}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        lead={toolbar}
        title={title}
      />
      {form}
    </div>
  );
}
