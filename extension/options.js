import {
  AI_CONSENT_VERSION,
  DEFAULT_MARKERS,
  PROJECT_URLS,
  STORAGE_KEYS,
} from "./config.js";

const companionLink = document.querySelector("#companion-link");
const consentStatus = document.querySelector("#consent-status");
const form = document.querySelector("#marker-form");
const openInput = document.querySelector("#marker-open");
const closeInput = document.querySelector("#marker-close");
const resetButton = document.querySelector("#reset");
const resetConsentButton = document.querySelector("#reset-ai-consent");
const status = document.querySelector("#save-status");
const supportLink = document.querySelector("#support-link");

companionLink.href = PROJECT_URLS.companion;
supportLink.href = PROJECT_URLS.support;

const stored = await chrome.storage.local.get(STORAGE_KEYS.markers);
setInputs(stored[STORAGE_KEYS.markers] ?? DEFAULT_MARKERS);
await renderConsentStatus();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const markers = {
    open: openInput.value,
    close: closeInput.value,
  };

  const error = validateMarkers(markers);
  if (error) {
    status.textContent = error;
    status.dataset.kind = "error";
    return;
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.markers]: markers });
  status.textContent = "Saved.";
  status.dataset.kind = "success";
});

resetButton.addEventListener("click", async () => {
  setInputs(DEFAULT_MARKERS);
  await chrome.storage.local.set({ [STORAGE_KEYS.markers]: DEFAULT_MARKERS });
  status.textContent = "Reset to ==.";
  status.dataset.kind = "success";
});

resetConsentButton.addEventListener("click", async () => {
  await chrome.storage.local.remove(STORAGE_KEYS.aiDataConsent);
  await renderConsentStatus();
});

async function renderConsentStatus() {
  const value = await chrome.storage.local.get(STORAGE_KEYS.aiDataConsent);
  const consent = value[STORAGE_KEYS.aiDataConsent];
  const acceptedProviders = consent?.version === AI_CONSENT_VERSION
    ? Object.keys(consent.providers ?? {}).filter((provider) => ["codex", "claude"].includes(provider))
    : [];
  const providerNames = acceptedProviders.map((provider) => provider === "claude" ? "Claude" : "Codex");
  consentStatus.textContent = providerNames.length > 0
    ? `AI disclosure accepted for ${providerNames.join(" and ")}. You can revoke ${providerNames.length === 1 ? "this choice" : "these choices"} below.`
    : "You will be asked separately before Codex or Claude sends any content.";
  consentStatus.dataset.kind = providerNames.length > 0 ? "success" : "neutral";
  resetConsentButton.disabled = providerNames.length === 0;
}

function setInputs(markers) {
  openInput.value = markers.open;
  closeInput.value = markers.close;
}

function validateMarkers(markers) {
  for (const [name, value] of Object.entries(markers)) {
    if (!value) {
      return `${name === "open" ? "Opening" : "Closing"} marker cannot be empty.`;
    }
    if (value.length > 32) {
      return "Markers must be 32 characters or fewer.";
    }
    if (/[\r\n\0]/u.test(value)) {
      return "Markers cannot contain line breaks or null characters.";
    }
  }
  return null;
}
