"use client";

import { Fragment, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Check,
  CheckSquare2,
  FileText,
  FolderInput,
  LayoutGrid,
  Lightbulb,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Table as TableIcon,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";

import { IdeasCanvasView } from "@/components/workspace/ideas-canvas-view";
import { IdeaInlineThread } from "@/components/workspace/idea-discussion-dialog";
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
import {
  ITEM_SIZE_DIMENSIONS,
  ItemSizePicker,
  workspaceItemDialogContentClass,
  type ItemSizePreset,
} from "@/components/workspace/workspace-item-dialog";
import { useWorkspaceHistory } from "@/components/workspace/workspace-history";
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
  color: IdeaColor;
  isApproved: boolean;
  parentIdeaId?: Id<"ideaNodes">;
  x: number;
  y: number;
  width?: number;
  height?: number;
  upvotes?: number;
  downvotes?: number;
  contributionCount?: number;
  author?: {
    displayName: string;
    avatarUrl: string | null;
  } | null;
  canEdit: boolean;
  canDeleteDirectly: boolean;
};

type IdeaColor = "neutral" | "violet" | "blue" | "green" | "amber" | "rose";

export function IdeasView({ startup, onOpenPage }: IdeasViewProps) {
  const [viewMode, setViewMode] = useState<"table" | "canvas">("canvas");
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<IdeaNodeItem | null>(null);
  const [editorPending, setEditorPending] = useState(false);
  const [convertIdea, setConvertIdea] = useState<IdeaNodeItem | null>(null);
  const [nestingIdea, setNestingIdea] = useState<IdeaNodeItem | null>(null);
  const [nestParentId, setNestParentId] =
    useState<Id<"ideaNodes"> | "">("");
  const [expandedIdeaIds, setExpandedIdeaIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  // Form states for new idea
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [newColor, setNewColor] = useState<IdeaColor>("violet");
  const [selectedParentId, setSelectedParentId] = useState<Id<"ideaNodes"> | undefined>(undefined);
  const [newPosition, setNewPosition] = useState<{ x: number; y: number } | undefined>(undefined);

  // Form states for conversion
  const [targetAreaId, setTargetAreaId] = useState<Id<"startupAreas"> | "">(
    startup.areas[0]?._id || ""
  );
  const [targetKind, setTargetKind] = useState<"task" | "note">("task");

  const ideasData = useQuery(api.ideas.list, { startupId: startup._id });
  const createIdeaMutation = useMutation(api.ideas.create);
  const updateIdeaMutation = useMutation(api.ideas.update);
  const updateIdeaLayoutMutation = useMutation(api.ideas.updateLayout);
  const resetIdeaLayoutSizeMutation = useMutation(api.ideas.resetLayoutSize);
  const archiveIdeaMutation = useMutation(api.ideas.archive);
  const restoreIdeaMutation = useMutation(api.ideas.restoreOwn);
  const voteMutation = useMutation(api.ideas.vote);
  const convertMutation = useMutation(api.ideas.convertToPage);
  const requestNestingMutation = useMutation(api.collaboration.requestNesting);
  const { pushHistory } = useWorkspaceHistory();

  const closeIdeaEditor = () => {
    setCreateDialogOpen(false);
    setEditingIdea(null);
    setSelectedParentId(undefined);
    setNewPosition(undefined);
    setNewTitle("");
    setNewText("");
    setNewColor("violet");
  };

  const openCreateEditor = (
    parentIdeaId?: Id<"ideaNodes">,
    position?: { x: number; y: number },
  ) => {
    setEditingIdea(null);
    setSelectedParentId(parentIdeaId);
    setNewPosition(position);
    setNewTitle("");
    setNewText("");
    setNewColor("violet");
    setCreateDialogOpen(true);
  };

  const openEditEditor = (idea: IdeaNodeItem) => {
    setEditingIdea(idea);
    setSelectedParentId(undefined);
    setNewPosition(undefined);
    setNewTitle(idea.title ?? "");
    setNewText(idea.text);
    setNewColor(idea.color);
    setCreateDialogOpen(true);
  };

  const ideaEditorDirty = editingIdea
    ? newTitle !== (editingIdea.title ?? "") ||
      newText !== editingIdea.text ||
      newColor !== editingIdea.color
    : newTitle.trim().length > 0 ||
      newText.trim().length > 0 ||
      newColor !== "violet";

  const requestCloseIdeaEditor = () => {
    if (editorPending) return false;
    if (
      ideaEditorDirty &&
      !window.confirm("Odbaciti nesačuvane izmene ideje?")
    ) {
      return false;
    }
    closeIdeaEditor();
    return true;
  };

  const toggleExpandedRow = (ideaId: Id<"ideaNodes">) => {
    setExpandedIdeaIds((current) => {
      const next = new Set(current);
      if (next.has(ideaId)) next.delete(ideaId);
      else next.add(ideaId);
      return next;
    });
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

  const handleSaveIdea = async () => {
    if (!newTitle.trim()) {
      toast.error("Unesite naslov ideje.");
      return;
    }
    if (!newText.trim()) {
      toast.error("Unesite tekst ideje.");
      return;
    }
    setEditorPending(true);
    try {
      if (editingIdea) {
        const next = {
          title: newTitle.trim(),
          text: newText.trim(),
          color: newColor,
        };
        await updateIdeaMutation({
          startupId: startup._id,
          ideaId: editingIdea._id,
          ...next,
        });
        pushHistory({
          label: "uređivanje ideje",
          undo: () => updateIdeaMutation({
            startupId: startup._id,
            ideaId: editingIdea._id,
            title: editingIdea.title ?? "Bez naslova",
            text: editingIdea.text,
            color: editingIdea.color,
          }),
          redo: () => updateIdeaMutation({
            startupId: startup._id,
            ideaId: editingIdea._id,
            ...next,
          }),
        });
        toast.success("Ideja je sačuvana.");
      } else {
        const ideaId = await createIdeaMutation({
          startupId: startup._id,
          title: newTitle.trim(),
          text: newText.trim(),
          color: newColor,
          parentIdeaId: selectedParentId,
          x: newPosition ? Math.round(newPosition.x) : undefined,
          y: newPosition ? Math.round(newPosition.y) : undefined,
        });
        pushHistory({
          label: selectedParentId ? "dodavanje grane ideje" : "dodavanje ideje",
          undo: () => archiveIdeaMutation({ startupId: startup._id, ideaId }),
          redo: () => restoreIdeaMutation({ startupId: startup._id, ideaId }),
        });
        toast.success(
          selectedParentId
            ? "Nova grana ideje je dodata."
            : "Ideja je dodata na kanvas.",
        );
      }
      closeIdeaEditor();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : editingIdea
            ? "Ideja nije sačuvana."
            : "Greška pri kreiranju ideje.",
      );
    } finally {
      setEditorPending(false);
    }
  };

  const resizeEditingIdea = (preset: ItemSizePreset) => {
    if (!editingIdea?.canEdit) return;
    const dimensions = ITEM_SIZE_DIMENSIONS[preset];
    void updateIdeaLayoutMutation({
      startupId: startup._id,
      ideaId: editingIdea._id,
      x: editingIdea.x,
      y: editingIdea.y,
      ...dimensions,
    })
      .then(() => {
        const before = {
          x: editingIdea.x,
          y: editingIdea.y,
          width: editingIdea.width,
          height: editingIdea.height,
        };
        pushHistory({
          label: "promena veličine ideje",
          undo: () =>
            before.width === undefined || before.height === undefined
              ? resetIdeaLayoutSizeMutation({
                  startupId: startup._id,
                  ideaId: editingIdea._id,
                })
              : updateIdeaLayoutMutation({
                  startupId: startup._id,
                  ideaId: editingIdea._id,
                  x: before.x,
                  y: before.y,
                  width: before.width,
                  height: before.height,
                }),
          redo: () => updateIdeaLayoutMutation({
            startupId: startup._id,
            ideaId: editingIdea._id,
            x: editingIdea.x,
            y: editingIdea.y,
            ...dimensions,
          }),
        });
        toast.success("Veličina oblačića je sačuvana.");
      })
      .catch((error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Veličina oblačića nije sačuvana.",
        ),
      );
  };

  const resetEditingIdeaSize = () => {
    if (
      !editingIdea?.canEdit ||
      (editingIdea.width === undefined && editingIdea.height === undefined)
    ) {
      return;
    }
    void resetIdeaLayoutSizeMutation({
      startupId: startup._id,
      ideaId: editingIdea._id,
    })
      .then(() => {
        pushHistory({
          label: "vraćanje početne veličine ideje",
          undo: () => updateIdeaLayoutMutation({
            startupId: startup._id,
            ideaId: editingIdea._id,
            x: editingIdea.x,
            y: editingIdea.y,
            width: editingIdea.width ?? ITEM_SIZE_DIMENSIONS.compact.width,
            height: editingIdea.height ?? ITEM_SIZE_DIMENSIONS.compact.height,
          }),
          redo: () => resetIdeaLayoutSizeMutation({
            startupId: startup._id,
            ideaId: editingIdea._id,
          }),
        });
        toast.success("Vraćena je početna veličina ideje.");
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Početna veličina nije vraćena.",
        ),
      );
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

          {viewMode === "table" ? (
            <Button
              onClick={() => openCreateEditor()}
              size="sm"
              className="h-9 gap-1.5 rounded-xl text-xs font-medium"
            >
              <Plus className="size-4" />
              <span>Nova ideja</span>
            </Button>
          ) : null}
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
            onEditIdea={openEditEditor}
            onNestIdea={(idea) => {
              setNestingIdea(idea);
              setNestParentId("");
            }}
            onCreateIdea={openCreateEditor}
          />
        ) : (
          /* Table View */
          <div className="h-full overflow-y-auto p-6">
            <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card shadow-sm">
              <table className="min-w-[64rem] w-full text-left text-sm">
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
                    filteredNodes.map((node) => {
                      const expanded = expandedIdeaIds.has(node._id);
                      return (
                        <Fragment key={node._id}>
                          <tr className={cn(
                            "transition-colors hover:bg-muted/20",
                            expanded && "bg-muted/15",
                          )}>
                            <td className="max-w-xs px-6 py-4">
                              <button
                                type="button"
                                className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-expanded={expanded}
                                onClick={() => {
                                  if (expanded) toggleExpandedRow(node._id);
                                  openEditEditor(node);
                                }}
                              >
                                {node.title ? (
                                  <h4 className="line-clamp-1 font-semibold text-foreground">
                                    {node.title}
                                  </h4>
                                ) : null}
                                <p className="line-clamp-2 text-xs text-muted-foreground">
                                  {node.text}
                                </p>
                              </button>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
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
                            <td className="whitespace-nowrap px-6 py-4 text-xs text-muted-foreground">
                              {new Date(node.createdAt).toLocaleDateString("sr-RS", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleVote(node._id, "up")}
                                  className={cn(
                                    "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
                                    node.userVote === "up"
                                      ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
                                      : "border-border/60 text-muted-foreground hover:bg-muted",
                                  )}
                                  aria-label={`Glasaj za ideju. Trenutno ${node.upvotes}`}
                                >
                                  <ThumbsUp className="size-3.5" />
                                  <span>{node.upvotes}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleVote(node._id, "down")}
                                  className={cn(
                                    "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
                                    node.userVote === "down"
                                      ? "border-rose-500/50 bg-rose-500/20 text-rose-400"
                                      : "border-border/60 text-muted-foreground hover:bg-muted",
                                  )}
                                  aria-label={`Glasaj protiv ideje. Trenutno ${node.downvotes}`}
                                >
                                  <ThumbsDown className="size-3.5" />
                                  <span>{node.downvotes}</span>
                                </button>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              {node.isApproved ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                                  <Check className="size-3" /> Odobreno
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                                  U razmatranju
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1.5 rounded-xl text-xs"
                                aria-expanded={expanded}
                                onClick={() => {
                                  if (expanded) toggleExpandedRow(node._id);
                                  openEditEditor(node);
                                }}
                              >
                                Otvori
                                <ArrowRight className="size-3.5" />
                              </Button>
                            </td>
                          </tr>
                          {expanded ? (
                            <tr>
                              <td colSpan={6} className="bg-muted/10 px-6 pb-5 pt-0">
                                <div className="rounded-2xl border border-border/70 bg-background/75 p-5 shadow-sm">
                                  <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="min-w-0 max-w-3xl">
                                      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                                        Cela ideja
                                      </p>
                                      {node.title ? (
                                        <h4 className="mt-2 text-base font-bold tracking-[-0.02em]">
                                          {node.title}
                                        </h4>
                                      ) : null}
                                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                                        {node.text}
                                      </p>
                                      <IdeaInlineThread
                                        ideaId={node._id}
                                        canAdd={!node.canEdit}
                                        className="mt-4 border-t border-border/60 pt-4"
                                      />
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                      {node.canEdit ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="rounded-xl"
                                          onClick={() => openEditEditor(node)}
                                        >
                                          <Pencil className="size-3.5" /> Uredi moje
                                        </Button>
                                      ) : null}
                                      {node.isApproved && !node.convertedPageId ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
                                          onClick={() => setConvertIdea(node)}
                                        >
                                          Pretvori <ArrowRight className="size-3.5" />
                                        </Button>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Zajednički editor za novu i postojeću ideju */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (open) setCreateDialogOpen(true);
          else requestCloseIdeaEditor();
        }}
      >
        <DialogContent
          className={`${workspaceItemDialogContentClass} sm:h-auto sm:max-w-xl`}
        >
          <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="border-b border-border/70 px-5 py-5 pr-12 sm:px-6">
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="size-5 text-amber-500" />
              <span>
                {editingIdea
                  ? editingIdea.canEdit
                    ? "Uredi ideju"
                    : "Detalji ideje"
                  : selectedParentId
                    ? "Dodaj granu ideje"
                    : "Nova ideja"}
              </span>
            </DialogTitle>
            <DialogDescription>
              {editingIdea
                ? editingIdea.canEdit
                  ? "Izmene se odmah vide i u tabeli i na kanvasu."
                   : "Pročitaj celu ideju ili dodaj svoju izmenu ispod osnovnog teksta."
                : "Ideja je vidljiva timu. Članovi mogu da glasaju i povežu je sa drugim predlozima."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
            {editingIdea ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/25 p-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {editingIdea.author?.displayName ?? "Član tima"}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {editingIdea.isApproved ? "Odobrena ideja" : "U razmatranju"}
                </span>
                <span className="ml-auto">
                  {editingIdea.upvotes ?? 0} za · {editingIdea.downvotes ?? 0} protiv
                </span>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Naslov</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Na primer: Nedeljni pregled napretka"
                className="rounded-xl"
                maxLength={200}
                autoFocus
                disabled={Boolean(editingIdea && !editingIdea.canEdit)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Opiši ideju</label>
              <Textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Šta predlažeš i zašto bi to bilo korisno?"
                className="rounded-xl min-h-[100px]"
                maxLength={12_000}
                disabled={Boolean(editingIdea && !editingIdea.canEdit)}
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
                    disabled={Boolean(editingIdea && !editingIdea.canEdit)}
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
            {editingIdea?.canEdit ? (
              <ItemSizePicker
                value={
                  editingIdea.width && editingIdea.width >= 480
                    ? "large"
                    : editingIdea.width && editingIdea.width >= 330
                      ? "standard"
                      : "compact"
                }
                onChange={resizeEditingIdea}
                onReset={resetEditingIdeaSize}
              />
            ) : null}
            {editingIdea ? (
              <IdeaInlineThread
                ideaId={editingIdea._id}
                canAdd={!editingIdea.canEdit}
                className="border-t border-border/60 pt-4"
              />
            ) : null}
          </div>

          <DialogFooter className="border-t border-border/70 bg-muted/25 px-5 py-4 sm:px-6">
            <Button
              variant="ghost"
              onClick={requestCloseIdeaEditor}
              className="rounded-xl"
              disabled={editorPending}
            >
              {editingIdea && !editingIdea.canEdit ? "Zatvori" : "Otkaži"}
            </Button>
            {!editingIdea || editingIdea.canEdit ? (
              <Button
              onClick={handleSaveIdea}
              className="rounded-xl font-medium"
              disabled={
                editorPending ||
                newTitle.trim().length === 0 ||
                newText.trim().length === 0
              }
            >
              {editorPending
                ? "Čuvam…"
                : editingIdea
                  ? "Sačuvaj izmene"
                  : selectedParentId
                    ? "Dodaj granu"
                    : "Dodaj ideju"}
              </Button>
            ) : null}
          </DialogFooter>
          </div>
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

      <Dialog
        open={nestingIdea !== null}
        onOpenChange={(open) => !open && setNestingIdea(null)}
      >
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ubaci karticu u…</DialogTitle>
            <DialogDescription>
              Ugnježdenje se odmah prikazuje celom timu. Kod tuđeg Parenta
              vlasnik zatim može da ga odobri ili odbije.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={nestParentId}
            onValueChange={(value) =>
              setNestParentId(value as Id<"ideaNodes">)
            }
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Izaberi Parent karticu" />
            </SelectTrigger>
            <SelectContent>
              {nodes
                .filter((node) => node._id !== nestingIdea?._id)
                .map((node) => (
                  <SelectItem key={node._id} value={node._id}>
                    {node.title ?? node.text.slice(0, 55)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              variant="ghost"
              className="rounded-xl"
              onClick={() => setNestingIdea(null)}
            >
              Otkaži
            </Button>
            <Button
              className="rounded-xl"
              disabled={!nestingIdea || !nestParentId}
              onClick={() => {
                if (!nestingIdea || !nestParentId) return;
                void requestNestingMutation({
                  startupId: startup._id,
                  childIdeaId: nestingIdea._id,
                  parentIdeaId: nestParentId as Id<"ideaNodes">,
                })
                  .then((result) => {
                    toast.success(
                      result.status === "approved"
                        ? "Kartica je ugnježđena."
                        : "Predlog ugnježdenja je odmah vidljiv timu.",
                    );
                    setNestingIdea(null);
                  })
                  .catch((error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Ugnježđavanje nije sačuvano.",
                    ),
                  );
              }}
            >
              <FolderInput /> Ubaci
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
