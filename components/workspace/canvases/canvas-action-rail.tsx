"use client";

import type { ComponentType } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

import styles from "./canvas-action-rail.module.css";

export type CanvasActionRailIcon = ComponentType<{ className?: string }>;

export type CanvasActionRailItem = {
  id: string;
  label: string;
  icon: CanvasActionRailIcon;
  onSelect: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
};

export type CanvasActionRailSection = {
  id: string;
  items: CanvasActionRailItem[];
};

export function CanvasActionRail({
  ariaLabel,
  identity,
  sections,
  className,
}: {
  ariaLabel: string;
  identity: {
    label: string;
    icon: CanvasActionRailIcon;
    count?: number;
    pendingCount?: number;
    className?: string;
  };
  sections: CanvasActionRailSection[];
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const IdentityIcon = identity.icon;
  const visibleSections = sections.filter((section) => section.items.length > 0);
  const identityDescription = [
    identity.label,
    identity.count === undefined ? null : `${identity.count} stavki`,
    identity.pendingCount ? `${identity.pendingCount} na čekanju` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className={cn(styles.rail, className)}
      role="toolbar"
      aria-label={ariaLabel}
    >
      <div
        className={cn(
          styles.item,
          "bg-muted/75 text-foreground",
          identity.className,
        )}
        aria-label={identityDescription}
        title={identityDescription}
      >
        <span className={styles.label} aria-hidden="true">
          <span className={cn(styles.labelText, "text-xs font-bold")}>
            {identity.label}
          </span>
          {identity.count === undefined ? null : (
            <span className={styles.count}>{identity.count}</span>
          )}
        </span>
        <span className={styles.iconCell} aria-hidden="true">
          <IdentityIcon className="size-4" />
          {identity.pendingCount ? (
            <span className={styles.pendingDot} />
          ) : null}
        </span>
      </div>

      {visibleSections.map((section) => (
        <div
          key={section.id}
          className="contents"
          role="group"
          aria-label={section.id}
        >
          <span className={styles.separator} aria-hidden="true" />
          {section.items.map((item) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={item.id}
                type="button"
                className={cn(
                  styles.item,
                  styles.button,
                  "bg-card text-foreground",
                  item.active &&
                    "bg-primary/12 text-primary ring-1 ring-primary/25 hover:bg-primary/16 hover:text-primary",
                  item.className,
                )}
                aria-label={item.label}
                aria-pressed={item.active === undefined ? undefined : item.active}
                title={item.label}
                disabled={item.disabled}
                onClick={item.onSelect}
                whileTap={
                  shouldReduceMotion || item.disabled
                    ? undefined
                    : { scale: 0.97 }
                }
                transition={{ duration: 0.12 }}
              >
                <span className={styles.label} aria-hidden="true">
                  <span className={cn(styles.labelText, "text-xs font-semibold")}>
                    {item.label}
                  </span>
                </span>
                <span className={styles.iconCell} aria-hidden="true">
                  <Icon className="size-4" />
                </span>
              </motion.button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
