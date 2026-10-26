import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { cn } from "@/lib/utils";

import { presenceLabel } from "./collab-model";

export type PresenceEditor = { profileId: string; displayName: string; avatarUrl: string | null };

/**
 * „Ana uređuje" (PROSTOR P23, K07 §6.4): avatari 20 px (najviše tri) i tekst.
 * Prikazuje samo one koji uređuju; prazno = ništa. Najava je `polite`.
 */
export function PresenceIndicator({
  editors,
  className,
}: {
  editors: ReadonlyArray<PresenceEditor>;
  className?: string;
}) {
  const label = presenceLabel(editors.map((editor) => editor.displayName));
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {label ? (
        <>
          <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
            {editors.slice(0, 3).map((editor) => (
              <ProfileAvatar
                key={editor.profileId}
                profile={{ displayName: editor.displayName, avatarUrl: editor.avatarUrl }}
                className="size-5 ring-2 ring-background"
              />
            ))}
          </span>
          <span className="truncate text-xs text-muted-foreground">{label}</span>
        </>
      ) : null}
    </span>
  );
}
