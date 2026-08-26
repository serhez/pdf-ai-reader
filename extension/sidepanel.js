import {
  AI_CONSENT_VERSION,
  DEFAULT_MARKERS,
  NATIVE_HOST,
  PROJECT_URLS,
  STORAGE_KEYS,
} from "./config.js";

const elements = {
  actionTitle: document.querySelector("#action-title"),
  aiConsentDialog: document.querySelector("#ai-consent-dialog"),
  aiProvider: document.querySelector("#ai-provider"),
  hostInstallLink: document.querySelector("#host-install-link"),
  location: document.querySelector("#location"),
  openOptions: document.querySelector("#open-options"),
  result: document.querySelector("#result"),
  resultSection: document.querySelector("#result-section"),
  resultTitle: document.querySelector("#result-title"),
  selection: document.querySelector("#selection"),
  selectionSection: document.querySelector("#selection-section"),
  status: document.querySelector("#status"),
};

elements.hostInstallLink.href = PROJECT_URLS.companion;

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

  try {
    if (request.action === "explain") {
      renderAwaitingConsent(request);
      await ensureAiDataConsent(request.provider);
    }

    renderRunning(request);
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
        code: error instanceof UiError ? error.code : "NATIVE_HOST_UNAVAILABLE",
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

async function ensureAiDataConsent(provider) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.aiDataConsent);
  const existingConsent = stored[STORAGE_KEYS.aiDataConsent];
  if (
    existingConsent?.version === AI_CONSENT_VERSION
    && existingConsent.providers?.[provider]
  ) {
    return;
  }

  const providerLabel = provider === "claude" ? "Claude (Anthropic)" : "Codex (OpenAI)";
  elements.aiProvider.textContent = providerLabel;
  elements.aiConsentDialog.returnValue = "";
  elements.aiConsentDialog.showModal();

  const accepted = await new Promise((resolve) => {
    elements.aiConsentDialog.addEventListener("close", () => {
      resolve(elements.aiConsentDialog.returnValue === "accept");
    }, { once: true });
  });

  if (!accepted) {
    throw new UiError("AI_DATA_CONSENT_REQUIRED", "AI explanation was not sent. You can continue using local highlights without AI data sharing.");
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.aiDataConsent]: {
      version: AI_CONSENT_VERSION,
      providers: {
        ...(existingConsent?.version === AI_CONSENT_VERSION ? existingConsent.providers : {}),
        [provider]: new Date().toISOString(),
      },
    },
  });
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
  elements.hostInstallLink.hidden = true;
}

function renderAwaitingConsent(request) {
  renderRequest(request);
  elements.status.textContent = "Waiting for confirmation";
  elements.status.dataset.kind = "running";
  elements.resultSection.hidden = true;
  elements.result.textContent = "";
  elements.hostInstallLink.hidden = true;
}

function renderCompleted(request, response) {
  renderRequest(request);
  elements.resultSection.hidden = false;
  elements.hostInstallLink.hidden = true;

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
  elements.hostInstallLink.hidden = response.error?.code !== "NATIVE_HOST_UNAVAILABLE";
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
    return "The PDF AI Reader companion is not installed. Install it, then reload the extension.";
  }
  return message;
}

class UiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
