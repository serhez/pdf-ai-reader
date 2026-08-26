export const NATIVE_HOST = "com.local.project_pdf_reader";

export const AI_CONSENT_VERSION = 1;

export const PROJECT_URLS = Object.freeze({
  companion: "https://github.com/serhez/pdf-ai-reader/releases/latest",
  privacy: "https://github.com/serhez/pdf-ai-reader/blob/main/PRIVACY.md",
  support: "https://github.com/serhez/pdf-ai-reader/issues",
});

export const DEFAULT_MARKERS = Object.freeze({
  open: "==",
  close: "==",
});

export const STORAGE_KEYS = Object.freeze({
  aiDataConsent: "aiDataConsentV1",
  markers: "highlightMarkers",
  pendingRequest: "pendingRequest",
  lastResult: "lastResult",
});
