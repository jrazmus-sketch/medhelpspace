"use client";

import { formatCpf, type CheckoutStudent, type NfseTomador, type TomadorType } from "@/lib/br";
import { NotaFiscalFields } from "@/components/checkout/nota-fiscal-fields";

interface Props {
  tomador: NfseTomador;
  onTomador: (patch: Partial<NfseTomador>) => void;
  onTypeChange: (type: TomadorType) => void;
  student: CheckoutStudent;
  onStudent: (patch: Partial<CheckoutStudent>) => void;
  /** The account that receives the access — shown in the student block. */
  accountEmail: string;
}

const fieldCls =
  "min-h-12 w-full min-w-0 rounded-xl border border-border bg-background px-4 text-base text-foreground placeholder:text-foreground/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

// "Dados para a nota fiscal" on the Revalida checkout — the SAME block as the
// ClinAct one (Karina 2026-10-28). When the nota is for someone else (another
// Pessoa Física or a company), the student who will access the course is asked
// for apart and stored apart (billing_first/last_name + billing_cpf).
export function BillingForm({ tomador, onTomador, onTypeChange, student, onStudent, accountEmail }: Props) {
  return (
    <NotaFiscalFields
      value={tomador}
      onChange={onTomador}
      onTypeChange={onTypeChange}
      fieldClass={fieldCls}
      optionClass="border-border bg-background"
      student={
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Aluno (quem vai acessar o curso)
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Nome completo do aluno</span>
            <input
              className={fieldCls}
              value={student.name}
              onChange={(e) => onStudent({ name: e.target.value })}
              autoComplete="off"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">CPF do aluno</span>
            <input
              className={fieldCls}
              value={student.cpf}
              onChange={(e) => onStudent({ cpf: formatCpf(e.target.value) })}
              inputMode="numeric"
              placeholder="000.000.000-00"
              required
            />
          </label>
          {accountEmail && (
            <p className="text-sm text-muted-foreground">
              O acesso fica na conta <span className="font-medium text-foreground">{accountEmail}</span>.
            </p>
          )}
        </div>
      }
    />
  );
}
