import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaRejectionReason, mediaTypeFor, mediaKey, ALLOWED_MEDIA_EXT } from "@/lib/clinact/media";
import { parseCaseFile } from "@/lib/clinact/parse";

// The accepted-format list is a product rule, not a preference (Karina,
// 2026-09-01): a case may only use formats every current browser plays, so a
// student never meets a media control that does nothing. These tests keep the
// three places that must agree — the guide, the importer and the uploader —
// from drifting apart.

test("accepted audio formats pass; refused ones explain themselves", () => {
  for (const name of ["sopro.mp3", "sopro.m4a", "sopro.wav", "sopro.AAC"]) {
    assert.equal(mediaRejectionReason(name), null, name);
    assert.equal(mediaTypeFor(name), "audio");
  }
  const ogg = mediaRejectionReason("sopro.ogg");
  assert.ok(ogg && /18\.4/.test(ogg), ogg ?? "no reason");
  assert.ok(mediaRejectionReason("sopro.opus"));
  assert.ok(mediaRejectionReason("sopro.flac"));
  // Still classified as audio, so the warning names the right kind of media.
  assert.equal(mediaTypeFor("sopro.ogg"), "audio");
});

test("accepted image formats pass; iPhone-only ones are refused", () => {
  for (const name of ["ecg.jpg", "ecg.jpeg", "ecg.png", "ecg.webp", "ecg.gif"]) {
    assert.equal(mediaRejectionReason(name), null, name);
    assert.equal(mediaTypeFor(name), "image");
  }
  const heic = mediaRejectionReason("foto.heic");
  assert.ok(heic && /Safari/.test(heic));
  assert.ok(mediaRejectionReason("scan.tiff"));
});

test("a file with no extension is refused with instructions", () => {
  const r = mediaRejectionReason("sopro");
  assert.ok(r && /extens/.test(r));
});

test("every allowed extension survives mediaKey (the CDN path stays valid)", () => {
  for (const ext of Object.keys(ALLOWED_MEDIA_EXT)) {
    const key = mediaKey(`Arquivo Teste.${ext.toUpperCase()}`);
    assert.equal(key, `arquivo-teste.${ext}`);
    assert.equal(mediaRejectionReason(key), null);
  }
});

test("the importer warns on a refused format instead of failing the case", () => {
  const text = `FORMATO: decisao_30s
TÍTULO: Caso com ogg
## NARRATIVA
Ausculta.
[audio: sopro-aortico.ogg]
legenda: Foco aórtico.
## PERGUNTA
Conduta?
* Auscultar
  feedback: Boa.
- Ignorar
  feedback: Não.
  sedução: Parece rápido.
## LEVE DESTE CASO
Ouça antes de pedir exame.
`;
  const c = parseCaseFile(text).cases[0];
  // A refused format is a WARNING: the case still imports, exactly like a file
  // that has not been recorded yet. Publishing is what stops (the .ogg can
  // never be uploaded, so the media stays missing and missing blocks publish).
  assert.deepEqual(c.errors, []);
  assert.ok(c.doc);
  assert.ok(
    c.warnings.some((w) => /sopro-aortico\.ogg/.test(w.message) && /18\.4/.test(w.message)),
    c.warnings.map((w) => w.message).join("\n"),
  );
});

test("an accepted format produces no format warning", () => {
  const text = `FORMATO: decisao_30s
TÍTULO: Caso com mp3
## NARRATIVA
Ausculta.
[audio: sopro-aortico.mp3]
## PERGUNTA
Conduta?
* Auscultar
  feedback: Boa.
- Ignorar
  feedback: Não.
  sedução: Parece rápido.
## LEVE DESTE CASO
Ouça antes.
`;
  const c = parseCaseFile(text).cases[0];
  assert.deepEqual(c.errors, []);
  assert.ok(!c.warnings.some((w) => /não é aceito|converta/.test(w.message)));
});
