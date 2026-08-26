import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AppError,
  applyHighlight,
  findMarkdownSource,
  findMarkdownSourceBySelection,
  findProjectRoot,
  findUniqueSelectionRange,
  markdownSourceToPath,
  normalizeWithOffsets,
  pdfUrlToPath,
  sourceBaseUrlToDirectory,
} from "../native-host/core.mjs";
import { pathToFileURL } from "node:url";

function fixture() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "project-pdf-reader-")));
  test.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(target, contents = "") {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, "utf8");
  return target;
}

test("resolves a local PDF URL and nearest Git root", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".git"));
  const pdf = write(path.join(root, "notes", "paper with spaces.pdf"));

  assert.equal(pdfUrlToPath(pathToFileURL(pdf).href), pdf);
  assert.equal(findProjectRoot(pdf), root);
});

test("resolves Peek source paths and directory URLs", () => {
  const root = fixture();
  const source = write(path.join(root, "notes", "paper.md"), "A selected passage.");
  const sourceDirectory = path.dirname(source);

  assert.equal(markdownSourceToPath(source), source);
  assert.equal(markdownSourceToPath(pathToFileURL(source).href), source);
  assert.equal(sourceBaseUrlToDirectory(sourceDirectory), sourceDirectory);
  assert.equal(sourceBaseUrlToDirectory(pathToFileURL(sourceDirectory).href), sourceDirectory);

  assert.throws(
    () => markdownSourceToPath(write(path.join(root, "notes.txt"), "plain text")),
    (error) => error instanceof AppError && error.code === "INVALID_SOURCE_PATH",
  );
  assert.throws(
    () => sourceBaseUrlToDirectory("https://example.com/docs/"),
    (error) => error instanceof AppError && error.code === "INVALID_SOURCE_PATH",
  );
});

test("accepts a .git file and falls back to the PDF directory", () => {
  const root = fixture();
  write(path.join(root, ".git"), "gitdir: somewhere");
  const trackedPdf = write(path.join(root, "nested", "tracked.pdf"));
  assert.equal(findProjectRoot(trackedPdf), root);

  const outside = fixture();
  const untrackedPdf = write(path.join(outside, "plain.pdf"));
  assert.equal(findProjectRoot(untrackedPdf), outside);
});

test("rejects missing and non-PDF local URLs", () => {
  assert.throws(
    () => pdfUrlToPath("https://example.com/file.pdf"),
    (error) => error instanceof AppError && error.code === "INVALID_PDF_URL",
  );

  const root = fixture();
  const markdown = write(path.join(root, "notes.md"));
  assert.throws(
    () => pdfUrlToPath(pathToFileURL(markdown).href),
    (error) => error instanceof AppError && error.code === "INVALID_PDF_URL",
  );
});

test("prefers a sibling Markdown source", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".git"));
  const pdf = write(path.join(root, "output", "summary.pdf"));
  const sibling = write(path.join(root, "output", "summary.md"));
  write(path.join(root, "elsewhere", "summary.md"));

  assert.equal(findMarkdownSource(pdf, root), sibling);
});

test("finds one same-stem Markdown source recursively", () => {
  const root = fixture();
  const pdf = write(path.join(root, "build", "summary.pdf"));
  const source = write(path.join(root, "docs", "summary.md"));

  assert.equal(findMarkdownSource(pdf, root), source);
});

test("identifies a Peek source by selected text within its directory", () => {
  const root = fixture();
  const source = write(path.join(root, "summary.md"), "A uniquely useful selected passage.\n");
  write(path.join(root, "other.md"), "Unrelated material.\n");
  write(path.join(root, "ignored.txt"), "selected passage\n");

  assert.equal(findMarkdownSourceBySelection(root, "useful\nselected   passage"), source);

  write(path.join(root, "duplicate.qmd"), "Another useful selected passage.\n");
  assert.throws(
    () => findMarkdownSourceBySelection(root, "useful selected passage"),
    (error) => error instanceof AppError && error.code === "SOURCE_AMBIGUOUS",
  );
});

test("fails when recursive source resolution is missing or ambiguous", () => {
  const root = fixture();
  const pdf = write(path.join(root, "build", "summary.pdf"));

  assert.throws(
    () => findMarkdownSource(pdf, root),
    (error) => error instanceof AppError && error.code === "SOURCE_NOT_FOUND",
  );

  write(path.join(root, "one", "summary.md"));
  write(path.join(root, "two", "summary.md"));
  assert.throws(
    () => findMarkdownSource(pdf, root),
    (error) => error instanceof AppError && error.code === "SOURCE_AMBIGUOUS",
  );
});

test("normalizes Unicode ligatures and collapsed whitespace while retaining offsets", () => {
  const source = "Before. The final result is clear. After.";
  const selection = "The ﬁnal\nresult   is clear.";
  const range = findUniqueSelectionRange(source, selection);

  assert.equal(source.slice(range.start, range.end), "The final result is clear.");
  assert.equal(range.normalized, true);

  const emoji = normalizeWithOffsets("😀  x");
  assert.equal(emoji.text, "😀 x");
  assert.equal(emoji.starts.length, emoji.text.length);
});

test("detects exact and overlapping ambiguous matches", () => {
  assert.deepEqual(findUniqueSelectionRange("before target after", "target"), {
    start: 7,
    end: 13,
    normalized: false,
  });

  assert.throws(
    () => findUniqueSelectionRange("aaa", "aa"),
    (error) => error instanceof AppError && error.code === "SELECTION_AMBIGUOUS",
  );
});

test("applies configured markers atomically", () => {
  const root = fixture();
  const source = write(path.join(root, "summary.md"), "Start selected text end.\n");

  applyHighlight(source, "selected text", { open: "<mark>", close: "</mark>" });
  assert.equal(fs.readFileSync(source, "utf8"), "Start <mark>selected text</mark> end.\n");
});

test("does not double-highlight or span Markdown blocks", () => {
  const root = fixture();
  const highlighted = write(path.join(root, "highlighted.md"), "Start ==selected text== end.");
  assert.throws(
    () => applyHighlight(highlighted, "selected text", { open: "==", close: "==" }),
    (error) => error instanceof AppError && error.code === "ALREADY_HIGHLIGHTED",
  );

  const blocks = write(path.join(root, "blocks.md"), "first\n\nsecond");
  assert.throws(
    () => applyHighlight(blocks, "first\n\nsecond", { open: "==", close: "==" }),
    (error) => error instanceof AppError && error.code === "UNSUPPORTED_SELECTION",
  );
  assert.equal(fs.readFileSync(blocks, "utf8"), "first\n\nsecond");
});
