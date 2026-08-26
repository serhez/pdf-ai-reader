import { STORAGE_KEYS } from "./config.js";

const MENU_ACTIONS = Object.freeze({
  highlight: {
    action: "highlight",
    title: "Highlight in Markdown",
  },
  explainCodex: {
    action: "explain",
    provider: "codex",
    title: "Explain in project with Codex",
  },
  explainClaude: {
    action: "explain",
    provider: "claude",
    title: "Explain in project with Claude",
  },
});

const SUPPORTED_DOCUMENT_PATTERNS = Object.freeze([
  "file:///*",
  "http://localhost/*",
]);

async function configureExtension() {
  await chrome.contextMenus.removeAll();

  for (const [id, item] of Object.entries(MENU_ACTIONS)) {
    chrome.contextMenus.create({
      id,
      title: item.title,
      contexts: ["selection"],
      documentUrlPatterns: SUPPORTED_DOCUMENT_PATTERNS,
    });
  }

  configureSidePanel();
}

chrome.runtime.onInstalled.addListener((details) => {
  configureExtension().catch(console.error);
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage().catch(console.error);
  }
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanel();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const menuAction = MENU_ACTIONS[info.menuItemId];
  if (!menuAction || !tab?.id) {
    return;
  }

  // Start opening the result UI from the context-menu gesture. The page also
  // watches session storage, so it is safe if it loads before this write.
  const openSurface = openResultSurface(tab.id).catch(console.error);
  createRequest(info, tab, menuAction)
    .then((request) => chrome.storage.session.set({
      [STORAGE_KEYS.pendingRequest]: request,
      [STORAGE_KEYS.lastResult]: null,
    }))
    .then(() => openSurface)
    .catch(console.error);
});

function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      // Arc does not implement Chrome's side-panel surface. Context-menu
      // actions use a popup-window fallback below.
    });
}

async function openResultSurface(tabId) {
  if (chrome.sidePanel?.open) {
    try {
      const opened = await Promise.race([
        Promise.resolve(chrome.sidePanel.open({ tabId })).then(() => true, () => false),
        delay(300).then(() => false),
      ]);

      if (opened && chrome.runtime.getContexts) {
        await delay(150);
        const contexts = await chrome.runtime.getContexts({ contextTypes: ["SIDE_PANEL"] });
        if (contexts.length > 0) {
          return;
        }
      } else if (opened) {
        return;
      }
    } catch {
      // Fall through to the browser-independent popup window.
    }
  }

  await chrome.windows.create({
    url: chrome.runtime.getURL("sidepanel.html"),
    type: "popup",
    width: 520,
    height: 720,
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createRequest(info, tab, menuAction) {
  const request = {
    version: 1,
    id: crypto.randomUUID(),
    action: menuAction.action,
    selection: info.selectionText?.trim() ?? "",
    createdAt: Date.now(),
  };

  if (menuAction.provider) {
    request.provider = menuAction.provider;
  }

  const pdfUrl = findLocalPdfUrl(info, tab);
  if (pdfUrl) {
    request.pdfUrl = pdfUrl;
    return request;
  }

  const previewUrl = findLocalPreviewUrl(info, tab);
  if (!previewUrl) {
    return request;
  }

  request.previewUrl = previewUrl;
  const peekContext = await inspectPeekPage(tab.id);
  if (peekContext?.sourcePath) {
    request.sourcePath = peekContext.sourcePath;
  }
  if (peekContext?.sourceBaseUrl) {
    request.sourceBaseUrl = peekContext.sourceBaseUrl;
  }

  return request;
}

function findLocalPdfUrl(info, tab) {
  const candidates = [info.pageUrl, tab.url, info.frameUrl];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    try {
      const url = new URL(candidate);
      if (url.protocol === "file:" && url.pathname.toLowerCase().endsWith(".pdf")) {
        return url.href;
      }
    } catch {
      // The native host will return a useful error if no candidate is valid.
    }
  }

  return "";
}

function findLocalPreviewUrl(info, tab) {
  const candidates = [info.pageUrl, tab.url, info.frameUrl];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" && url.hostname === "localhost") {
        return url.href;
      }
    } catch {
      // The native host will report a useful error if no candidate is valid.
    }
  }

  return "";
}

async function inspectPeekPage(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const url = new URL(window.location.href);
        const markdownBody = document.querySelector("#peek-markdown-body.markdown-body");
        const base = document.querySelector("base#peek-base");

        if (
          url.protocol !== "http:"
          || url.hostname !== "localhost"
          || document.title !== "Peek preview"
          || !markdownBody
          || !base
        ) {
          return null;
        }

        let sourceBaseUrl = base.getAttribute("href") ?? base.href;
        try {
          const resolvedBase = new URL(sourceBaseUrl, window.location.href);
          if (resolvedBase.protocol === "http:" && resolvedBase.hostname === "localhost") {
            sourceBaseUrl = decodeURIComponent(resolvedBase.pathname);
          }
        } catch {
          // Pass the original value to the native host for validation.
        }

        return {
          sourcePath: document.documentElement.dataset.peekSourcePath ?? "",
          sourceBaseUrl,
        };
      },
    });

    return results[0]?.result ?? null;
  } catch {
    return null;
  }
}
