import Link from "next/link";
import { getEditablePage } from "@/lib/queries/editable-pages";
import { EditableText } from "@/components/admin/editable-text";
import { safe } from "@/lib/sanitize";

export const metadata = { title: "Termos de uso — MedHelpSpace" };

// ISR; inline edits call revalidatePath("/termos") for instant refresh.
export const revalidate = 3600;

export default async function TermosPage() {
  const doc = await getEditablePage("termos");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border/50 px-6">
        <Link href="/" className="font-semibold tracking-tight text-brand hover:opacity-80">
          MedHelpSpace
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        {doc ? (
          <>
            <h1 className="mb-4 text-2xl font-bold">
              <EditableText
                variant="plain"
                as="span"
                table="editable_pages"
                id={doc.id}
                field="title"
                value={doc.title}
              />
            </h1>
            <EditableText
              variant="rich"
              table="editable_pages"
              id={doc.id}
              field="body_html"
              className="prose-content"
              html={safe(doc.body_html)}
            />
          </>
        ) : (
          <FallbackContent />
        )}
      </main>
    </div>
  );
}

// Rendered when the `editable_pages` row is missing (pre-patch / mock mode). Keep
// in sync with the body_html seed in schema-patch-editable-pages.sql.
function FallbackContent() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Termos de uso</h1>
      <p className="mb-6 text-sm text-muted-foreground">Última atualização: maio de 2026</p>

      <div className="prose-content">
        <p>
          Ao utilizar a plataforma MedHelpSpace, você concorda com os termos
          descritos neste documento. Leia com atenção antes de criar sua conta.
        </p>

        <h2>1. Uso da plataforma</h2>
        <p>
          A plataforma é destinada exclusivamente a médicos e estudantes de
          medicina que se preparam para o exame Revalida. O acesso é pessoal e
          intransferível.
        </p>

        <h2>2. Propriedade intelectual</h2>
        <p>
          Todo o conteúdo disponível na plataforma — textos, questões,
          flashcards, áudios e imagens — é de propriedade exclusiva do
          MedHelpSpace e protegido por lei. É proibida a reprodução ou
          distribuição sem autorização prévia.
        </p>

        <h2>3. Responsabilidades</h2>
        <p>
          O usuário é responsável pela segurança de suas credenciais de acesso
          e pelo uso adequado da plataforma. O MedHelpSpace não se
          responsabiliza por resultados em provas ou concursos.
        </p>

        <h2>4. Cancelamento</h2>
        <p>
          O acesso pode ser cancelado a qualquer momento pelo usuário. Não há
          reembolso proporcional após a ativação do plano.
        </p>

        <h2>5. Alterações</h2>
        <p>
          Estes termos podem ser atualizados periodicamente. O uso continuado
          da plataforma após a publicação de alterações constitui aceite dos
          novos termos.
        </p>

        <p className="pt-4 text-xs text-muted-foreground">
          Dúvidas? Entre em contato em{" "}
          <a href="mailto:contato@medhelpspace.com.br" className="text-brand hover:underline">
            contato@medhelpspace.com.br
          </a>
        </p>
      </div>
    </>
  );
}
