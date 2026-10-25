/** Taster u stilu aplikacije (DNK: mono, 11 px, podloga `muted`). */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-grid min-w-6 place-items-center rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold leading-4 text-foreground">
      {children}
    </kbd>
  );
}
