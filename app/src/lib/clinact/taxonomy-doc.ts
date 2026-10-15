/**
 * The "Especialidades e temas" list the importer screen links to, generated
 * from ClinAct's OWN taxonomy at download time (Karina 2026-10-13). It used to
 * be a static file copied from the Revalida lists; now that the taxonomy is
 * edited in Admin → ClinAct → Taxonomia, a static copy would go stale the first
 * time a topic is added. Pure: no server imports, so it is testable.
 */
export function taxonomyMarkdown(
  taxonomy: {
    specialties: { id: number; name: string }[];
    topics: { name: string; specialty_id: number | null }[];
  },
  /** BR date key (YYYY-MM-DD, from lib/br-date) of the download — Karina asked for every document to carry its date. */
  generatedOn?: string,
): string {
  const stamp = generatedOn && /^\d{4}-\d{2}-\d{2}$/.test(generatedOn) ? generatedOn.split("-").reverse().join("/") : null;
  const lines = [
    "# ClinAct — Especialidades e temas",
    "",
    ...(stamp ? [`**Gerada em ${stamp}** a partir da Taxonomia · ${taxonomy.topics.length} temas`, ""] : []),
    "Lista atual da taxonomia do ClinAct, gerada agora a partir de",
    "Admin → ClinAct → Taxonomia. É própria do ClinAct: independente do Revalida.",
    "",
    "Copie o nome como está aqui. Acento e maiúsculas não importam para o",
    "importador, mas o resto do nome sim.",
    "",
    "O `TEMA:` é procurado só dentro da especialidade do caso. Se o tema que você",
    "quer não estiver na lista, cadastre-o antes em Admin → ClinAct → Taxonomia.",
    "Um tema fora da lista ainda importa, com o aviso \"Sem tema ligado\" — isso é",
    "o plano B, não o caminho normal.",
    "",
    "---",
    "",
    "## Especialidades",
    "",
    "Escreva na linha `ESPECIALIDADE:` uma destas:",
    "",
    taxonomy.specialties.map((s) => s.name).join(" · "),
    "",
    "---",
    "",
    "## Temas, por especialidade",
  ];
  for (const s of taxonomy.specialties) {
    const topics = taxonomy.topics
      .filter((t) => t.specialty_id === s.id)
      .map((t) => t.name)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    lines.push("", `### ${s.name}`);
    if (topics.length) lines.push(...topics.map((t) => `- ${t}`));
    else lines.push("_Nenhum tema cadastrado ainda._");
  }
  return lines.join("\n") + "\n";
}
