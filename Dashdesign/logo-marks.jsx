// logo-marks.jsx — 6 logo concepts
// All marks: 200x200 viewBox, use currentColor for strokes/fills.

// 01 — Stethoscope with smile (cleanest evolution of original)
// Two ear-tips at top, tubes flow down and join into a chestpiece that contains the friendly face.
function MarkStethoSmile() {
  return (
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      {/* ear tips */}
      <circle cx="58" cy="28" r="7" fill="currentColor"/>
      <circle cx="142" cy="28" r="7" fill="currentColor"/>
      {/* tubes — symmetric C-curves from ear-tips down to the top of the chestpiece */}
      <path d="M 58 35 C 58 85, 70 105, 100 110"
            stroke="currentColor" strokeWidth="9" fill="none" strokeLinecap="round"/>
      <path d="M 142 35 C 142 85, 130 105, 100 110"
            stroke="currentColor" strokeWidth="9" fill="none" strokeLinecap="round"/>
      {/* chestpiece (face) */}
      <circle cx="100" cy="142" r="40" stroke="currentColor" strokeWidth="9" fill="none"/>
      {/* eyes */}
      <circle cx="86" cy="134" r="4" fill="currentColor"/>
      <circle cx="114" cy="134" r="4" fill="currentColor"/>
      {/* smile */}
      <path d="M 84 150 Q 100 166, 116 150"
            stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// 02 — Smile-only mark (just the friendly face, big circle)
// Lets the chestpiece BE the brand — most minimal, most modern.
function MarkSmileOnly() {
  return (
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <circle cx="100" cy="100" r="84" stroke="currentColor" strokeWidth="12" fill="none"/>
      <circle cx="76" cy="84" r="8" fill="currentColor"/>
      <circle cx="124" cy="84" r="8" fill="currentColor"/>
      <path d="M 66 116 Q 100 152, 134 116"
            stroke="currentColor" strokeWidth="11" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// 03 — Pulse smile (smile becomes a heartbeat waveform)
// Visual pun: the smile IS a pulse line. Friendly + medical in one stroke.
function MarkPulseSmile() {
  return (
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <circle cx="100" cy="100" r="84" stroke="currentColor" strokeWidth="12" fill="none"/>
      <circle cx="76" cy="80" r="8" fill="currentColor"/>
      <circle cx="124" cy="80" r="8" fill="currentColor"/>
      {/* pulse waveform forming the smile */}
      <path d="M 50 128 L 76 128 L 84 112 L 94 144 L 104 104 L 114 144 L 124 128 L 150 128"
            stroke="currentColor" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// 04 — Monogram M with pulse spike
// The middle V of the M is replaced with a heartbeat spike — letter mark + medical pun.
function MarkMPulse() {
  return (
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <path d="M 32 168 L 32 38
               L 76 96
               L 86 80 L 96 130 L 106 70 L 116 110 L 124 96
               L 168 38 L 168 168"
            stroke="currentColor" strokeWidth="14" fill="none"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// 05 — Heart with stethoscope "ears"
// Two small dots at top (ears), heart-shape with a slight smile cut in it.
function MarkHeartEars() {
  return (
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      {/* ear tips */}
      <circle cx="60" cy="34" r="6" fill="currentColor"/>
      <circle cx="140" cy="34" r="6" fill="currentColor"/>
      {/* connecting tubes into the heart shape lobes */}
      <path d="M 60 40 C 60 70, 70 80, 78 80
               M 140 40 C 140 70, 130 80, 122 80"
            stroke="currentColor" strokeWidth="7" fill="none" strokeLinecap="round"/>
      {/* heart body */}
      <path d="M 100 178
               C 100 178, 38 138, 38 100
               C 38 78, 58 64, 78 76
               C 90 84, 100 100, 100 100
               C 100 100, 110 84, 122 76
               C 142 64, 162 78, 162 100
               C 162 138, 100 178, 100 178 Z"
            stroke="currentColor" strokeWidth="9" fill="none" strokeLinejoin="round"/>
      {/* tiny smile inside */}
      <path d="M 86 120 Q 100 134, 114 120"
            stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// 06 — Bold filled smile mark (heavier weight)
// Same construction as 02 but filled — for use where outlines wash out (small sizes, favicons).
function MarkSmileBold() {
  return (
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <circle cx="100" cy="100" r="86" fill="currentColor"/>
      {/* knock out features with bg via path-rule trick:
          use a second path that punches holes — but simpler: overlay shapes in a contrasting color via mask */}
      <mask id="msFace" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
        <rect width="200" height="200" fill="white"/>
        <circle cx="76" cy="84" r="9" fill="black"/>
        <circle cx="124" cy="84" r="9" fill="black"/>
        <path d="M 64 114 Q 100 154, 136 114" stroke="black" strokeWidth="12" fill="none" strokeLinecap="round"/>
      </mask>
      <circle cx="100" cy="100" r="86" fill="currentColor" mask="url(#msFace)"/>
    </svg>
  );
}

Object.assign(window, {
  MarkStethoSmile, MarkSmileOnly, MarkPulseSmile, MarkMPulse, MarkHeartEars, MarkSmileBold,
});
