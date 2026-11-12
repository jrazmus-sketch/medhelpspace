// R1 (Karina 2026-11-12): a Meu Plano topic is a set of ORIGINAL Revalida questions,
// not a section. A section (Outros › Ortopedia, Urologia…) is only a visual grouping;
// one original may also be filed in two sections (two records, same question).
//
// Pure functions only — the loader lives in topic-questions-server.ts (server-only),
// so derive.ts / roadmap.ts and their tests can use these without Next's runtime.

/** One row of the `topic_question_links` view. */
export type TopicQuestionLink = {
  topic_id: number;
  exam_question_id: number;
  question_id: number;
  page_id: number;
  is_primary: boolean;
};

export type TopicQuestionIndex = {
  /** platform record (quiz_questions.id) → the original it is a copy of */
  originOfQuestion: Map<number, number>;
  /** topic → originals shown under it (primary + interface/secondary) */
  originsOfTopic: Map<number, Set<number>>;
  /** topic → originals counted for it (primary only) — the live incidence */
  primaryOriginsOfTopic: Map<number, Set<number>>;
  /** topic → the section holding most of its originals (where its link opens) */
  mainSectionOfTopic: Map<number, number>;
  /** section → topics with at least one original there */
  topicsOfSection: Map<number, Set<number>>;
  /** topic → the sections its originals are filed in */
  sectionsOfTopic: Map<number, Set<number>>;
};

function addTo<K, V>(m: Map<K, Set<V>>, k: K, v: V) {
  const s = m.get(k);
  if (s) s.add(v);
  else m.set(k, new Set([v]));
}

export function buildTopicQuestionIndex(links: TopicQuestionLink[]): TopicQuestionIndex {
  const originOfQuestion = new Map<number, number>();
  const originsOfTopic = new Map<number, Set<number>>();
  const primaryOriginsOfTopic = new Map<number, Set<number>>();
  const topicsOfSection = new Map<number, Set<number>>();
  const sectionsOfTopic = new Map<number, Set<number>>();
  // topic → section → originals there (to pick the main section)
  const perSection = new Map<number, Map<number, Set<number>>>();

  for (const l of links) {
    const topic = Number(l.topic_id);
    const origin = Number(l.exam_question_id);
    const page = Number(l.page_id);
    originOfQuestion.set(Number(l.question_id), origin);
    addTo(originsOfTopic, topic, origin);
    if (l.is_primary) addTo(primaryOriginsOfTopic, topic, origin);
    addTo(topicsOfSection, page, topic);
    addTo(sectionsOfTopic, topic, page);
    let bySection = perSection.get(topic);
    if (!bySection) perSection.set(topic, (bySection = new Map()));
    addTo(bySection, page, origin);
  }

  const mainSectionOfTopic = new Map<number, number>();
  for (const [topic, bySection] of perSection) {
    // Most of the topic's originals; ties → the lower page id, so it is stable.
    let best: [number, number] | null = null;
    for (const [page, origins] of bySection) {
      if (!best || origins.size > best[1] || (origins.size === best[1] && page < best[0])) {
        best = [page, origins.size];
      }
    }
    if (best) mainSectionOfTopic.set(topic, best[0]);
  }

  return { originOfQuestion, originsOfTopic, primaryOriginsOfTopic, mainSectionOfTopic, topicsOfSection, sectionsOfTopic };
}

/**
 * Does the topic's link need the `?tema=` filter? Only when opening its main
 * section would show something else than exactly the topic's questions: the section
 * also holds other topics' originals, or the topic has originals in other sections.
 */
export function topicNeedsFilter(index: TopicQuestionIndex, topicId: number): boolean {
  const main = index.mainSectionOfTopic.get(topicId);
  if (main == null) return false;
  const sections = index.sectionsOfTopic.get(topicId);
  if (sections && sections.size > 1) return true;
  const topicsThere = index.topicsOfSection.get(main);
  return !!topicsThere && topicsThere.size > 1;
}

type Attempt = { question_id?: number | null; is_correct: boolean; created_at: string };
export type TopicProgress = { answered: number; correct: number };

/**
 * Per-topic progress over ORIGINAL questions, each judged by its LATEST attempt on
 * ANY of its copies (answering 2024.1 Q97 in Coluna or in the CG copy is the same
 * question). Same latest-attempt + tie-toward-wrong rules as buildPageProgress.
 *
 * The denominator is NOT here: it is the topic's current number of originals, so
 * when new questions are added (4 → 8) the student keeps the 4 answers and the
 * topic reads "4 de 8" — it is no longer "dominado" until the new ones are answered.
 */
export function buildTopicProgress(
  attempts: Attempt[],
  index: TopicQuestionIndex,
): Map<number, TopicProgress> {
  const latest = new Map<number, { correct: boolean; at: string }>(); // origin → verdict
  for (const a of attempts) {
    if (a.question_id == null) continue;
    const origin = index.originOfQuestion.get(Number(a.question_id));
    if (origin == null) continue;
    const prev = latest.get(origin);
    if (!prev || a.created_at > prev.at) {
      latest.set(origin, { correct: a.is_correct, at: a.created_at });
    } else if (a.created_at === prev.at && prev.correct && !a.is_correct) {
      latest.set(origin, { correct: false, at: a.created_at });
    }
  }
  const out = new Map<number, TopicProgress>();
  for (const [topic, origins] of index.originsOfTopic) {
    let answered = 0;
    let correct = 0;
    for (const o of origins) {
      const v = latest.get(o);
      if (!v) continue;
      answered++;
      if (v.correct) correct++;
    }
    if (answered > 0) out.set(topic, { answered, correct });
  }
  return out;
}

/** The `?tema=` link of a topic's questions, or null when the index has none. */
export function topicQuizHref(
  index: TopicQuestionIndex,
  topic: { id: number; slug: string },
  pageById: Map<number, { slug: string; specialty_id: number | null }>,
  specialtySlugById: Map<number, string>,
  fallbackSpecialtySlug: string,
): { href: string; pageId: number } | null {
  const main = index.mainSectionOfTopic.get(topic.id);
  if (main == null) return null;
  const page = pageById.get(main);
  if (!page) return null;
  const spec = (page.specialty_id != null && specialtySlugById.get(page.specialty_id)) || fallbackSpecialtySlug;
  const base = `/app/${spec}/${page.slug}`;
  return {
    href: topicNeedsFilter(index, topic.id) ? `${base}?tema=${encodeURIComponent(topic.slug)}` : base,
    pageId: main,
  };
}
