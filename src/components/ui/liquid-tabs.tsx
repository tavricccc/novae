"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { timing } from "@/lib/motion-timing";

import { cn } from "@/lib/utils";

export interface LiquidTabOption {
  icon?: React.ReactNode;
  label: string;
  value: string;
}

interface LiquidTabsProps {
  ariaLabel: string;
  className?: string;
  /** On a mobile layout, spell out only the tab that is selected; the rest are icons. */
  compact?: boolean;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  options: LiquidTabOption[];
  value: string;
}

export function LiquidTabs({
  ariaLabel,
  className,
  compact = false,
  disabled = false,
  onValueChange,
  options,
  value,
}: LiquidTabsProps) {
  const layoutId = React.useId();

  return (
    // The caller's classes belong on the element it actually lays out, which is the
    // root; the rail inside keeps its own shape.
    <TabsPrimitive.Root
      className={cn("min-w-0 max-w-full", className)}
      value={value}
      onValueChange={onValueChange}
    >
      {/* The rail is the pill's frame of reference. It scrolls on its own axis
          and it sits inside a sticky header, so measuring the pill against the
          document would offset it by whatever the rail or the page has
          scrolled; a layout root measures it against the rail instead. */}
      <TabsPrimitive.List asChild aria-label={ariaLabel} aria-disabled={disabled}>
        <motion.div
          layoutRoot
          layoutScroll
          // The rail has no height of its own: it is as tall as the tabs inside
          // it plus its own padding. A fixed height here can only disagree with
          // the tabs, and the rail then reserves a scrollbar for the difference.
          className="t-tabs relative isolate inline-flex max-w-full items-center gap-[3px] overflow-x-auto rounded-full bg-[var(--tabs-bar-bg)] p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {options.map((option) => {
            const displayedActive = option.value === value;

            return (
              <TabsPrimitive.Trigger
                aria-label={option.label}
                className="t-tab t-tab-label relative z-10 isolate inline-flex h-[1.875rem] shrink-0 cursor-pointer appearance-none items-center justify-center gap-1 rounded-full border-0 bg-transparent px-3 font-semibold leading-4 text-[var(--tabs-text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-control-label=""
                data-displayed-active={displayedActive}
                data-liquid-tab={option.value}
                disabled={disabled}
                key={option.value}
                value={option.value}
              >
                {displayedActive ? (
                  <motion.span
                    aria-hidden="true"
                    className="t-tabs-pill absolute inset-0 z-0 rounded-full bg-[var(--tabs-pill-bg)] shadow-[var(--shadow-control)]"
                    initial={false}
                    layoutId={`liquid-tab-pill-${layoutId}`}
                    transition={timing("nav", "nav")}
                  />
                ) : null}
                {option.icon ? (
                  <span
                    aria-hidden="true"
                    className="relative z-10 inline-flex shrink-0"
                  >
                    {option.icon}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "relative z-10",
                    compact && !displayedActive && "hidden sm:inline",
                  )}
                >
                  {option.label}
                </span>
              </TabsPrimitive.Trigger>
            );
          })}
        </motion.div>
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}
