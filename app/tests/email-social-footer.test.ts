import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBroadcastTemplate,
  renderEmail,
  DEFAULT_EMAIL_SETTINGS,
} from "@/lib/email-render";
import { SOCIAL_PROFILES, SOCIAL_TAGLINE } from "@/lib/social";

// The footer ships on EVERY e-mail, so a broken social row is broken everywhere at
// once and there is no single page to notice it on. These assertions run against
// the real rendered HTML.

function footerHtml() {
  const tpl = buildBroadcastTemplate({ subject: "s", bodyText: "b" });
  return renderEmail(tpl, DEFAULT_EMAIL_SETTINGS, {
    greeting: "Oi! ",
    unsubscribeUrl: "https://medhelpspace.com.br/api/leads/unsubscribe?t=x",
  }).html;
}

test("every social profile is linked", () => {
  const html = footerHtml();
  for (const p of SOCIAL_PROFILES) {
    assert.ok(html.includes(`href="${p.url}"`), `missing link for ${p.label}`);
  }
});

// Gmail and Outlook strip inline <svg> and reject data: URIs — an e-mail glyph has
// to be a real raster image at an ABSOLUTE url. A relative src renders as a broken
// image in every client.
test("each glyph is an absolute-url raster image, never SVG or data:", () => {
  const html = footerHtml();
  for (const p of SOCIAL_PROFILES) {
    assert.ok(
      html.includes(`${DEFAULT_EMAIL_SETTINGS.app_url}/brand/${p.emailIcon}`),
      `missing absolute icon src for ${p.label}`,
    );
    assert.ok(p.emailIcon.endsWith(".png"), `${p.label} icon must be a PNG`);
  }
  const footer = html.slice(html.indexOf("border-top:1px solid #e5e7eb"));
  assert.ok(!footer.includes("<svg"), "footer must not contain inline SVG");
  assert.ok(!footer.includes("src=\"data:"), "footer must not use data: URIs");
});

test("each glyph carries alt text", () => {
  const html = footerHtml();
  for (const p of SOCIAL_PROFILES) {
    assert.ok(html.includes(`alt="${p.label}"`), `missing alt for ${p.label}`);
  }
});

test("the shared tagline renders once", () => {
  const html = footerHtml();
  const hits = html.split(SOCIAL_TAGLINE).length - 1;
  assert.equal(hits, 1);
});

// The handles are NOT interchangeable — TikTok carries `_revalida`. Printing one
// handle as if it covered all three would send people to a profile that isn't ours.
test("no single handle is presented as covering every network", () => {
  const handles = new Set(SOCIAL_PROFILES.map((p) => p.handle));
  assert.ok(handles.size > 1, "fixture drift: handles are expected to differ");
  const html = footerHtml();
  const footer = html.slice(html.indexOf("border-top:1px solid #e5e7eb"));
  // The chosen layout is icons + tagline, so no bare handle should be printed.
  for (const h of handles) {
    assert.ok(!footer.includes(`>${h}<`), `footer prints the bare handle ${h}`);
  }
});

test("profiles are well-formed https urls", () => {
  for (const p of SOCIAL_PROFILES) {
    assert.match(p.url, /^https:\/\//, `${p.label} url must be https`);
    assert.ok(p.label.length > 0 && p.handle.startsWith("@"), `${p.label} metadata`);
  }
});
