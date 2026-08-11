import { test } from "node:test";
import assert from "node:assert/strict";
import { isGmailAddress } from "@/lib/gmail";

// Gates the "your e-mail is in the Promoções tab" note on every confirmation
// screen. A FALSE POSITIVE is the expensive direction: it sends someone hunting
// for a tab their mail client does not have, on the exact screen where they are
// already anxious that nothing arrived.

test("consumer Gmail matches", () => {
  assert.equal(isGmailAddress("maria@gmail.com"), true);
  assert.equal(isGmailAddress("maria@googlemail.com"), true);
});

test("case and stray whitespace do not defeat it", () => {
  assert.equal(isGmailAddress("Maria@GMAIL.COM"), true);
  assert.equal(isGmailAddress("maria@Gmail.com "), true);
});

// Several surfaces only ever hold the masked address; masking replaces the local
// part, never the domain, so detection has to survive it.
test("a masked address still resolves", () => {
  assert.equal(isGmailAddress("m****@gmail.com"), true);
});

test("plus-addressing and dots are irrelevant to the domain", () => {
  assert.equal(isGmailAddress("maria.silva+revalida@gmail.com"), true);
});

// The ones that would misfire the note.
test("look-alike domains do NOT match", () => {
  assert.equal(isGmailAddress("maria@gmail.com.br"), false);
  assert.equal(isGmailAddress("maria@notgmail.com"), false);
  assert.equal(isGmailAddress("maria@mail.gmail.com"), false);
  assert.equal(isGmailAddress("maria@gmail.co"), false);
  assert.equal(isGmailAddress("gmail.com@outlook.com"), false);
});

test("other providers do not match", () => {
  assert.equal(isGmailAddress("maria@hotmail.com"), false);
  assert.equal(isGmailAddress("maria@usp.br"), false);
});

test("junk input is false, never a crash", () => {
  assert.equal(isGmailAddress(""), false);
  assert.equal(isGmailAddress(null), false);
  assert.equal(isGmailAddress(undefined), false);
  assert.equal(isGmailAddress("no-at-sign"), false);
  assert.equal(isGmailAddress("@gmail.com"), true); // degenerate but correctly domained
});
