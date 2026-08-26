import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validateStore } from "../scripts/validate-store.mjs";

test("Chrome Web Store package metadata and icons validate", () => {
  const result = validateStore();
  assert.equal(result.extensionId, "ocgphhjnbmjbfkhfikdmbfknpmddcpgf");
  assert.equal(result.manifest.name, "PDF AI Reader");
});

test("AI requests are gated by a prominent consent disclosure", () => {
  const script = fs.readFileSync("extension/sidepanel.js", "utf8");
  const html = fs.readFileSync("extension/sidepanel.html", "utf8");
  assert.ok(script.indexOf("await ensureAiDataConsent") < script.indexOf("chrome.runtime.sendNativeMessage"));
  assert.match(script, /AI_DATA_CONSENT_REQUIRED/u);
  assert.match(html, /selected text and document location/u);
  assert.match(html, /Not now/u);
  assert.match(html, /Continue/u);
});

test("privacy and listing materials disclose local and provider processing", () => {
  const privacy = fs.readFileSync("PRIVACY.md", "utf8");
  const listing = fs.readFileSync("store/listing.md", "utf8");
  for (const document of [privacy, listing]) {
    assert.match(document, /OpenAI/u);
    assert.match(document, /Anthropic/u);
    assert.match(document, /local/u);
  }
  assert.match(privacy, /Limited Use requirements/u);
  assert.match(listing, /Permission justifications/u);
});

test("reviewer fixture is a selectable one-page PDF with a sibling Markdown source", () => {
  const pdf = fs.readFileSync("store/reviewer-fixture/review.pdf");
  const markdown = fs.readFileSync("store/reviewer-fixture/review.md", "utf8");
  const sentence = "A highlighted passage remains connected to its Markdown source.";
  assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.4");
  assert.ok(pdf.includes(Buffer.from(sentence, "ascii")));
  assert.match(markdown, new RegExp(sentence.replaceAll(".", "\\."), "u"));
});
