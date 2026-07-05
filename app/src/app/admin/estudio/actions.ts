"use server";

// Instagram Studio — saved-template CRUD. Shared team library: any content-
// capable admin (super/content, same set that can open the studio) reads and
// manages every row. Runs under the caller's session so RLS is the real gate;
// the role re-check here is defense-in-depth and gives clean error messages.
//
// INVARIANT: a "use server" module exports ONLY async functions. The role check
// and role list below are module-internal (not exported). Shared types live in
// @/lib/studio/saved-templates.

import { createClient } from "@/lib/supabase/server";
import type { SavedTemplate, SavedTemplatePayload } from "@/lib/studio/saved-templates";
import { SAVED_TEMPLATE_NAME_MAX } from "@/lib/studio/saved-templates";

const STUDIO_ROLES = ["super_admin", "content_admin"];

async function requireStudio() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role as string | undefined;
  if (!role || !STUDIO_ROLES.includes(role)) throw new Error("Unauthorized");
  return { supabase, user };
}

function cleanName(name: string): string {
  const t = (name ?? "").trim().slice(0, SAVED_TEMPLATE_NAME_MAX);
  if (!t) throw new Error("Name required");
  return t;
}

export async function listStudioTemplates(): Promise<SavedTemplate[]> {
  const { supabase } = await requireStudio();
  const { data, error } = await supabase
    .from("estudio_templates")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedTemplate[];
}

export async function saveStudioTemplate(input: {
  name: string;
  baseTemplateId: string;
  payload: SavedTemplatePayload;
}): Promise<SavedTemplate> {
  const { supabase, user } = await requireStudio();
  const name = cleanName(input.name);
  if (!input.baseTemplateId) throw new Error("Missing base template");
  const { data, error } = await supabase
    .from("estudio_templates")
    .insert({
      name,
      base_template_id: input.baseTemplateId,
      payload: input.payload,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as SavedTemplate;
}

export async function renameStudioTemplate(id: string, name: string): Promise<void> {
  const { supabase } = await requireStudio();
  const clean = cleanName(name);
  const { error } = await supabase
    .from("estudio_templates")
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteStudioTemplate(id: string): Promise<void> {
  const { supabase } = await requireStudio();
  const { error } = await supabase.from("estudio_templates").delete().eq("id", id);
  if (error) throw error;
}
