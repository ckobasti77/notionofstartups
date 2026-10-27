"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/**
 * `pill` (podrazumevano): prekidač prikaza u okviru (Lista · Tabla).
 * `line`: podvučene kartice ekrana (Korpa, oblast) — PROSTOR P17.
 */
type TabsVariant = "pill" | "line";

function TabsList({ className, variant = "pill", ...props }: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        variant === "line"
          ? "group/tabs flex max-w-full flex-wrap items-center gap-x-1 text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]"
          : "group/tabs inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        "group-data-[variant=pill]/tabs:h-7 group-data-[variant=pill]/tabs:flex-1 group-data-[variant=pill]/tabs:rounded-md group-data-[variant=pill]/tabs:border group-data-[variant=pill]/tabs:border-transparent group-data-[variant=pill]/tabs:px-2 group-data-[variant=pill]/tabs:py-1 group-data-[variant=pill]/tabs:data-[state=active]:bg-background group-data-[variant=pill]/tabs:data-[state=active]:text-foreground group-data-[variant=pill]/tabs:data-[state=active]:shadow-sm",
        "group-data-[variant=line]/tabs:min-h-10 group-data-[variant=line]/tabs:shrink-0 group-data-[variant=line]/tabs:border-b-2 group-data-[variant=line]/tabs:border-transparent group-data-[variant=line]/tabs:px-2.5 group-data-[variant=line]/tabs:hover:text-foreground group-data-[variant=line]/tabs:data-[state=active]:border-primary group-data-[variant=line]/tabs:data-[state=active]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("mt-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
