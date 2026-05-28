"use client";

import { useAudioPlayerEngine } from "./audio-player-engine";
import { DesktopAudioPlayerChrome } from "./audio-player-desktop";
import { MobileAudioPlayerChrome, type MobileSection } from "./audio-player-mobile";

type Props = {
  src: string;
  /** Brand chip line, e.g. "MedVoice · Áudio". Also used as Media Session artist. */
  title?: string;
  lessonId?: number;
  initialPosition?: number;
  sectionTitle?: string;
  /** Optional rendered node for the section title (e.g. EditableText). */
  sectionTitleNode?: React.ReactNode;
  albumName?: string;
  nextHref?: string | null;
  nextTitle?: string | null;
  prevHref?: string | null;

  // ── Mobile-only props (ignored by desktop chrome) ──
  /** Page identity shown in the mobile player's album area, e.g. "Cardiologia Medvoice". */
  pageTitle?: string;
  /** Specialty slug for the mobile player's icon + ambient color theme. */
  specialtySlug?: string;
  /** Sibling sections for the mobile player's "Seções" tab. */
  sections?: MobileSection[];
  /** Optional pre-rendered transcript node for the mobile "Transcrição" tab. */
  transcriptNode?: React.ReactNode;
  /** Back-navigation target rendered in the mobile player's top chevron. */
  backHref?: string;
};

export function AudioPlayer({
  src,
  title,
  lessonId,
  initialPosition = 0,
  sectionTitle,
  sectionTitleNode,
  albumName,
  nextHref,
  nextTitle,
  prevHref,
  pageTitle,
  specialtySlug,
  sections,
  transcriptNode,
  backHref,
}: Props) {
  const engine = useAudioPlayerEngine({
    src,
    lessonId,
    initialPosition,
    sectionTitle,
    albumName,
    mediaArtist: title,
    nextHref,
    prevHref,
  });

  // One audio element. One engine. Two chromes that read the same state — CSS
  // gates which is visible, so only one is interactive at a time but both stay
  // in sync (state lives in the engine, not the chrome).
  return (
    <>
      <audio
        ref={engine.audioRef}
        src={src}
        preload="metadata"
        style={{ display: "none" }}
      />

      {/* Desktop chrome — visible at md and up. Visibility is applied to the
          chrome's root (not an outer wrapper) so position:sticky's containing
          block remains the parent renderer container; an extra wrapper here
          would collapse to the player's height and kill the stick range. */}
      <DesktopAudioPlayerChrome
        engine={engine}
        title={title}
        sectionTitle={sectionTitle}
        sectionTitleNode={sectionTitleNode}
        nextTitle={nextTitle}
        specialtySlug={specialtySlug}
        prevHref={prevHref}
        nextHref={nextHref}
        rootClassName="hidden md:block"
      />

      {/* Mobile chrome — visible below md. Falls back to desktop chrome if the
          caller didn't supply the mobile-required props (e.g. legacy call sites). */}
      {pageTitle && specialtySlug && sections ? (
        <div className="block md:hidden">
          <MobileAudioPlayerChrome
            engine={engine}
            title={title}
            sectionTitle={sectionTitle}
            sectionTitleNode={sectionTitleNode}
            nextTitle={nextTitle}
            pageTitle={pageTitle}
            specialtySlug={specialtySlug}
            sections={sections}
            transcriptNode={transcriptNode}
            prevHref={prevHref}
            nextHref={nextHref}
            backHref={backHref}
          />
        </div>
      ) : (
        <DesktopAudioPlayerChrome
          engine={engine}
          title={title}
          sectionTitle={sectionTitle}
          sectionTitleNode={sectionTitleNode}
          nextTitle={nextTitle}
          specialtySlug={specialtySlug}
          prevHref={prevHref}
          nextHref={nextHref}
          rootClassName="block md:hidden"
        />
      )}
    </>
  );
}
