import path from "node:path";
import {
  applyHighlight,
  AppError,
  findMarkdownSource,
  findMarkdownSourceBySelection,
  findProjectRoot,
  markdownSourceToPath,
  pdfUrlToPath,
  sourceBaseUrlToDirectory,
  validateMarkers,
} from "./core.mjs";
import { buildExplanationPrompt, runAgent } from "./agents.mjs";
import { MAX_SELECTION_LENGTH } from "./constants.mjs";

export async function handleRequest(request, dependencies = {}) {
  validateRequest(request);

  const context = resolveDocumentContext(request);
  const { pdfPath, projectRoot } = context;

  if (request.action === "highlight") {
    validateMarkers(request.markers);
    const sourcePath = resolveSourcePath(context, request.selection);
    applyHighlight(sourcePath, request.selection, request.markers);
    return {
      version: 1,
      id: request.id,
      ok: true,
      projectRoot,
      sourcePath,
      message: `Highlight added to ${sourcePath}.`,
    };
  }

  let sourcePath;
  try {
    sourcePath = resolveSourcePath(context, request.selection);
  } catch (error) {
    if (!(error instanceof AppError) || !["SOURCE_NOT_FOUND", "SOURCE_AMBIGUOUS"].includes(error.code)) {
      throw error;
    }
  }

  const prompt = buildExplanationPrompt({
    projectRoot,
    pdfPath,
    sourcePath,
    selection: request.selection,
  });
  const agentRunner = dependencies.runAgent ?? runAgent;
  const answer = await agentRunner(request.provider, prompt, projectRoot);

  return {
    version: 1,
    id: request.id,
    ok: true,
    projectRoot,
    ...(sourcePath ? { sourcePath } : {}),
    answer,
  };
}

function resolveDocumentContext(request) {
  if (request.pdfUrl) {
    const pdfPath = pdfUrlToPath(request.pdfUrl);
    return {
      kind: "pdf",
      pdfPath,
      projectRoot: findProjectRoot(pdfPath),
    };
  }

  validatePreviewUrl(request.previewUrl);

  let sourceDirectory;
  if (request.sourceBaseUrl) {
    sourceDirectory = sourceBaseUrlToDirectory(request.sourceBaseUrl);
  }

  let sourcePath;
  if (request.sourcePath) {
    sourcePath = markdownSourceToPath(request.sourcePath);
    if (sourceDirectory && path.dirname(sourcePath) !== sourceDirectory) {
      throw new AppError(
        "SOURCE_OUTSIDE_PREVIEW",
        "Peek's source path is outside the directory exposed by the preview.",
      );
    }
  }

  if (!sourcePath && !sourceDirectory) {
    throw new AppError(
      "PREVIEW_NOT_RECOGNIZED",
      "This localhost page is not a recognized Peek preview. Reload Peek and try again.",
    );
  }

  const projectAnchor = sourcePath ?? sourceDirectory;
  return {
    kind: "peek",
    projectRoot: findProjectRoot(projectAnchor),
    sourceDirectory,
    sourcePath,
  };
}

function resolveSourcePath(context, selection) {
  if (context.sourcePath) {
    return context.sourcePath;
  }
  if (context.kind === "pdf") {
    return findMarkdownSource(context.pdfPath, context.projectRoot);
  }
  return findMarkdownSourceBySelection(context.sourceDirectory, selection);
}

function validatePreviewUrl(previewUrl) {
  let url;
  try {
    url = new URL(previewUrl);
  } catch {
    throw new AppError("INVALID_PREVIEW_URL", "Chrome did not expose a valid Peek preview URL.");
  }

  if (url.protocol !== "http:" || url.hostname !== "localhost") {
    throw new AppError("INVALID_PREVIEW_URL", "Only HTTP previews hosted on localhost are supported.");
  }
}

export function validateRequest(request) {
  if (!request || typeof request !== "object" || request.version !== 1) {
    throw new AppError("INVALID_REQUEST", "Unsupported or missing request version.");
  }
  if (typeof request.id !== "string" || request.id.length === 0 || request.id.length > 200) {
    throw new AppError("INVALID_REQUEST", "Request ID is missing or invalid.");
  }
  if (!new Set(["highlight", "explain"]).has(request.action)) {
    throw new AppError("INVALID_REQUEST", "Action must be highlight or explain.");
  }
  const hasPdf = typeof request.pdfUrl === "string" && request.pdfUrl.length > 0;
  const hasPreview = typeof request.previewUrl === "string" && request.previewUrl.length > 0;
  if (hasPdf === hasPreview) {
    throw new AppError(
      "INVALID_DOCUMENT_URL",
      "Chrome did not expose exactly one supported local document URL.",
    );
  }
  if (typeof request.selection !== "string" || request.selection.trim().length === 0) {
    throw new AppError("INVALID_REQUEST", "Select some text in the document first.");
  }
  if (request.selection.length > MAX_SELECTION_LENGTH) {
    throw new AppError("INVALID_REQUEST", `Selections are limited to ${MAX_SELECTION_LENGTH.toLocaleString()} characters.`);
  }
  if (request.action === "explain" && !new Set(["codex", "claude"]).has(request.provider)) {
    throw new AppError("INVALID_PROVIDER", "Provider must be codex or claude.");
  }
}

export function errorResponse(error, id = null) {
  const appError = error instanceof AppError
    ? error
    : new AppError("INTERNAL_ERROR", "The native host encountered an unexpected error.");

  return {
    version: 1,
    id,
    ok: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
    },
  };
}
