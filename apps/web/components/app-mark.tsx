import * as React from "react";

import { cn } from "@/lib/utils";

type AppMarkProps = React.ComponentProps<"svg"> & {
  title?: string;
};

function AppMark({ className, title, ...props }: AppMarkProps) {
  return (
    <svg
      viewBox="0 0 36 36"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={cn("size-8 shrink-0 text-primary", className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <rect width="36" height="36" rx="10" fill="currentColor" />
      <path d="M11 10.5v15" stroke="var(--primary-foreground)" strokeWidth="1.5" strokeLinecap="round" opacity=".72" />
      <path d="M11.5 14h5.25m-5.25 8h5.25" stroke="var(--primary-foreground)" strokeWidth="1.5" strokeLinecap="round" opacity=".72" />
      <rect x="16" y="10" width="9" height="8" rx="2.4" fill="var(--primary-foreground)" />
      <rect x="16" y="18" width="9" height="8" rx="2.4" fill="var(--primary-foreground)" opacity=".82" />
      <circle cx="11" cy="14" r="2.25" fill="var(--primary-foreground)" />
      <circle cx="11" cy="22" r="2.25" fill="var(--primary-foreground)" />
    </svg>
  );
}

export { AppMark };
