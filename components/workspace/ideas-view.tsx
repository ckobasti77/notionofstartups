"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Check,
  CheckSquare2,
  FileText,
  LayoutGrid,
  Lightbulb,
  Plus,
  Search,
  Sparkles,
  Table as TableIcon,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";

import { IdeasCanvasView } from "@/components/workspace/ideas-canvas-view";
import type { StartupWithAreas } from "@/components/workspace/types";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type IdeasViewProps = {
  startup: StartupWithAreas;
  onOpenPage: (pageId: Id<"pages">) => void;
};

type IdeaNodeItem = {
  _id: Id<"ideaNodes">;
  title: string | null;
  text: string;
  isApproved: boolean;
};

export function IdeasView({ startup, onOpenPage }: IdeasViewProps) {
  const [viewMode, setViewMode] = useState<"table" | "canvas">("canvas");
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [convertIdea, setConvertIdea] = useState<IdeaNodeItem | null>(null);

  // Form states for new idea
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [newColor, setNewColor] = useState<"neutral" | "violet" | "blue" | "green" | "amber" | "rose">("violet");
  const [selectedParentId, setSelectedParentId] = useState<Id<"ideaNodes"> | undefined>(undefined);
  const [newPosition, setNewPosition] = useState<{ x: number; y: number } | undefined>(undefined);

  // Form states for conversion
  const [targetAreaId, setTargetAreaId] = useState<Id<"startupAreas"> | "">(
    startup.areas[0]?._id || ""
  );
  const [targetKind, setTargetKind] = useState<"task" | "note">("task");

  const ideasData = useQuery(api.ideas.list, { startupId: startup._id });
  const createIdeaMutation = useMutation(api.ideas.create);
  const voteMutation = useMutation(api.ideas.vote);
  const convertMutation = useMutation(api.ideas.convertToPage);

  const closeCreateDialog = () => {
    setCreateDialogOpen(false);
    setSelectedParentId(undefined);
    setNewPosition(undefined);
  };

  if (!ideasData) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto h-12 w-12 rounded-full" />
          <Skeleton className="h-6 w-48 mx-auto" />
        </div>
      </div>
    );
  }

  const { nodes, edges, canvasState } = ideasData;

  const filteredNodes = nodes.filter(
    (n) =>
      (n.title && n.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      n.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateIdea = async () => {
    if (!newText.trim()) {
      toast.error("Unesite tekst ideje.");
      return;
    }
    try {
      await createIdeaMutation({
        startupId: startup._id,
        title: newTitle.trim() || undefined,
        text: newText.trim(),
        color: newColor,
        parentIdeaId: selectedParentId,
        x: newPosition ? Math.round(newPosition.x) : undefined,
        y: newPosition ? Math.round(newPosition.y) : undefined,
      });
      toast.success(selectedParentId ? "Nova grana ideje je dodata." : "Ideja je dodata na kanvas.");
      setCreateDialogOpen(false);
      setNewTitle("");
      setNewText("");
      setSelectedParentId(undefined);
      setNewPosition(undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Greška pri kreiranju ideje.");
    }
  };

  const handleConvert = async () => {
    if (!convertIdea || !targetAreaId) return;
    try {
      const pageId = await convertMutation({
        startupId: startup._id,
        ideaId: convertIdea._id,
        areaId: targetAreaId as Id<"startupAreas">,
        kind: targetKind,
      });
      toast.success(
        targetKind === "task"
          ? "Ideja je prebačena u Task!"
          : "Ideja je prebačena u Note!"
      );
      setConvertIdea(null);
      onOpenPage(pageId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Greška pri prebacivanju ideje.");
    }
  };

  const handleVote = async (ideaId: Id<"ideaNodes">, voteType: "up" | "down") => {
    try {
      await voteMutation({ startupId: startup._id, ideaId, voteType });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Greška pri glasanju.");
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
            <Lightbulb className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Ideje startupa</h2>
            <p className="text-xs text-muted-foreground">
              Povežite predloge, glasajte i pretvorite odobrene ideje u konkretan rad.
            </p>
          </div>
        </div>

        {/* View Mode Toggle & Search */}
        <div className="flex items-center gap-3">
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pretraži ideje..."
              className="pl-9 h-9 text-xs rounded-xl bg-muted/40"
            />
          </div>

          <div className="flex items-center rounded-xl border border-border/60 bg-muted/30 p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("canvas")}
              className={cn(
                "h-7 rounded-lg text-xs gap-1.5 px-3",
                viewMode === "canvas" && "bg-background text-foreground shadow-sm"
              )}
            >
              <LayoutGrid className="size-3.5" />
              <span>Kanvas</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("table")}
              className={cn(
                "h-7 rounded-lg text-xs gap-1.5 px-3",
                viewMode === "table" && "bg-background text-foreground shadow-sm"
              )}
            >
              <TableIcon className="size-3.5" />
              <span>Tabela</span>
            </Button>
          </div>

          <Button
            onClick={() => {
              setSelectedParentId(undefined);
              setNewPosition(undefined);
              setCreateDialogOpen(true);
            }}
            size="sm"
            className="rounded-xl h-9 text-xs gap-1.5 font-medium"
          >
            <Plus className="size-4" />
            <span>Nova ideja</span>
          </Button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-hidden relative">
        {viewMode === "canvas" ? (
          <IdeasCanvasView
            startupId={startup._id}
            nodes={filteredNodes}
            edges={edges}
            canvasState={canvasState}
            searchActive={searchQuery.trim().length > 0}
            onConvertIdea={(idea) => setConvertIdea(idea)}
            onCreateIdea={(parentId, position) => {
              setSelectedParentId(parentId);
              setNewPosition(position);
              setCreateDialogOpen(true);
            }}
          />
        ) : (
          /* Table View */
          <div className="h-full overflow-y-auto p-6">
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Ideja</th>
                    <th className="px-6 py-3.5">Autor</th>
                    <th className="px-6 py-3.5">Datum</th>
                    <th className="px-6 py-3.5">Glasovi (Za / Protiv)</th>
                    <th className="px-6 py-3.5">Status Odobrenja</th>
                    <th className="px-6 py-3.5 text-right">Akcija</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredNodes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        Nema ideja za ovu pretragu.
                      </td>
                    </tr>
                  ) : (
                    filteredNodes.map((node) => (
                      <tr key={node._id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4 max-w-xs">
                          {node.title ? (
                            <h4 className="font-semibold text-foreground line-clamp-1">
                              {node.title}
                            </h4>
                          ) : null}
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {node.text}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <ProfileAvatar
                              profile={{
                                displayName: node.author?.displayName || "Autor",
                                avatarUrl: node.author?.avatarUrl || null,
                              }}
                              className="size-7"
                            />
                            <span className="text-xs font-medium">
                              {node.author?.displayName || "Član"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(node.createdAt).toLocaleDateString("sr-RS", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleVote(node._id, "up")}
                              className={cn(
                                "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors border",
                                node.userVote === "up"
                                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                                  : "border-border/60 hover:bg-muted text-muted-foreground"
                              )}
                            >
                              <ThumbsUp className="size-3.5" />
                              <span>{node.upvotes}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVote(node._id, "down")}
                              className={cn(
                                "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors border",
                                node.userVote === "down"
                                  ? "bg-rose-500/20 border-rose-500/50 text-rose-400"
                                  : "border-border/60 hover:bg-muted text-muted-foreground"
                              )}
                            >
                              <ThumbsDown className="size-3.5" />
                              <span>{node.downvotes}</span>
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {node.isApproved ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                              <Check className="size-3" /> Odobreno
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                              U razmatranju
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {node.isApproved ? (
                            <Button
                              size="sm"
                              onClick={() => setConvertIdea(node)}
                              className="rounded-xl h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-1"
                            >
                              <span>Pretvori u zadatak ili belešku</span>
                              <ArrowRight className="size-3.5" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              Čeka više odobrenja
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Dialog: Nova Ideja */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (open) setCreateDialogOpen(true);
          else closeCreateDialog();
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="size-5 text-amber-500" />
              <span>{selectedParentId ? "Dodaj granu ideje" : "Nova ideja"}</span>
            </DialogTitle>
            <DialogDescription>
              Ideja je vidljiva timu. Članovi mogu da glasaju i povežu je sa drugim predlozima.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Naslov (opciono)</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Na primer: Nedeljni pregled napretka"
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Opiši ideju</label>
              <Textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Šta predlažeš i zašto bi to bilo korisno?"
                className="rounded-xl min-h-[100px]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Boja kartice</label>
              <div className="flex items-center gap-2">
                {(["violet", "blue", "green", "amber", "rose", "neutral"] as const).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    className={cn(
                      "size-7 rounded-full border-2 transition-transform",
                      newColor === color ? "scale-110 ring-2 ring-primary" : "opacity-70 hover:opacity-100",
                      color === "violet" && "bg-violet-600 border-violet-400",
                      color === "blue" && "bg-sky-600 border-sky-400",
                      color === "green" && "bg-emerald-600 border-emerald-400",
                      color === "amber" && "bg-amber-600 border-amber-400",
                      color === "rose" && "bg-rose-600 border-rose-400",
                      color === "neutral" && "bg-slate-600 border-slate-400"
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeCreateDialog} className="rounded-xl">
              Otkaži
            </Button>
            <Button onClick={handleCreateIdea} className="rounded-xl font-medium">
              {selectedParentId ? "Dodaj granu" : "Dodaj ideju"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Pretvori Odobrenu Ideju u Task ili Note */}
      <Dialog open={!!convertIdea} onOpenChange={() => setConvertIdea(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-500">
              <Sparkles className="size-5" />
              <span>Pretvori Ideju u Radnu Stavku</span>
            </DialogTitle>
            <DialogDescription>
              Ideja je odobrena! Izaberite oblast i tip stavke (Task ili Note).
            </DialogDescription>
          </DialogHeader>

          {convertIdea ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <span className="text-xs font-bold text-emerald-400 block mb-1">
                  Odobrena Ideja:
                </span>
                <p className="text-sm font-semibold">{convertIdea.title || convertIdea.text}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Tip radne stavke</label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={targetKind === "task" ? "default" : "outline"}
                    onClick={() => setTargetKind("task")}
                    className="rounded-xl gap-2 justify-start"
                  >
                    <CheckSquare2 className="size-4 text-emerald-400" />
                    <span>Zadatak (Task)</span>
                  </Button>
                  <Button
                    type="button"
                    variant={targetKind === "note" ? "default" : "outline"}
                    onClick={() => setTargetKind("note")}
                    className="rounded-xl gap-2 justify-start"
                  >
                    <FileText className="size-4 text-sky-400" />
                    <span>Beleška (Note)</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Izaberite Oblast (Startup Area)</label>
                <Select
                  value={targetAreaId}
                  onValueChange={(val) => setTargetAreaId(val as Id<"startupAreas">)}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Izaberite oblast..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {startup.areas.map((area) => (
                      <SelectItem key={area._id} value={area._id}>
                        {area.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConvertIdea(null)} className="rounded-xl">
              Otkaži
            </Button>
            <Button
              onClick={handleConvert}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-1"
            >
              <span>Kreiraj {targetKind === "task" ? "Task" : "Note"}</span>
              <ArrowRight className="size-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
