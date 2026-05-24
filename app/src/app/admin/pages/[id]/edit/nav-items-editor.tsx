"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, Check, GripVertical, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateNavItems } from "@/actions/admin";
import { PagePicker } from "@/components/admin/page-picker";
import type { NavItemRow, SpecialtyOption } from "./page";

type NavItemDraft = {
  // A stable key for React (also used as @dnd-kit sortable id). For new rows
  // we generate a synthetic string like "new-1"; for existing rows we use
  // the numeric DB id stringified.
  key: string;
  id: number | null;
  label: string;
  target_page_id: number | null;
  target_title: string | null;
  target_slug: string | null;
  target_type: string | null;
  group_label: string;
  icon: string;
  layout: "cards" | "list";
};

interface Props {
  pageId: number;
  initial: NavItemRow[];
  specialties: SpecialtyOption[];
}

let draftCounter = 0;
function nextDraftKey(): string {
  draftCounter += 1;
  return `new-${draftCounter}-${Date.now()}`;
}

export function NavItemsEditor({ pageId, initial, specialties }: Props) {
  const { t } = useTranslation();

  const [drafts, setDrafts] = useState<NavItemDraft[]>(() =>
    initial.map((n) => ({
      key: String(n.id),
      id: n.id,
      label: n.label ?? "",
      target_page_id: n.target_page_id,
      target_title: n.target_title,
      target_slug: n.target_slug,
      target_type: n.target_type,
      group_label: n.group_label ?? "",
      icon: n.icon ?? "",
      layout: (n.layout as "cards" | "list") ?? "cards",
    })),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDrafts((prev) => {
      const oldIndex = prev.findIndex((d) => d.key === active.id);
      const newIndex = prev.findIndex((d) => d.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function addItem() {
    setDrafts((prev) => [
      ...prev,
      {
        key: nextDraftKey(),
        id: null,
        label: "",
        target_page_id: null,
        target_title: null,
        target_slug: null,
        target_type: null,
        group_label: "",
        icon: "",
        layout: "cards",
      },
    ]);
  }

  function removeItem(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  function patchItem(key: string, patch: Partial<NavItemDraft>) {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
  }

  async function handleSave() {
    setError(null);
    setSaved(false);

    // Validate: every item must have a target_page_id
    const missingTarget = drafts.findIndex((d) => d.target_page_id === null);
    if (missingTarget !== -1) {
      setError(
        t("navItems.errorMissingTarget", { position: missingTarget + 1 }),
      );
      return;
    }

    setSaving(true);
    try {
      const payload = drafts.map((d, i) => ({
        id: d.id,
        label: d.label,
        target_page_id: d.target_page_id as number, // validated above
        group_label: d.group_label || null,
        icon: d.icon || null,
        layout: d.layout,
        position: i + 1,
      }));
      const res = await updateNavItems(pageId, payload);
      if ("error" in res) {
        setError(res.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-surface-1">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("navItems.sectionTitle")}
        </h2>
        <span className="text-xs text-muted-foreground">{drafts.length}</span>
      </div>

      {drafts.length === 0 && (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          {t("navItems.empty")}
        </div>
      )}

      {drafts.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={drafts.map((d) => d.key)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="divide-y divide-border">
              {drafts.map((draft, idx) => (
                <SortableRow
                  key={draft.key}
                  draft={draft}
                  position={idx + 1}
                  specialties={specialties}
                  onPatch={(p) => patchItem(draft.key, p)}
                  onRemove={() => removeItem(draft.key)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* Add card */}
      <div className="px-5 py-4">
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("navItems.addCard")}
        </button>
      </div>

      {/* Save footer */}
      <div className="flex items-center gap-3 px-5 py-4">
        {error && (
          <span className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
        )}
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            {t("navItems.saved")}
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {saving ? t("common.loading") : t("navItems.save")}
        </button>
      </div>
    </div>
  );
}

// ── Sortable row ──────────────────────────────────────────────────────────────

interface SortableRowProps {
  draft: NavItemDraft;
  position: number;
  specialties: SpecialtyOption[];
  onPatch: (patch: Partial<NavItemDraft>) => void;
  onRemove: () => void;
}

function SortableRow({
  draft,
  position,
  specialties,
  onPatch,
  onRemove,
}: SortableRowProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: draft.key });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const targetPreview =
    draft.target_page_id !== null && draft.target_title !== null
      ? {
          id: draft.target_page_id,
          title: draft.target_title,
          slug: draft.target_slug ?? "",
          type: draft.target_type ?? "",
        }
      : null;

  return (
    <li ref={setNodeRef} style={style} className="bg-surface-1 px-3 py-3 sm:px-5 sm:py-4">
      <div className="flex items-start gap-2">
        {/* Drag handle — explicit larger touch target for mobile */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("navItems.dragHandle")}
          className="touch-none flex h-9 w-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <span className="w-5 shrink-0 pt-2 text-right text-xs tabular-nums text-muted-foreground">
          {position}
        </span>

        <div className="min-w-0 flex-1 space-y-2">
          {/* Label input */}
          <div className="space-y-1">
            <label
              htmlFor={`ni-label-${draft.key}`}
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {t("navItems.labelField")}
            </label>
            <input
              id={`ni-label-${draft.key}`}
              type="text"
              value={draft.label}
              onChange={(e) => onPatch({ label: e.target.value })}
              placeholder={t("navItems.labelPlaceholder")}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
            />
          </div>

          {/* Target page picker */}
          <div className="space-y-1">
            <label
              id={`ni-target-${draft.key}`}
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {t("navItems.targetPage")}
            </label>
            <PagePicker
              value={draft.target_page_id}
              preview={targetPreview}
              specialties={specialties}
              onChange={(newId) => {
                // PagePicker also resolves preview via getPageSummary; we just
                // track the id here and rely on the picker's internal cache.
                onPatch({
                  target_page_id: newId,
                  // If cleared, also clear preview fields:
                  target_title: newId === null ? null : draft.target_title,
                  target_slug: newId === null ? null : draft.target_slug,
                  target_type: newId === null ? null : draft.target_type,
                });
              }}
            />
          </div>
        </div>

        {/* Remove button */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("navItems.remove")}
          className={cn(
            "shrink-0 rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10",
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
