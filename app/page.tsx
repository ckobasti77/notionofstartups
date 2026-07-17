import { Suspense } from "react";

import { AppRoot } from "@/components/app-root";

function PageFallback() {
  return (
    <main className="app-canvas grid min-h-svh place-items-center">
      <span className="sr-only">Učitavanje aplikacije</span>
      <div className="size-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<PageFallback />}>
      <AppRoot />
    </Suspense>
  );
}
