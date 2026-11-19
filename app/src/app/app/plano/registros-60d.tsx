import Link from "next/link";
import type { DerivedPlan } from "@/lib/study-plan/derive";

/**
 * Meu Plano during the MedHelp 60D (Karina 2026-11-19): the student's progress in the two parts, each by its own
 * criteria. "Registro do curso regular" is rebuilt on every load from the real history — it is never frozen at the
 * 60D opening, and what the student studies by choice keeps updating it. "Registro do MedHelp 60D" reads the ticks
 * of the 60D page's checklist (one tick, no second marking here). A 60D activity never concludes a regular-course
 * material, and the other way round. Her sentences are kept verbatim.
 */

const box: React.CSSProperties = {
  padding: "16px 18px",
  background: "var(--surface-1)",
  border: "1px solid var(--surface-2)",
  borderRadius: "var(--radius)",
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 12,
};

function Row({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
      <dt style={{ color: "var(--muted-foreground)" }}>{name}</dt>
      <dd style={{ margin: 0, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>{value}</dd>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function RegistroCursoRegular({ record }: { record: DerivedPlan["regularRecord"] }) {
  return (
    <section aria-labelledby="registro-regular">
      <h2 id="registro-regular" style={label}>Registro do curso regular</h2>
      <div style={box}>
        <p style={{ fontSize: 14, lineHeight: 1.55 }}>
          Seu progresso no curso regular continua sendo registrado. Tudo o que você já realizou permanece salvo, e as
          atividades que fizer por escolha própria também atualizam este registro.
        </p>
        <dl
          style={{
            margin: "14px 0 0", padding: "12px 14px",
            background: "var(--background)", border: "1px solid var(--surface-2)", borderRadius: "var(--radius-sm)",
            display: "flex", flexDirection: "column", gap: 8, fontSize: 13, lineHeight: 1.5,
          }}
        >
          <Row name="Temas concluídos" value={`${record.topicsConcluded} de ${record.topicsTotal}`} />
          <Row name="Questões respondidas" value={String(record.questionsAnswered)} />
          <Row name="Mini simulados concluídos" value={String(record.miniSimuladosConcluded)} />
          <Row name="Flashcards estudados" value={plural(record.flashcardsStudied, "cartão", "cartões")} />
          <Row name="Revalida Up concluídos" value={String(record.revalidaUpConcluded)} />
          <Row name="MedVoice concluídos" value={String(record.medvoiceConcluded)} />
        </dl>
      </div>
    </section>
  );
}

export function RegistroMedhelp60({ record }: { record: NonNullable<DerivedPlan["d60Record"]> }) {
  return (
    <section aria-labelledby="registro-60d">
      <h2 id="registro-60d" style={label}>Registro do MedHelp 60D</h2>
      <div style={box}>
        <p style={{ fontSize: 14, lineHeight: 1.55 }}>
          Acompanhe aqui seu progresso no cronograma do MedHelp 60D. Marque as atividades concluídas no checklist para
          atualizar este registro.
        </p>
        <p style={{ fontSize: 15, fontWeight: 600, marginTop: 12, lineHeight: 1.4 }}>
          {record.done} de {record.available} atividades concluídas (
          {record.done > 0 && record.percent === 0 ? "menos de 1%" : `${record.percent}%`})
        </p>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={record.percent}
          aria-label="Atividades do MedHelp 60D concluídas"
          style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", marginTop: 10, overflow: "hidden" }}
        >
          <div style={{ width: `${record.percent}%`, height: "100%", borderRadius: 999, background: "var(--brand)" }} />
        </div>
        {record.notDelivered > 0 && (
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 10, lineHeight: 1.5 }}>
            {plural(record.notDelivered, "atividade do cronograma ainda aguarda", "atividades do cronograma ainda aguardam")} o
            material e não {record.notDelivered === 1 ? "entra" : "entram"} no percentual.
          </p>
        )}
        <Link
          href="/app/medhelp-60d"
          className="min-h-11"
          style={{
            display: "inline-flex", alignItems: "center", marginTop: 6,
            fontSize: 14, fontWeight: 600, color: "var(--brand-text, var(--brand))", textDecoration: "underline",
          }}
        >
          Abrir o cronograma do MedHelp 60D
        </Link>
      </div>
    </section>
  );
}
