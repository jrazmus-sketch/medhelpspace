/**
 * Zod schema per step kind + the field list the admin form renders from.
 *
 * A new block type = one entry in CONTENT_SCHEMAS and one in KIND_FIELDS.
 * Nothing in the DB changes (content is JSONB).
 */

import { z } from "zod";
import {
  CONFIDENCES,
  DIFFICULTIES,
  FORMATS,
  QUALITIES,
  REVEAL_CATEGORIES,
  SKILLS,
  STEP_KINDS,
  type StepKind,
} from "./types";

export const MediaSchema = z.object({
  type: z.string().min(1),
  url: z.string(),
  file: z.string().optional(),
  caption: z.string().optional(),
  alt: z.string().optional(),
  transcript: z.string().optional(),
});

const text = z.string().default("");
const mediaList = z.array(MediaSchema).optional();

export const CONTENT_SCHEMAS: Record<StepKind, z.ZodTypeAny> = {
  narrativa: z.object({ text, media: mediaList }),
  pistas: z.object({}).passthrough(),
  pergunta: z.object({ prompt: text, media: mediaList }),
  ordenar: z.object({ prompt: text, items: z.array(z.string()).default([]), media: mediaList }),
  cena_conduta: z.object({ text, media: mediaList }),
  novo_dado: z.object({ text, media: mediaList }),
  reavaliacao: z.object({ prompt: text, media: mediaList }),
  confianca: z.object({}).passthrough(),
  feedback: z.object({ text, media: mediaList }),
  seducao: z.object({ text }),
  custo_do_atraso: z.object({ text, window: z.string().optional(), media: mediaList }),
  midia: z.object({ media: z.array(MediaSchema).default([]) }),
  cronometro: z.object({ seconds: z.coerce.number().int().min(5).max(600).default(30) }),
  leve_deste_caso: z.object({ text }),
  prontuario: z.object({}).passthrough(),
  codigo_decifrado: z.object({}).passthrough(),
};

export const RevealSchema = z.object({
  cat: z.enum(REVEAL_CATEGORIES),
  texto: z.string(),
  midia: MediaSchema.optional(),
});

export const EffectSchema = z.object({
  revela: z.array(RevealSchema).optional(),
  estado: z.record(z.string(), z.string()).optional(),
  relogio: z.number().optional(),
});

export const OptionSchema = z.object({
  id: z.number().optional(),
  position: z.number().int(),
  label: z.string(),
  is_correct: z.boolean(),
  quality: z.enum(QUALITIES).nullable().optional(),
  feedback: z.string().nullable().optional(),
  seduction: z.string().nullable().optional(),
  effect: EffectSchema.default({}),
  next_scene_key: z.string().nullable().optional(),
});

export const StepSchema = z.object({
  id: z.number().optional(),
  position: z.number().int(),
  kind: z.enum(STEP_KINDS),
  enabled: z.boolean().default(true),
  scene_key: z.string().nullable().optional(),
  skill: z.enum(SKILLS).nullable().optional(),
  content: z.record(z.string(), z.unknown()).default({}),
  options: z.array(OptionSchema).default([]),
});

export const ClueSchema = z.object({
  id: z.number().optional(),
  position: z.number().int(),
  label: z.string(),
  detail: z.string().nullable().optional(),
  media: MediaSchema.nullable().optional(),
  category: z.string().nullable().optional(),
  is_red_herring: z.boolean().default(false),
  red_herring_reason: z.string().nullable().optional(),
  cluster: z.string().nullable().optional(),
});

export const CaseDocSchema = z.object({
  id: z.number().optional(),
  slug: z.string().min(1),
  format: z.enum(FORMATS),
  title: z.string().min(1),
  specialty_id: z.number().nullable().optional(),
  topic_id: z.number().nullable().optional(),
  specialty_text: z.string().nullable().optional(),
  topic_text: z.string().nullable().optional(),
  difficulty: z.enum(DIFFICULTIES).default("intermediaria"),
  primary_skill: z.enum(SKILLS),
  est_minutes: z.number().int().nullable().optional(),
  summary: z.string().nullable().optional(),
  takeaway: z.string().nullable().optional(),
  final_key: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_free: z.boolean().optional(),
  steps: z.array(StepSchema),
  clues: z.array(ClueSchema),
});

export const ConfidenceSchema = z.enum(CONFIDENCES);

/** Field descriptors the editor renders per kind. */
export type FieldDesc = {
  key: string;
  kind: "text" | "textarea" | "number" | "items" | "media";
  labelKey: string; // i18n key under clinact.fields
};

export const KIND_FIELDS: Record<StepKind, FieldDesc[]> = {
  narrativa: [
    { key: "text", kind: "textarea", labelKey: "text" },
    { key: "media", kind: "media", labelKey: "media" },
  ],
  pistas: [],
  pergunta: [
    { key: "prompt", kind: "textarea", labelKey: "prompt" },
    { key: "media", kind: "media", labelKey: "media" },
  ],
  ordenar: [
    { key: "prompt", kind: "textarea", labelKey: "prompt" },
    { key: "items", kind: "items", labelKey: "orderItems" },
  ],
  cena_conduta: [
    { key: "text", kind: "textarea", labelKey: "text" },
    { key: "media", kind: "media", labelKey: "media" },
  ],
  novo_dado: [
    { key: "text", kind: "textarea", labelKey: "text" },
    { key: "media", kind: "media", labelKey: "media" },
  ],
  reavaliacao: [
    { key: "prompt", kind: "textarea", labelKey: "prompt" },
    { key: "media", kind: "media", labelKey: "media" },
  ],
  confianca: [],
  feedback: [{ key: "text", kind: "textarea", labelKey: "text" }],
  seducao: [{ key: "text", kind: "textarea", labelKey: "text" }],
  custo_do_atraso: [
    { key: "text", kind: "textarea", labelKey: "text" },
    { key: "window", kind: "text", labelKey: "window" },
  ],
  midia: [{ key: "media", kind: "media", labelKey: "media" }],
  cronometro: [{ key: "seconds", kind: "number", labelKey: "seconds" }],
  leve_deste_caso: [{ key: "text", kind: "textarea", labelKey: "text" }],
  prontuario: [],
  codigo_decifrado: [],
};
