import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { SiteText } from "@/components/landing/site-text";
import { SIMULADO_SET_VERSION } from "@/lib/magnet/simulado";

// "Veja por dentro" — real screenshots of the actual exam and the actual report.
//
// Why screenshots rather than a photo: eyetracking research is consistent that
// purely decorative images (the smiling-doctors-around-a-laptop genre) get skipped
// entirely, while images carrying real information — products, real content — are
// actively read. The one thing this page was never showing is the product itself:
// it asked for an e-mail in exchange for 100 unseen questions, when question
// quality is the whole differentiator.
//
// Captured from the live app by scripts/capture-simulado-shots.js, so they can be
// regenerated whenever the UI changes instead of rotting into a lie.

export async function SimuladoPeek() {
  // The figures are the real ones from the question set — an ECG, a chest X-ray, a
  // mammogram and so on — served from the same CDN URLs the exam uses. They make
  // "questões com imagem" verifiable instead of a claim.
  const admin = createAdminClient();
  const { data } = await admin
    .from("simulado_questions")
    .select("position, media_url")
    .eq("set_version", SIMULADO_SET_VERSION)
    .not("media_url", "is", null)
    .order("position", { ascending: true });

  const figures = (data ?? []).map((r) => r.media_url as string);

  return (
    <section className="border-y border-border/60 bg-surface-1/20">
      <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-brand">
            <SiteText as="span" k="sim.peek.eyebrow" fallback="Veja por dentro" />
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            <SiteText as="span" k="sim.peek.title" fallback="É exatamente assim que o simulado funciona" />
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            <SiteText
              as="span"
              multiline
              k="sim.peek.body"
              fallback="Sem enrolação: uma questão por vez, folha de respostas para navegar como no caderno oficial e, ao entregar, um relatório com o seu desempenho em cada grande área."
            />
          </p>
        </div>

        <div className="mt-9 grid gap-6 sm:grid-cols-2">
          {[
            {
              src: "/landing/simulado/exam-desktop.webp",
              w: 1600,
              h: 1200,
              k: "sim.peek.shot_exam",
              fallback: "Durante a prova: uma questão por vez, sem cronômetro e sem gabarito à mostra.",
            },
            {
              src: "/landing/simulado/report-desktop.webp",
              w: 1600,
              h: 1307,
              k: "sim.peek.shot_report",
              fallback: "Ao entregar: sua nota, o desempenho nas cinco grandes áreas e os temas a revisar.",
            },
          ].map((shot) => (
            <figure key={shot.src} className="space-y-2.5">
              <div className="overflow-hidden rounded-2xl border border-border/80 bg-black/40 shadow-xl shadow-black/30">
                <Image
                  src={shot.src}
                  alt=""
                  width={shot.w}
                  height={shot.h}
                  sizes="(min-width: 640px) 50vw, 100vw"
                  className="h-auto w-full"
                />
              </div>
              <figcaption className="px-1 text-[13px] leading-relaxed text-muted-foreground">
                <SiteText as="span" multiline k={shot.k} fallback={shot.fallback} />
              </figcaption>
            </figure>
          ))}
        </div>

        {figures.length > 0 && (
          <div className="mt-10 rounded-2xl border border-border/80 bg-surface-1/40 p-5">
            <p className="text-center text-[13px] text-muted-foreground">
              <SiteText
                as="span"
                multiline
                k="sim.peek.figures"
                fallback="Como na prova real, algumas questões trazem imagem — eletrocardiograma, radiografia, mamografia, retinografia, gráficos epidemiológicos."
              />
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2.5">
              {figures.map((src) => (
                <div
                  key={src}
                  className="h-16 w-24 overflow-hidden rounded-lg border border-border bg-white sm:h-20 sm:w-28"
                >
                  {/* Plain <img>, not next/image: these are Bunny CDN URLs and the
                      app has no remotePatterns configured — the files are already
                      WebP and sized, so routing them through the optimizer would
                      only add cost. Same pattern the exam and report use.
                      Decorative here; the exam is where they carry meaning. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
