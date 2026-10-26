import { UserRound } from "lucide-react";
import { startupInitials, startupTone } from "@devotion/shared";

import { cn } from "@/lib/utils";

/**
 * Tonovi startupa (DNK §2.2). Klase moraju biti napisane cele — Tailwind ne
 * generiše klase sklopljene iz `${tone}`.
 */
const TONE_TINT = [
  "bg-startup-tone-1/15 text-startup-tone-1",
  "bg-startup-tone-2/15 text-startup-tone-2",
  "bg-startup-tone-3/15 text-startup-tone-3",
  "bg-startup-tone-4/15 text-startup-tone-4",
  "bg-startup-tone-5/15 text-startup-tone-5",
  "bg-startup-tone-6/15 text-startup-tone-6",
  "bg-startup-tone-7/15 text-startup-tone-7",
  "bg-startup-tone-8/15 text-startup-tone-8",
] as const;

const TONE_SOLID = [
  "bg-startup-tone-1 text-background",
  "bg-startup-tone-2 text-background",
  "bg-startup-tone-3 text-background",
  "bg-startup-tone-4 text-background",
  "bg-startup-tone-5 text-background",
  "bg-startup-tone-6 text-background",
  "bg-startup-tone-7 text-background",
  "bg-startup-tone-8 text-background",
] as const;

/** Pun ton startupa za veće pločice bez loga (npr. `StartupLogo`). */
export function startupSolidToneClass(name: string): string {
  return TONE_SOLID[startupTone(name)];
}

const SIZE = {
  xs: "size-4 text-[0.5rem]",
  sm: "size-5 text-[0.5625rem]",
  md: "size-7 text-[0.6875rem]",
  rail: "size-10 text-xs",
} as const;

const ICON_SIZE = { xs: "size-2.5", sm: "size-3", md: "size-4", rail: "size-5" } as const;

export type StartupChipSize = keyof typeof SIZE;

export type StartupChipProps = {
  /** `null` = „Lično". */
  startup: { name: string; logoUrl?: string | null } | null;
  size: StartupChipSize;
  /** `tint` u redovima (podrazumevano), `solid` u traci i za veći čip bez loga. */
  variant?: "tint" | "solid";
  /** Ime pored pločice. Bez imena pločica je dekorativna — okolina nosi ime. */
  showName?: boolean;
  className?: string;
  nameClassName?: string;
};

/**
 * Čip startupa — potpisni detalj ličnog nivoa (PLAN §7, DNK §1): squircle
 * pločica (zaobljenje 30 %) sa logom ili inicijalima i tonom izvedenim iz imena.
 * Isti startup ima istu boju svuda (traka, red zadatka, poruke) i na telefonu.
 * Ton nikad ne nosi status.
 */
export function StartupChip({
  startup,
  size,
  variant = "tint",
  showName = false,
  className,
  nameClassName,
}: StartupChipProps) {
  const tile =
    startup === null ? (
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center rounded-[30%] bg-muted text-muted-foreground",
          SIZE[size],
        )}
      >
        <UserRound className={ICON_SIZE[size]} />
      </span>
    ) : startup.logoUrl ? (
      <span
        aria-hidden="true"
        className={cn("relative shrink-0 overflow-hidden rounded-[30%] bg-muted", SIZE[size])}
      >
        {/* Logo je korisnički upload sa Convex storage URL-a (kao `StartupLogo`). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={startup.logoUrl} alt="" className="absolute inset-0 size-full object-cover" />
      </span>
    ) : (
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center rounded-[30%] font-bold leading-none tracking-[-0.02em]",
          SIZE[size],
          (variant === "solid" ? TONE_SOLID : TONE_TINT)[startupTone(startup.name)],
        )}
      >
        {startupInitials(startup.name)}
      </span>
    );

  if (!showName) return <span className={cn("inline-flex", className)}>{tile}</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {tile}
      <span className={cn("min-w-0 truncate", nameClassName)}>
        {startup === null ? "Lično" : startup.name}
      </span>
    </span>
  );
}
