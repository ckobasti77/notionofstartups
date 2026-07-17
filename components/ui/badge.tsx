import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[0.6875rem] font-semibold leading-none tracking-[0.01em] whitespace-nowrap transition-colors [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-card text-foreground",
        destructive: "border-transparent bg-destructive/12 text-destructive dark:bg-destructive/18",
        success: "border-transparent bg-success/12 text-success dark:bg-success/18",
        warning: "border-transparent bg-warning/18 text-warning-foreground dark:bg-warning/22",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);

type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
