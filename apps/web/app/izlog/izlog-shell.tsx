"use client";

import { useLayoutEffect } from "react";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

import { izlogHref, type IzlogTema } from "./params";
import { IZLOG_EKRANI } from "./registry";

const linkBase =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors";

export function IzlogShell({ ekran, tema }: { ekran: string; tema: IzlogTema }) {
  const { setForcedTheme } = useTheme();
  useLayoutEffect(() => {
    setForcedTheme(tema);
    return () => setForcedTheme(null);
  }, [tema, setForcedTheme]);

  // hasOwn: `?ekran=constructor` ne sme da pogodi Object.prototype.
  const entry = Object.hasOwn(IZLOG_EKRANI, ekran) ? IZLOG_EKRANI[ekran] : undefined;
  const Ekran = entry?.Komponenta;
  const ekrani = Object.entries(IZLOG_EKRANI);

  return (
    <div className="app-canvas min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="w-full min-w-0 sm:w-auto sm:flex-1">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Izlog · samo u razvoju
            </p>
            <h1 className="truncate text-lg font-bold tracking-[-0.02em]">
              {entry ? entry.naslov : "Ekran ne postoji"}
            </h1>
          </div>
          <nav aria-label="Ekrani izloga" className="flex flex-wrap gap-1">
            {ekrani.map(([ime, podaci]) => (
              <Link
                key={ime}
                href={izlogHref(ime, tema)}
                aria-current={ime === ekran ? "page" : undefined}
                className={cn(
                  linkBase,
                  ime === ekran ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {ime}
                <span className="font-mono text-[0.625rem] opacity-70">{podaci.korak}</span>
              </Link>
            ))}
          </nav>
          <div role="group" aria-label="Tema" className="flex gap-1 rounded-xl border bg-card p-1">
            {(["dark", "light"] as const).map((opcija) => {
              const Icon = opcija === "dark" ? Moon : Sun;
              return (
                <Link
                  key={opcija}
                  href={izlogHref(ekran, opcija)}
                  aria-current={opcija === tema ? "true" : undefined}
                  className={cn(
                    linkBase,
                    opcija === tema ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {opcija === "dark" ? "Tamna" : "Svetla"}
                </Link>
              );
            })}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {Ekran ? (
          <Ekran />
        ) : (
          <div className="desk-surface mx-auto max-w-md rounded-2xl border bg-card p-6">
            <h2 className="text-base font-semibold">Ekran „{ekran}&ldquo; ne postoji</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Izaberi jedan od postojećih:</p>
            <ul className="mt-4 space-y-1">
              {ekrani.map(([ime, podaci]) => (
                <li key={ime}>
                  <Link href={izlogHref(ime, tema)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                    {podaci.naslov}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
