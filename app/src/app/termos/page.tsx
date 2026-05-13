import Link from "next/link";

export const metadata = { title: "Termos de uso — MedHelpSpace" };

export default function TermosPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border/50 px-6">
        <Link href="/" className="font-semibold tracking-tight text-brand hover:opacity-80">
          MedHelpSpace
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <h1 className="mb-4 text-2xl font-bold">Termos de uso</h1>
        <p className="mb-6 text-sm text-muted-foreground">Última atualização: maio de 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-foreground">
          <p>
            Ao utilizar a plataforma MedHelpSpace, você concorda com os termos
            descritos neste documento. Leia com atenção antes de criar sua conta.
          </p>

          <h2 className="text-base font-semibold">1. Uso da plataforma</h2>
          <p>
            A plataforma é destinada exclusivamente a médicos e estudantes de
            medicina que se preparam para o exame Revalida. O acesso é pessoal e
            intransferível.
          </p>

          <h2 className="text-base font-semibold">2. Propriedade intelectual</h2>
          <p>
            Todo o conteúdo disponível na plataforma — textos, questões,
            flashcards, áudios e imagens — é de propriedade exclusiva do
            MedHelpSpace e protegido por lei. É proibida a reprodução ou
            distribuição sem autorização prévia.
          </p>

          <h2 className="text-base font-semibold">3. Responsabilidades</h2>
          <p>
            O usuário é responsável pela segurança de suas credenciais de acesso
            e pelo uso adequado da plataforma. O MedHelpSpace não se
            responsabiliza por resultados em provas ou concursos.
          </p>

          <h2 className="text-base font-semibold">4. Cancelamento</h2>
          <p>
            O acesso pode ser cancelado a qualquer momento pelo usuário. Não há
            reembolso proporcional após a ativação do plano.
          </p>

          <h2 className="text-base font-semibold">5. Alterações</h2>
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
      </main>
    </div>
  );
}
