"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Camera, LoaderCircle, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProfileWithAvatar } from "@/components/workspace/types";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function ProfileDialog({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileWithAvatar;
}) {
  const updateCurrent = useMutation(api.profiles.updateCurrent);
  const generateUploadUrl = useMutation(api.storage.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.storage.setAvatar);
  const removeAvatar = useMutation(api.storage.removeAvatar);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!displayName.trim()) return;
    setBusy(true);
    try {
      if (file) {
        const upload = await generateUploadUrl({});
        const response = await fetch(upload.uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok) throw new Error("Slika nije otpremljena.");
        const payload = (await response.json()) as { storageId: Id<"_storage"> };
        await setAvatar({ storageId: payload.storageId, token: upload.token });
      }
      if (displayName.trim() !== profile.displayName) {
        await updateCurrent({ displayName: displayName.trim() });
      }
      toast.success("Profil je sačuvan.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Profil nije sačuvan.");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage() {
    setBusy(true);
    try {
      await removeAvatar({});
      setFile(null);
      toast.success("Profilna slika je uklonjena.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Slika nije uklonjena.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <form onSubmit={save}>
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="size-5 text-primary" /> Moj profil
            </DialogTitle>
            <DialogDescription>
              Ime i slika koje ostatak tima vidi uz tvoje beleške i zadatke.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="flex items-center gap-4">
              <ProfileAvatar profile={profile} className="size-16" />
              <div className="min-w-0">
                <Label htmlFor="profile-avatar" className="mb-2">
                  Profilna slika
                </Label>
                <Input
                  id="profile-avatar"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="h-auto py-2 text-xs"
                  onChange={(event) => {
                    const next = event.target.files?.[0] ?? null;
                    if (next && next.size > 5 * 1024 * 1024) {
                      toast.error("Slika može imati najviše 5 MB.");
                      event.currentTarget.value = "";
                      return;
                    }
                    setFile(next);
                  }}
                />
                <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                  PNG, JPG ili WebP · najviše 5 MB
                </p>
              </div>
            </div>
            {profile.avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={busy}
                onClick={removeImage}
              >
                <Trash2 /> Ukloni trenutnu sliku
              </Button>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="profile-name">Ime koje tim vidi</Label>
              <Input
                id="profile-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={profile.email} disabled />
            </div>
          </div>
          <DialogFooter className="border-t bg-muted/25 px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Otkaži
            </Button>
            <Button type="submit" disabled={busy || !displayName.trim()}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Camera />} Sačuvaj profil
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
