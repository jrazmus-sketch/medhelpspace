"use client";

import { useState } from "react";
import { updateFlashcards } from "@/actions/admin";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { Check, AlertCircle, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlashcardRow } from "./page";

type CardDraft = {
  id: number | null;
  group_position: number;
  group_label: string;
  position: number;
  text: string;
  answer: string;
  image_url: string;
  tip: string;
  open: boolean;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

export function FlashcardEditor({ pageId, initial }: { pageId: number; initial: FlashcardRow[] }) {
  const [drafts, setDrafts] = useState<CardDraft[]>(() =>
    initial.map((c) => ({
      id: c.id,
      group_position: c.group_position,
      group_label: c.group_label ?? "",
      position: c.position,
      text: c.text,
      answer: c.answer,
      image_url: c.image_url ?? "",
      tip: c.tip ?? "",
      open: false,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addCard() {
    const maxGroup = drafts.reduce((m, c) => Math.max(m, c.group_position), 0);
    const groupPos = maxGroup === 0 ? 1 : maxGroup;
    const inSameGroup = drafts.filter((c) => c.group_position === groupPos);
    const maxPos = inSameGroup.reduce((m, c) => Math.max(m, c.position), 0);
    setDrafts((p) => [
      ...p,
      {
        id: null,
        group_position: groupPos,
        group_label: inSameGroup[0]?.group_label ?? "",
        position: maxPos + 1,
        text: "",
        answer: "",
        image_url: "",
        tip: "",
        open: true,
      },
    ]);
  }

  function addGroup() {
    const maxGroup = drafts.reduce((m, c) => Math.max(m, c.group_position), 0);
    setDrafts((p) => [
      ...p,
      {
        id: null,
        group_position: maxGroup + 1,
        group_label: "",
        position: 1,
        text: "",
        answer: "",
        image_url: "",
        tip: "",
        open: true,
      },
    ]);
  }

  function removeCard(idx: number) {
    setDrafts((p) => p.filter((_, i) => i !== idx));
  }

  function moveCard(idx: number, dir: "up" | "down") {
    setDrafts((prev) => {
      const next = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function patch(idx: number, patch: Partial<CardDraft>) {
    setDrafts((p) => p.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function patchGroupLabel(groupPos: number, label: string) {
    setDrafts((p) =>
      p.map((c) => (c.group_position === groupPos ? { ...c, group_label: label } : c)),
    );
  }

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      // Renumber positions within each group based on their order in the list
      const byGroup = new Map<number, CardDraft[]>();
      for (const c of drafts) {
        const list = byGroup.get(c.group_position) ?? [];
        list.push(c);
        byGroup.set(c.group_position, list);
      }
      const normalized: CardDraft[] = [];
      for (const list of byGroup.values()) {
        list.forEach((c, i) => normalized.push({ ...c, position: i + 1 }));
      }

      await updateFlashcards(
        pageId,
        normalized.map((c) => ({
          id: c.id,
          group_position: c.group_position,
          group_label: c.group_label || null,
          position: c.position,
          text: c.text,
          answer: c.answer,
          image_url: c.image_url || null,
          tip: c.tip || null,
        })),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // Group cards for display
  const groupedDrafts = new Map<number, { label: string; cards: { card: CardDraft; idx: number }[] }>();
  drafts.forEach((card, idx) => {
    if (!groupedDrafts.has(card.group_position)) {
      groupedDrafts.set(card.group_position, { label: card.group_label, cards: [] });
    }
    groupedDrafts.get(card.group_position)!.cards.push({ card, idx });
  });
  const groupedList = Array.from(groupedDrafts.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Flashcards
        </h2>
        <span className="text-xs text-muted-foreground">
          {drafts.length} card{drafts.length !== 1 ? "s" : ""} · {groupedList.length} grupo{groupedList.length !== 1 ? "s" : ""}
        </span>
      </div>

      {drafts.length === 0 && (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          Nenhum flashcard cadastrado.
        </div>
      )}

      {groupedList.map(([groupPos, { label, cards }]) => (
        <div key={groupPos} className="border-b border-border">
          <div className="px-5 py-3 bg-surface-2/40 flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Grupo {groupPos}
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => patchGroupLabel(groupPos, e.target.value)}
              placeholder="Título do grupo (opcional)"
              className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-brand/60"
            />
          </div>

          {cards.map(({ card, idx }) => (
            <div key={idx} className="space-y-3 px-5 py-4 border-t border-border">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {card.position}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {card.text ? stripHtml(card.text).slice(0, 60) : <span className="text-muted-foreground italic">Sem pergunta</span>}
                </span>
                <button onClick={() => patch(idx, { open: !card.open })} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title={card.open ? "Recolher" : "Expandir"}>
                  {card.open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => moveCard(idx, "up")} disabled={idx === 0} className={cn("rounded p-1.5 transition-colors", idx === 0 ? "pointer-events-none opacity-25" : "text-muted-foreground hover:bg-accent hover:text-foreground")} title="Mover para cima">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => moveCard(idx, "down")} disabled={idx === drafts.length - 1} className={cn("rounded p-1.5 transition-colors", idx === drafts.length - 1 ? "pointer-events-none opacity-25" : "text-muted-foreground hover:bg-accent hover:text-foreground")} title="Mover para baixo">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => removeCard(idx)} className="rounded p-1.5 text-destructive hover:bg-destructive/10" title="Excluir">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {card.open && (
                <div className="space-y-3 pl-7">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Frente (pergunta)</label>
                    <RichTextEditor
                      content={card.text}
                      onChange={(html) => patch(idx, { text: html })}
                      placeholder="Pergunta ou prompt"
                      minHeight="80px"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Verso (resposta)</label>
                    <RichTextEditor
                      content={card.answer}
                      onChange={(html) => patch(idx, { answer: html })}
                      placeholder="Resposta"
                      minHeight="80px"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">URL da imagem (opcional)</label>
                      <input
                        type="text"
                        value={card.image_url}
                        onChange={(e) => patch(idx, { image_url: e.target.value })}
                        placeholder="https://…"
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-xs outline-none focus:border-brand/60"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Dica (opcional)</label>
                      <input
                        type="text"
                        value={card.tip}
                        onChange={(e) => patch(idx, { tip: e.target.value })}
                        placeholder="Texto da dica"
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-brand/60"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <div className="px-5 py-4 flex gap-2">
        <button onClick={addCard} className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-brand/50 hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
          Adicionar card
        </button>
        <button onClick={addGroup} className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-brand/50 hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
          Novo grupo
        </button>
      </div>

      <div className="flex items-center gap-3 px-5 py-4 border-t border-border">
        {error && (
          <span className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
        )}
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            Salvo
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-brand-fg disabled:opacity-60 hover:opacity-90"
        >
          {saving ? "Salvando…" : "Salvar flashcards"}
        </button>
      </div>
    </div>
  );
}
