"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

/**
 * Provider je odvojen od `tooltip.tsx` jer ga koristi koren aplikacije
 * (`app-providers.tsx`): `TooltipContent` uvozi GSAP (`usePopEnter`), a koren
 * ne sme da ga povuče u prvo učitavanje — GSAP stiže lenjo sa ljuskom.
 */
function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

export { TooltipProvider };
