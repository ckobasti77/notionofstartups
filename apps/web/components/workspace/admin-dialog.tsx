"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ImageUp, LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { LOGO_MAX_BYTES, SETTINGS_TEXT } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StartupLogo } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";

/**
 * Dijalog „Novi startup" (samo admin). Podešavanja postojećeg startupa su
 * ruta `?view=settings` (`settings/settings-container.tsx`, K20).
 */
export function AdminDialog({
  open,
  onOpenChange,
  onStartupCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartupCreated: (startupId: Id<"startups">) => void;
}) {
  const createStartup = useMutation(api.startups.create);
  const generateLogoUploadUrl = useMutation(api.startups.generateLogoUploadUrl);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  function chooseLogo(file: File | null) {
    setLogoFile(file);
    setLogoPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (logoFile && logoFile.size > LOGO_MAX_BYTES) {
        throw new Error(SETTINGS_TEXT.logoTooBig);
      }
      let logoStorageId: Id<"_storage"> | undefined;
      if (logoFile) {
        const uploadUrl = await generateLogoUploadUrl({});
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": logoFile.type || "application/octet-stream" },
          body: logoFile,
        });
        if (!response.ok) throw new Error(SETTINGS_TEXT.logoUploadFailed);
        logoStorageId = ((await response.json()) as { storageId: Id<"_storage"> }).storageId;
      }
      const startupId = await createStartup({
        name: name.trim(),
        description: description.trim(),
        logoStorageId,
      });
      toast.success("Startup je napravljen.");
      onStartupCreated(startupId);
      onOpenChange(false);
    } catch (error) {
      toast.error(accessErrorMessage(error, "Startup nije napravljen."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novi startup</DialogTitle>
          <DialogDescription className="sr-only">Naziv, opis i logo novog startupa.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="flex items-center gap-4">
            <StartupLogo
              startup={{ name: name || "Startup", logoUrl: logoPreviewUrl }}
              className="size-14 rounded-xl"
            />
            <div className="min-w-0">
              <Label htmlFor="startup-logo">Logo</Label>
              <div className="mt-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                  <ImageUp aria-hidden="true" /> {logoFile ? "Promeni" : "Dodaj logo"}
                </Button>
              </div>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">PNG, JPG, WebP ili SVG do 2 MB.</p>
              <input
                ref={logoInputRef}
                id="startup-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(event) => chooseLogo(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="startup-name">Naziv</Label>
            <Input
              id="startup-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="startup-description">Kratak opis</Label>
            <Textarea
              id="startup-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
            />
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            Napravi startup
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
