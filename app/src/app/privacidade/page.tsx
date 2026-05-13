import Link from "next/link";

export const metadata = { title: "Política de privacidade — MedHelpSpace" };

export default function PrivacidadePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border/50 px-6">
        <Link href="/" className="font-semibold tracking-tight text-brand hover:opacity-80">
          MedHelpSpace
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <h1 className="mb-4 text-2xl font-bold">Política de privacidade</h1>
        <p className="mb-6 text-sm text-muted-foreground">Última atualização: maio de 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-foreground">
          <p>
            Esta política descreve como o MedHelpSpace coleta, usa e protege
            as informações dos usuários da plataforma.
          </p>

          <h2 className="text-base font-semibold">1. Dados coletados</h2>
          <p>
            Coletamos nome, endereço de e-mail e dados de uso da plataforma
            (progresso em questões, flashcards e aulas). Não coletamos dados
            sensíveis de saúde.
          </p>

          <h2 className="text-base font-semibold">2. Uso das informações</h2>
          <p>
            Os dados são utilizados para fornecer e melhorar o serviço,
            personalizar a experiência de aprendizado e enviar comunicações
            relacionadas à conta.
          </p>

          <h2 className="text-base font-semibold">3. Compartilhamento</h2>
          <p>
            Não vendemos nem compartilhamos seus dados pessoais com terceiros,
            exceto quando exigido por lei ou para operar serviços essenciais da
            plataforma (ex.: processamento de pagamento).
          </p>

          <h2 className="text-base font-semibold">4. Segurança</h2>
          <p>
            Utilizamos criptografia e boas práticas de segurança para proteger
            suas informações. O acesso aos dados é restrito à equipe autorizada.
          </p>

          <h2 className="text-base font-semibold">5. Seus direitos (LGPD)</h2>
          <p>
            Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018),
            você pode solicitar acesso, correção ou exclusão dos seus dados a
            qualquer momento.
          </p>

          <h2 className="text-base font-semibold">6. Cookies</h2>
          <p>
            Utilizamos cookies técnicos necessários para o funcionamento da
            plataforma, como manutenção de sessão. Não utilizamos cookies de
            rastreamento para publicidade.
          </p>

          <p className="pt-4 text-xs text-muted-foreground">
            Para exercer seus direitos ou tirar dúvidas, entre em contato em{" "}
            <a href="mailto:contato@medhelpspace.com.br" className="text-brand hover:underline">
              contato@medhelpspace.com.br
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
