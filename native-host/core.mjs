import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const EXCLUDED_SEARCH_DIRECTORIES = new Set([".git", "node_modules"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".qmd"]);

export class AppError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export function pdfUrlToPath(pdfUrl) {
  let url;
  try {
    url = new URL(pdfUrl);
  } catch {
    throw new AppError("INVALID_PDF_URL", "The selected document does not have a valid local file URL.");
  }

  if (url.protocol !== "file:") {
    throw new AppError("INVALID_PDF_URL", "Only local file:// PDF documents are supported.");
  }

  let candidate;
  try {
    candidate = fileURLToPath(url);
  } catch {
    throw new AppError("INVALID_PDF_URL", "Chrome did not provide a usable local PDF path.");
  }

  let resolved;
  try {
    resolved = fs.realpathSync.native(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new AppError("PDF_NOT_FOUND", `PDF not found: ${candidate}`);
    }
    throw error;
  }

  if (path.extname(resolved).toLowerCase() !== ".pdf" || !fs.statSync(resolved).isFile()) {
    throw new AppError("INVALID_PDF_URL", "The selected local file is not a PDF.");
  }

  return resolved;
}

export function markdownSourceToPath(sourcePath) {
  if (typeof sourcePath !== "string" || sourcePath.length === 0 || sourcePath.includes("\0")) {
    throw new AppError("INVALID_SOURCE_PATH", "Peek did not expose a usable Markdown source path.");
  }

  let candidate = sourcePath;
  if (sourcePath.startsWith("file:")) {
    try {
      candidate = fileURLToPath(new URL(sourcePath));
    } catch {
      throw new AppError("INVALID_SOURCE_PATH", "Peek exposed an invalid Markdown file URL.");
    }
  }

  if (!path.isAbsolute(candidate)) {
    throw new AppError("INVALID_SOURCE_PATH", "Peek exposed a non-absolute Markdown source path.");
  }

  let resolved;
  try {
    resolved = fs.realpathSync.native(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new AppError("SOURCE_NOT_FOUND", `Markdown source not found: ${candidate}`);
    }
    throw error;
  }

  if (!isMarkdownFile(resolved) || !fs.statSync(resolved).isFile()) {
    throw new AppError("INVALID_SOURCE_PATH", "Peek's source is not a supported Markdown file.");
  }

  return resolved;
}

export function sourceBaseUrlToDirectory(sourceBaseUrl) {
  let candidate;
  if (typeof sourceBaseUrl === "string" && path.isAbsolute(sourceBaseUrl)) {
    candidate = sourceBaseUrl;
  } else {
    let url;
    try {
      url = new URL(sourceBaseUrl);
    } catch {
      throw new AppError("INVALID_SOURCE_PATH", "Peek did not expose a valid source-directory URL.");
    }

    if (url.protocol !== "file:") {
      throw new AppError("INVALID_SOURCE_PATH", "Peek's source directory must be a local path or file URL.");
    }

    try {
      candidate = fileURLToPath(url);
    } catch {
      throw new AppError("INVALID_SOURCE_PATH", "Peek did not expose a usable source directory.");
    }
  }

  let resolved;
  try {
    resolved = fs.realpathSync.native(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new AppError("SOURCE_NOT_FOUND", `Peek source directory not found: ${candidate}`);
    }
    throw error;
  }

  if (!fs.statSync(resolved).isDirectory()) {
    throw new AppError("INVALID_SOURCE_PATH", "Peek's source-directory URL is not a directory.");
  }

  return resolved;
}

export function findProjectRoot(documentPath) {
  const canonicalDocumentPath = fs.realpathSync.native(documentPath);
  const fallback = fs.statSync(canonicalDocumentPath).isDirectory()
    ? canonicalDocumentPath
    : path.dirname(canonicalDocumentPath);
  let current = fallback;

  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return fallback;
    }
    current = parent;
  }
}

export function findMarkdownSourceBySelection(sourceDirectory, selection) {
  const canonicalDirectory = fs.realpathSync.native(sourceDirectory);
  if (!fs.statSync(canonicalDirectory).isDirectory()) {
    throw new AppError("INVALID_SOURCE_PATH", "Peek's source location is not a directory.");
  }

  const candidates = fs.readdirSync(canonicalDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isMarkdownFile(entry.name))
    .map((entry) => path.join(canonicalDirectory, entry.name))
    .sort((left, right) => left.localeCompare(right));

  const matches = [];
  for (const candidate of candidates) {
    const contents = fs.readFileSync(candidate, "utf8");
    try {
      findUniqueSelectionRange(contents, selection);
      matches.push(candidate);
    } catch (error) {
      if (error instanceof AppError && error.code === "SELECTION_AMBIGUOUS") {
        matches.push(candidate);
        continue;
      }
      if (error instanceof AppError && error.code === "SELECTION_NOT_FOUND") {
        continue;
      }
      throw error;
    }
  }

  if (matches.length === 0) {
    throw new AppError(
      "SOURCE_NOT_FOUND",
      `Could not identify the Peek source from Markdown files in ${canonicalDirectory}.`,
    );
  }

  if (matches.length > 1) {
    throw new AppError(
      "SOURCE_AMBIGUOUS",
      "The selected text matches multiple Markdown files in Peek's source directory; no file was changed.",
      { candidates: matches.map((candidate) => path.basename(candidate)) },
    );
  }

  return matches[0];
}

export function findMarkdownSource(pdfPath, projectRoot) {
  const canonicalPdfPath = fs.realpathSync.native(pdfPath);
  const canonicalProjectRoot = fs.realpathSync.native(projectRoot);
  const sourceName = `${path.basename(canonicalPdfPath, path.extname(canonicalPdfPath))}.md`;
  const sibling = path.join(path.dirname(canonicalPdfPath), sourceName);

  if (isRegularFile(sibling)) {
    return assertPathInside(fs.realpathSync.native(sibling), canonicalProjectRoot);
  }

  const candidates = [];
  const pending = [canonicalProjectRoot];

  while (pending.length > 0) {
    const directory = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_SEARCH_DIRECTORIES.has(entry.name)) {
          pending.push(path.join(directory, entry.name));
        }
        continue;
      }

      if (entry.isFile() && entry.name === sourceName) {
        candidates.push(path.join(directory, entry.name));
      }
    }
  }

  if (candidates.length === 0) {
    throw new AppError(
      "SOURCE_NOT_FOUND",
      `Could not find ${sourceName} beside the PDF or under ${canonicalProjectRoot}.`,
    );
  }

  if (candidates.length > 1) {
    throw new AppError(
      "SOURCE_AMBIGUOUS",
      `Found multiple Markdown sources named ${sourceName}; no file was changed.`,
      { candidates: candidates.map((candidate) => path.relative(canonicalProjectRoot, candidate)) },
    );
  }

  return assertPathInside(fs.realpathSync.native(candidates[0]), canonicalProjectRoot);
}

export function applyHighlight(sourcePath, selection, markers) {
  validateMarkers(markers);

  const before = fs.statSync(sourcePath, { bigint: true });
  const source = fs.readFileSync(sourcePath, "utf8");
  const range = findUniqueSelectionRange(source, selection);
  const selectedSource = source.slice(range.start, range.end);

  if (/\r?\n[\t ]*\r?\n/u.test(selectedSource)) {
    throw new AppError(
      "UNSUPPORTED_SELECTION",
      "Selections spanning multiple Markdown blocks are not supported.",
    );
  }

  const alreadyOpen = source.slice(Math.max(0, range.start - markers.open.length), range.start);
  const alreadyClose = source.slice(range.end, range.end + markers.close.length);
  if (alreadyOpen === markers.open && alreadyClose === markers.close) {
    throw new AppError("ALREADY_HIGHLIGHTED", "That source text is already highlighted.");
  }

  const updated = `${source.slice(0, range.start)}${markers.open}${selectedSource}${markers.close}${source.slice(range.end)}`;
  const current = fs.statSync(sourcePath, { bigint: true });

  if (before.mtimeNs !== current.mtimeNs || before.size !== current.size || before.ino !== current.ino) {
    throw new AppError(
      "WRITE_CONFLICT",
      "The Markdown file changed while the selection was being resolved; try again.",
    );
  }

  atomicReplace(sourcePath, updated, Number(before.mode & 0o777n));
  return { start: range.start, end: range.end };
}

export function findUniqueSelectionRange(source, selection) {
  if (typeof selection !== "string" || selection.trim().length === 0) {
    throw new AppError("INVALID_REQUEST", "Select some text in the document first.");
  }

  const trimmedSelection = selection.trim();
  const exactMatches = findAllMatches(source, trimmedSelection);
  if (exactMatches.length === 1) {
    return {
      start: exactMatches[0],
      end: exactMatches[0] + trimmedSelection.length,
      normalized: false,
    };
  }
  if (exactMatches.length > 1) {
    throw ambiguousSelection(exactMatches.length);
  }

  const normalizedSource = normalizeWithOffsets(source);
  const normalizedSelection = normalizeWithOffsets(trimmedSelection).text;
  if (!normalizedSelection) {
    throw new AppError("INVALID_REQUEST", "Select some text in the document first.");
  }

  const normalizedMatches = findAllMatches(normalizedSource.text, normalizedSelection);
  if (normalizedMatches.length === 0) {
    throw new AppError(
      "SELECTION_NOT_FOUND",
      "The selected text was not found in the inferred Markdown source after Unicode and whitespace normalization.",
    );
  }
  if (normalizedMatches.length > 1) {
    throw ambiguousSelection(normalizedMatches.length);
  }

  const normalizedStart = normalizedMatches[0];
  const normalizedEnd = normalizedStart + normalizedSelection.length - 1;
  return {
    start: normalizedSource.starts[normalizedStart],
    end: normalizedSource.ends[normalizedEnd],
    normalized: true,
  };
}

export function normalizeWithOffsets(value) {
  let text = "";
  const starts = [];
  const ends = [];

  for (let sourceOffset = 0; sourceOffset < value.length;) {
    const codePoint = value.codePointAt(sourceOffset);
    const originalCharacter = String.fromCodePoint(codePoint);
    const sourceEnd = sourceOffset + originalCharacter.length;
    const normalizedPiece = originalCharacter.normalize("NFKC");

    for (const normalizedCharacter of normalizedPiece) {
      if (/\s/u.test(normalizedCharacter)) {
        if (text.length > 0 && text[text.length - 1] !== " ") {
          text += " ";
          starts.push(sourceOffset);
          ends.push(sourceEnd);
        } else if (text.endsWith(" ")) {
          ends[ends.length - 1] = sourceEnd;
        }
        continue;
      }

      text += normalizedCharacter;
      for (let unit = 0; unit < normalizedCharacter.length; unit += 1) {
        starts.push(sourceOffset);
        ends.push(sourceEnd);
      }
    }

    sourceOffset = sourceEnd;
  }

  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    starts.pop();
    ends.pop();
  }

  return { text, starts, ends };
}

export function validateMarkers(markers) {
  if (!markers || typeof markers !== "object") {
    throw new AppError("INVALID_MARKERS", "Highlight markers are missing.");
  }

  for (const [name, value] of Object.entries({ open: markers.open, close: markers.close })) {
    if (typeof value !== "string" || value.length === 0 || value.length > 32 || /[\r\n\0]/u.test(value)) {
      throw new AppError(
        "INVALID_MARKERS",
        `${name === "open" ? "Opening" : "Closing"} marker must contain 1–32 characters and no line breaks.`,
      );
    }
  }
}

function findAllMatches(value, needle) {
  const matches = [];
  let offset = 0;

  while (offset <= value.length - needle.length) {
    const match = value.indexOf(needle, offset);
    if (match === -1) {
      break;
    }
    matches.push(match);
    offset = match + 1;
  }

  return matches;
}

function ambiguousSelection(count) {
  return new AppError(
    "SELECTION_AMBIGUOUS",
    `The selected text occurs ${count} times in the Markdown source; no file was changed.`,
    { count },
  );
}

function atomicReplace(filePath, contents, mode) {
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.pdf-reader-${process.pid}-${randomUUID()}.tmp`,
  );

  try {
    fs.writeFileSync(temporary, contents, { encoding: "utf8", mode });
    fs.renameSync(temporary, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {
      // Nothing to clean up.
    }
    throw error;
  }
}

function isRegularFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isMarkdownFile(candidate) {
  return MARKDOWN_EXTENSIONS.has(path.extname(candidate).toLowerCase());
}

function assertPathInside(candidate, root) {
  const relative = path.relative(root, candidate);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return candidate;
  }
  throw new AppError("SOURCE_OUTSIDE_PROJECT", "The inferred Markdown source resolves outside the project root.");
}
