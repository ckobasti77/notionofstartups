import * as React from "react";

import { cn } from "@/lib/utils";

function ScrollArea({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="scroll-area"
      className={cn("scrollbar-thin overflow-auto overscroll-contain", className)}
      {...props}
    />
  );
}

export { ScrollArea };
