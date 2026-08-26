import { DEFAULT_MARKERS, NATIVE_HOST, STORAGE_KEYS } from "./config.js";

const elements = {
  actionTitle: document.querySelector("#action-title"),
  location: document.querySelector("#location"),
  openOptions: document.querySelector("#open-options"),
  result: document.querySelector("#result"),
  resultSection: document.querySelector("#result-section"),
  resultTitle: document.querySelector("#result-title"),
  selection: document.querySelector("#selection"),
  selectionSection: document.querySelector("#selection-section"),
  status: document.querySelector("#status"),
};

let activeRequestId = null;
let queuedRequest = null;

elements.openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "session") {
    return;
  }

  const pending = changes[STORAGE_KEYS.pendingRequest]?.newValue;
  if (pending) {
    processRequest(pending);
  }

  const lastResult = changes[STORAGE_KEYS.lastResult]?.newValue;
  if (lastResult && !activeRequestId) {
    renderCompleted(lastResult.request, lastResult.response);
  }
});

await restoreState();

async function restoreState() {
  const state = await chrome.storage.session.get([
    STORAGE_KEYS.pendingRequest,
    STORAGE_KEYS.lastResult,
  ]);

  if (state[STORAGE_KEYS.pendingRequest]) {
    await processRequest(state[STORAGE_KEYS.pendingRequest]);
    return;
  }

  const lastResult = state[STORAGE_KEYS.lastResult];
  if (lastResult) {
    renderCompleted(lastResult.request, lastResult.response);
  }
}

async function processRequest(request) {
  if (!request?.id || request.id === activeRequestId) {
    return;
  }

  if (activeRequestId) {
    queuedRequest = request;
    return;
  }

  activeRequestId = request.id;
  renderRunning(request);

  try {
    const outbound = { ...request };
    if (request.action === "highlight") {
      outbound.markers = await loadMarkers();
    }

    const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST, outbound);
    if (!response) {
      throw new Error("The native host returned no response.");
    }

    await chrome.storage.session.set({
      [STORAGE_KEYS.lastResult]: {
        request,
        response,
        completedAt: Date.now(),
      },
    });

    renderCompleted(request, response);
  } catch (error) {
    const response = {
      version: 1,
      id: request.id,
      ok: false,
      error: {
        code: "NATIVE_HOST_UNAVAILABLE",
        message: formatRuntimeError(error),
      },
    };

    await chrome.storage.session.set({
      [STORAGE_KEYS.lastResult]: { request, response, completedAt: Date.now() },
    });
    renderCompleted(request, response);
  } finally {
    const current = await chrome.storage.session.get(STORAGE_KEYS.pendingRequest);
    if (current[STORAGE_KEYS.pendingRequest]?.id === request.id) {
      await chrome.storage.session.remove(STORAGE_KEYS.pendingRequest);
    }

    activeRequestId = null;
    if (queuedRequest) {
      const next = queuedRequest;
      queuedRequest = null;
      processRequest(next);
    }
  }
}

async function loadMarkers() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.markers);
  return stored[STORAGE_KEYS.markers] ?? DEFAULT_MARKERS;
}

function renderRunning(request) {
  renderRequest(request);
  elements.status.textContent = request.action === "highlight" ? "Updating Markdown…" : `Asking ${providerName(request.provider)}…`;
  elements.status.dataset.kind = "running";
  elements.resultSection.hidden = true;
  elements.result.textContent = "";
}

function renderCompleted(request, response) {
  renderRequest(request);
  elements.resultSection.hidden = false;

  if (response.ok) {
    elements.status.textContent = "Done";
    elements.status.dataset.kind = "success";
    elements.resultTitle.textContent = request.action === "highlight" ? "Updated source" : "Explanation";
    elements.result.textContent = response.answer ?? response.message ?? "Completed.";
    if (response.sourcePath) {
      elements.location.textContent = response.sourcePath;
    }
    return;
  }

  elements.status.textContent = response.error?.code ?? "Error";
  elements.status.dataset.kind = "error";
  elements.resultTitle.textContent = "Could not complete the action";
  elements.result.textContent = response.error?.message ?? "Unknown error.";
}

function renderRequest(request) {
  elements.actionTitle.textContent = request.action === "highlight"
    ? "Highlight in Markdown"
    : `Explain with ${providerName(request.provider)}`;
  elements.selection.textContent = request.selection ?? "";
  elements.selectionSection.hidden = !request.selection;
  const location = request.sourcePath
    || displayLocation(request.pdfUrl)
    || displayLocation(request.sourceBaseUrl)
    || request.previewUrl
    || "";
  elements.location.textContent = location;
  elements.location.hidden = !location;
}

function providerName(provider) {
  return provider === "claude" ? "Claude" : "Codex";
}

function displayLocation(value) {
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(new URL(value).pathname);
  } catch {
    return value;
  }
}

function formatRuntimeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("native messaging host not found")) {
    return "Native host not installed. Run `npm run install-host`, then reload the extension.";
  }
  return message;
}
