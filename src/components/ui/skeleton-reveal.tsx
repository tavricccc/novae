import * as React from "react";
import { cn } from "@/lib/utils";

export function SkeletonReveal({
  as = "span",
  children,
  className,
  enabled = true,
  skeleton,
  stableLayout = false,
}: {
  as?: "div" | "span";
  children: React.ReactNode;
  className?: string;
  enabled?: boolean;
  skeleton: React.ReactNode;
  stableLayout?: boolean;
}) {
  const Element = as;
  const Layer = as;
  if (!enabled && !stableLayout) return <Element className={className}>{children}</Element>;
  return (
    <Element
      className={cn("t-skel is-revealed", className)}
      data-block={as === "div" ? "true" : undefined}
    >
      {enabled ? (
        <Layer aria-hidden className="t-skel-skeleton is-pulsing">
          {skeleton}
        </Layer>
      ) : null}
      <Layer className="t-skel-content">{children}</Layer>
    </Element>
  );
}

export function SkeletonBadgeLabel({
  children,
  className,
  enabled,
  skeleton,
}: {
  children: React.ReactNode;
  className?: string;
  enabled: boolean;
  skeleton: React.ReactNode;
}) {
  return (
    <span className={cn("inline-grid place-items-center text-center", className)}>
      <SkeletonReveal enabled={enabled} skeleton={skeleton}>
        <span className="block w-full text-center">{children}</span>
      </SkeletonReveal>
    </span>
  );
}
