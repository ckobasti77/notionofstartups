"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL nije podešen. Pokrenite `npx convex dev`. ");
}

const convex = new ConvexReactClient(convexUrl);

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system">
      <ConvexAuthProvider client={convex}>
        <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
      </ConvexAuthProvider>
      <Toaster />
    </ThemeProvider>
  );
}

