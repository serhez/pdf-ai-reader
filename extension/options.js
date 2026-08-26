import { DEFAULT_MARKERS, STORAGE_KEYS } from "./config.js";

const form = document.querySelector("#marker-form");
const openInput = document.querySelector("#marker-open");
const closeInput = document.querySelector("#marker-close");
const resetButton = document.querySelector("#reset");
const status = document.querySelector("#save-status");

const stored = await chrome.storage.local.get(STORAGE_KEYS.markers);
setInputs(stored[STORAGE_KEYS.markers] ?? DEFAULT_MARKERS);

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
