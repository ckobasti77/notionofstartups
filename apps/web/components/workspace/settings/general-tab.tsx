"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, LoaderCircle, Trash2 } from "lucide-react";
import { LOGO_MAX_BYTES, SETTINGS_TEXT } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StartupLogo } from "@/components/workspace/workspace-ui";

export type GeneralTabProps = {
  name: string;
  description: string;
  logoUrl: string | null;
  /** Naziv, opis i logo menja samo admin; član vidi polja samo za čitanje. */
  canEdit: boolean;
  busy: boolean;
  /** `true` kad je izmena sačuvana (tek tada se bira novi logo briše iz forme). */
  onSave: (values: { name: string; description: string; logoFile: File | null }) => Promise<boolean>;
  onRemoveLogo: () => void;
};

/** Opšte: logo, naziv i kratak opis startupa. */
export function GeneralTab({ name, description, logoUrl, canEdit, busy, onSave, onRemoveLogo }: GeneralTabProps) {
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSaved = useRef({ name, description });

  // Izmena iz baze (tuđa ili posle čuvanja) menja polja samo dok forma nije prljava.
  useEffect(() => {
    const previous = lastSaved.current;
    if (previous.name === name && previous.description === description) return;
    setDraftName((current) => (current.trim() === previous.name ? name : current));
    setDraftDescription((current) => (current.trim() === previous.description ? description : current));
    lastSaved.current = { name, description };
  }, [name, description]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function chooseLogo(file: File | null) {
    setLogoError(null);
    if (file && file.size > LOGO_MAX_BYTES) {
      setLogoError(SETTINGS_TEXT.logoTooBig);
      return;
    }
    setLogoFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  const dirty = draftName.trim() !== name || draftDescription.trim() !== description || logoFile !== null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit || !draftName.trim() || busy || !dirty) return;
    const saved = await onSave({ name: draftName.trim(), description: draftDescription.trim(), logoFile });
    if (saved) {
      chooseLogo(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const shownLogo = previewUrl ?? logoUrl;

  return (
    <form className="max-w-xl space-y-5" onSubmit={submit}>
      <div className="flex items-center gap-4">
        <StartupLogo startup={{ name: draftName || name, logoUrl: shownLogo }} className="size-14 rounded-xl" />
        <div className="min-w-0">
          {canEdit ? <Label htmlFor="startup-logo">Logo</Label> : <span className="text-sm font-medium">Logo</span>}
          {canEdit ? (
            <>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  <ImageUp aria-hidden="true" /> {logoUrl || logoFile ? "Promeni" : "Dodaj logo"}
                </Button>
                {logoUrl && !logoFile ? (
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onRemoveLogo}>
                    <Trash2 aria-hidden="true" /> Ukloni
                  </Button>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">PNG, JPG, WebP ili SVG do 2 MB.</p>
              {logoError ? (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {logoError}
                </p>
              ) : null}
              <input
                ref={inputRef}
                id="startup-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => chooseLogo(event.target.files?.[0] ?? null)}
              />
            </>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="startup-name">Naziv</Label>
        <Input
          id="startup-name"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          maxLength={100}
          readOnly={!canEdit}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="startup-description">Kratak opis</Label>
        <Textarea
          id="startup-description"
          value={draftDescription}
          onChange={(event) => setDraftDescription(event.target.value)}
          maxLength={500}
          readOnly={!canEdit}
        />
      </div>
      {canEdit ? (
        <Button type="submit" aria-disabled={busy || !draftName.trim() || !dirty} className="aria-disabled:pointer-events-none aria-disabled:opacity-50">
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          Sačuvaj
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{SETTINGS_TEXT.adminOnlyGeneral}</p>
      )}
    </form>
  );
}
