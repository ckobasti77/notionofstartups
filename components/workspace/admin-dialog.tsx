"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Copy,
  LoaderCircle,
  MailPlus,
  Plus,
  Settings2,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { StartupWithAreas } from "@/components/workspace/types";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function AdminDialog({
  open,
  onOpenChange,
  startup,
  onStartupCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startup?: StartupWithAreas;
  onStartupCreated: (startupId: Id<"startups">) => void;
}) {
  const createStartup = useMutation(api.startups.create);
  const updateStartup = useMutation(api.startups.update);
  const addMember = useMutation(api.startups.addMember);
  const removeMember = useMutation(api.startups.removeMember);
  const createInvite = useMutation(api.invites.create);
  const revokeInvite = useMutation(api.invites.revoke);
  const members = useQuery(
    api.startups.listMembers,
    open && startup ? { startupId: startup._id, limit: 50 } : "skip",
  );
  const profiles = useQuery(
    api.profiles.listAll,
    open ? { limit: 50 } : "skip",
  );
  const invites = useQuery(
    api.invites.list,
    open && startup ? { startupId: startup._id, limit: 50 } : "skip",
  );
  const [name, setName] = useState(startup?.name ?? "");
  const [description, setDescription] = useState(startup?.description ?? "");
  const [email, setEmail] = useState("");
  const [profileId, setProfileId] = useState<string>("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const availableProfiles = useMemo(
    () =>
      profiles?.filter(
        (candidate) =>
          !members?.some(({ profile }) => profile._id === candidate._id),
      ) ?? [],
    [members, profiles],
  );
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Promena nije sačuvana.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveStartup(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await run(
      async () => {
        if (startup)
          await updateStartup({
            startupId: startup._id,
            name: name.trim(),
            description: description.trim(),
          });
        else {
          const startupId = await createStartup({
            name: name.trim(),
            description: description.trim(),
          });
          onStartupCreated(startupId);
          onOpenChange(false);
        }
      },
      startup ? "Startup je ažuriran." : "Startup je kreiran.",
    );
  }
  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!startup || !email.trim()) return;
    setBusy(true);
    try {
      const result = await createInvite({
        startupId: startup._id,
        email: email.trim(),
      });
      setInviteCode(result.code);
      setEmail("");
      toast.success("Poziv je kreiran. Kopiraj link i pošalji ga članu tima.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Poziv nije kreiran.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-5 text-primary" /> Upravljanje radnim
            prostorom
          </DialogTitle>
          <DialogDescription>
            {startup
              ? `Startup ${startup.name}: podešavanja, ljudi i pozivi.`
              : "Kreiraj prvi privatni prostor za svoj tim."}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="startup" className="px-6 pb-6">
          <TabsList className="mt-5 grid w-full grid-cols-3">
            <TabsTrigger value="startup">Startup</TabsTrigger>
            <TabsTrigger value="members" disabled={!startup}>
              Članovi
            </TabsTrigger>
            <TabsTrigger value="invites" disabled={!startup}>
              Pozivi
            </TabsTrigger>
          </TabsList>
          <TabsContent value="startup" className="mt-5">
            <form className="space-y-4" onSubmit={saveStartup}>
              <div className="space-y-2">
                <Label htmlFor="startup-name">Naziv</Label>
                <Input
                  id="startup-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Naziv startupa"
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startup-description">Kratak opis</Label>
                <Textarea
                  id="startup-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Šta gradimo i za koga?"
                  maxLength={500}
                />
              </div>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : startup ? (
                  <Settings2 />
                ) : (
                  <Plus />
                )}
                {startup ? "Sačuvaj promene" : "Kreiraj startup"}
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="members" className="mt-5">
            <div className="flex gap-2">
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Izaberi postojeći profil" />
                </SelectTrigger>
                <SelectContent>
                  {availableProfiles.map((candidate) => (
                    <SelectItem key={candidate._id} value={candidate._id}>
                      {candidate.displayName} · {candidate.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!startup || !profileId || busy}
                onClick={() =>
                  startup &&
                  run(
                    () =>
                      addMember({
                        startupId: startup._id,
                        profileId: profileId as Id<"profiles">,
                      }).then(() => setProfileId("")),
                    "Član je dodat.",
                  )
                }
              >
                <UserPlus /> Dodaj
              </Button>
            </div>
            <div className="mt-5 space-y-2">
              {members?.map(({ profile }) => (
                <div
                  key={profile._id}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-border/70 px-3"
                >
                  <ProfileAvatar profile={profile} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {profile.displayName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {profile.email}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {profile.role === "admin" ? "Admin" : "Član"}
                  </span>
                  {profile.role !== "admin" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Ukloni ${profile.displayName}`}
                      disabled={busy}
                      onClick={() =>
                        startup &&
                        run(
                          () =>
                            removeMember({
                              startupId: startup._id,
                              profileId: profile._id,
                            }),
                          "Član je uklonjen.",
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              )) ?? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  <UsersRound className="mx-auto mb-2 size-5" /> Učitavanje
                  članova…
                </p>
              )}
            </div>
          </TabsContent>
          <TabsContent value="invites" className="mt-5">
            <form className="flex gap-2" onSubmit={invite}>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ime@startup.com"
                aria-label="Email za poziv"
              />
              <Button type="submit" disabled={!email.trim() || busy}>
                <MailPlus /> Pozovi
              </Button>
            </form>
            {inviteCode ? (
              <div className="mt-4 rounded-xl border border-primary/25 bg-primary/6 p-4">
                <p className="text-xs font-semibold text-primary">
                  Novi pozivni link
                </p>
                <code className="mt-2 block break-all rounded-lg bg-card px-3 py-2 text-sm">
                  /?invite={inviteCode}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(
                        `${window.location.origin}/?invite=${encodeURIComponent(inviteCode)}`,
                      )
                      .then(() => toast.success("Pozivni link je kopiran."))
                  }
                >
                  <Copy /> Kopiraj pozivni link
                </Button>
              </div>
            ) : null}
            <div className="mt-5 space-y-2">
              {invites?.map((item) => {
                const expired = item.expiresAt <= now;
                const inactive =
                  item.claimedAt !== null || item.revokedAt !== null || expired;
                return (
                  <div
                    key={item._id}
                    className="flex min-h-14 items-center gap-3 rounded-xl border border-border/70 px-3"
                  >
                    <span className="grid size-8 place-items-center rounded-lg bg-muted">
                      <MailPlus className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {item.email}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.claimedAt
                          ? "Prihvaćen"
                          : item.revokedAt
                            ? "Opozvan"
                            : expired
                              ? "Istekao"
                              : "Aktivan"}
                      </span>
                    </span>
                    {!inactive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => revokeInvite({ inviteId: item._id }),
                            "Poziv je opozvan.",
                          )
                        }
                      >
                        Opozovi
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
