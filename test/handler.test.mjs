import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { handleRequest, validateRequest } from "../native-host/handler.mjs";

function projectFixture() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "project-pdf-handler-")));
  test.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".git"));
  const pdf = path.join(root, "build", "summary.pdf");
  const source = path.join(root, "docs", "summary.md");
  fs.mkdirSync(path.dirname(pdf), { recursive: true });
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(pdf, "pdf fixture");
  fs.writeFileSync(source, "A useful selected passage.\n");
  return { root, pdf, source };
}

function request(overrides = {}) {
  return {
    version: 1,
    id: "request-1",
    action: "highlight",
    pdfUrl: "file:///missing.pdf",
    selection: "selected passage",
    markers: { open: "==", close: "==" },
    ...overrides,
  };
}

test("handles a complete highlight request", async () => {
  const fixture = projectFixture();
  const response = await handleRequest(request({ pdfUrl: pathToFileURL(fixture.pdf).href }));

  assert.equal(response.ok, true);
  assert.equal(response.projectRoot, fixture.root);
  assert.equal(response.sourcePath, fixture.source);
  assert.equal(fs.readFileSync(fixture.source, "utf8"), "A useful ==selected passage==.\n");
});

test("handles a Peek highlight using its exposed source directory", async () => {
  const fixture = projectFixture();
  const response = await handleRequest(request({
    pdfUrl: undefined,
    previewUrl: "http://localhost:52359/?theme=light",
    sourceBaseUrl: pathToFileURL(path.dirname(fixture.source)).href,
  }));

  assert.equal(response.ok, true);
  assert.equal(response.projectRoot, fixture.root);
  assert.equal(response.sourcePath, fixture.source);
  assert.equal(fs.readFileSync(fixture.source, "utf8"), "A useful ==selected passage==.\n");
});

test("prefers Peek's exact source metadata over directory inference", async () => {
  const fixture = projectFixture();
  const duplicate = path.join(path.dirname(fixture.source), "duplicate.md");
  fs.writeFileSync(duplicate, "Another selected passage.\n");

  const response = await handleRequest(request({
    pdfUrl: undefined,
    previewUrl: "http://localhost:52359/?theme=light",
    sourcePath: fixture.source,
    sourceBaseUrl: path.dirname(fixture.source),
  }));

  assert.equal(response.ok, true);
  assert.equal(response.sourcePath, fixture.source);
  assert.equal(fs.readFileSync(duplicate, "utf8"), "Another selected passage.\n");
});

test("builds a generic project-context explanation", async () => {
  const fixture = projectFixture();
  let invocation;
  const response = await handleRequest(
    request({
      action: "explain",
      provider: "codex",
      pdfUrl: pathToFileURL(fixture.pdf).href,
    }),
    {
      runAgent: async (provider, prompt, projectRoot) => {
        invocation = { provider, prompt, projectRoot };
        return "A concise explanation.";
      },
    },
  );

  assert.equal(response.answer, "A concise explanation.");
  assert.equal(invocation.provider, "codex");
  assert.equal(invocation.projectRoot, fixture.root);
  assert.match(invocation.prompt, /Explain the selected text in the context of this project\./u);
  assert.match(invocation.prompt, /docs\/summary\.md/u);
  assert.doesNotMatch(invocation.prompt, /paper review|literature/iu);
});

test("explanation continues when Markdown source resolution is ambiguous", async () => {
  const fixture = projectFixture();
  fs.rmSync(fixture.source);
  for (const directory of ["one", "two"]) {
    const candidate = path.join(fixture.root, directory, "summary.md");
    fs.mkdirSync(path.dirname(candidate), { recursive: true });
    fs.writeFileSync(candidate, "candidate");
  }

  const response = await handleRequest(
    request({
      action: "explain",
      provider: "claude",
      pdfUrl: pathToFileURL(fixture.pdf).href,
    }),
    { runAgent: async () => "Explanation without a source association." },
  );

  assert.equal(response.ok, true);
  assert.equal(response.sourcePath, undefined);
});

test("validates action, provider, and selection", () => {
  assert.throws(() => validateRequest(request({ action: "delete" })), /Action must/u);
  assert.throws(
    () => validateRequest(request({ action: "explain", provider: "other" })),
    /Provider must/u,
  );
  assert.throws(() => validateRequest(request({ selection: " " })), /Select some text/u);
  assert.throws(
    () => validateRequest(request({ pdfUrl: undefined, previewUrl: undefined })),
    /exactly one supported local document URL/u,
  );
});

test("rejects non-localhost previews", async () => {
  await assert.rejects(
    handleRequest(request({
      pdfUrl: undefined,
      previewUrl: "http://example.com/",
      sourceBaseUrl: "/tmp",
    })),
    (error) => error.code === "INVALID_PREVIEW_URL",
  );
});
