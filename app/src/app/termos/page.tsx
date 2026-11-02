import Link from "next/link";
import { getEditablePage } from "@/lib/queries/editable-pages";
import { EditableText } from "@/components/admin/editable-text";
import { safe } from "@/lib/sanitize";
import { LegalFallback } from "@/components/legal/legal-fallback";
import { TERMOS_HTML } from "@/lib/legal-pages";

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
          <LegalFallback title="Termos de uso" html={TERMOS_HTML} />
        )}
      </main>
    </div>
  );
}
