// Shared types for Instagram Studio saved templates.
//
// Kept out of the "use server" actions module (which may export only async
// functions) AND out of the 6k-line client file, so both can import the row +
// payload shapes. Types are erased at build time, so importing this from the
// client component is free.
//
// `overlays` stays `unknown[]` here on purpose: the concrete `Overlay` union is
// owned by estudio-client.tsx. The server only passes the payload through to
// JSONB — it never inspects overlay internals — so the client casts on read.

export type SavedTemplatePayload = {
  values: Record<string, string>;
  overlays: unknown[];
  accent: string;
  accentIsCustom: boolean;
  accentCustom: string;
  bg: string;
  bgCustom: string;
  layout: string;
  footerShow: boolean;
  footerText: string;
  textScale: string;
  ratioId: string;
  glowOn: boolean;
  gridOn: boolean;
};

export type SavedTemplate = {
  id: string;
  name: string;
  base_template_id: string;
  payload: SavedTemplatePayload;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const SAVED_TEMPLATE_NAME_MAX = 80;
