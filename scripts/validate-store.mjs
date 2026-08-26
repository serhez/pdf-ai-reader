#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function validateStore(root = projectRoot) {
  const extensionDirectory = path.join(root, "extension");
  const manifest = readJson(path.join(extensionDirectory, "manifest.json"));

  assert.equal(manifest.manifest_version, 3, "Chrome Web Store submissions must use Manifest V3");
  assert.equal(manifest.name, "PDF AI Reader");
  assert.ok(manifest.version, "manifest.version is required");
  assert.ok(manifest.description?.length > 0 && manifest.description.length <= 132, "manifest.description must contain 1–132 characters");
  assert.match(manifest.homepage_url ?? "", /^https:\/\//u, "manifest.homepage_url must use HTTPS");
  assert.deepEqual(manifest.host_permissions, ["file:///*", "http://localhost/*"]);

  const expectedIcons = { 16: 16, 32: 32, 48: 48, 128: 128 };
  for (const [key, expectedSize] of Object.entries(expectedIcons)) {
    const iconPath = manifest.icons?.[key];
    assert.ok(iconPath, `manifest.icons.${key} is required`);
    const dimensions = pngDimensions(path.join(extensionDirectory, iconPath));
    assert.deepEqual(dimensions, { width: expectedSize, height: expectedSize }, `${iconPath} must be ${expectedSize}×${expectedSize}`);
  }

  for (const [key, iconPath] of Object.entries(manifest.action?.default_icon ?? {})) {
    assert.ok(fs.existsSync(path.join(extensionDirectory, iconPath)), `action icon ${key} is missing`);
  }

  assert.deepEqual(
    pngDimensions(path.join(root, "store", "assets", "small-promo-440x280.png")),
    { width: 440, height: 280 },
    "the required small promotional image must be 440×280",
  );

  const calculatedId = extensionIdFromKey(manifest.key);
  const constants = fs.readFileSync(path.join(root, "native-host", "constants.mjs"), "utf8");
  const configuredId = constants.match(/EXTENSION_ID\s*=\s*"([a-p]{32})"/u)?.[1];
  assert.equal(configuredId, calculatedId, "native-host EXTENSION_ID must match manifest.key");

  const packagedFiles = [
    "PRIVACY.md",
    "store/listing.md",
    "store/reviewer-instructions.md",
    "store/HOST_README.md",
  ];
  for (const relativePath of packagedFiles) {
    assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} is required`);
  }

  const privacy = fs.readFileSync(path.join(root, "PRIVACY.md"), "utf8");
  assert.match(privacy, /Chrome Web Store User Data Policy/u);
  assert.match(privacy, /OpenAI/u);
  assert.match(privacy, /Anthropic/u);

  for (const htmlName of ["options.html", "privacy.html", "sidepanel.html"]) {
    const html = fs.readFileSync(path.join(extensionDirectory, htmlName), "utf8");
    assert.doesNotMatch(html, /<script[^>]+src=["']https?:/iu, `${htmlName} must not load remote code`);
  }

  return { extensionId: calculatedId, manifest };
}

export function extensionIdFromKey(key) {
  assert.ok(typeof key === "string" && key.length > 0, "manifest.key is required until the Store item ID is finalized");
  const digest = createHash("sha256")
    .update(Buffer.from(key, "base64"))
    .digest()
    .subarray(0, 16);
  return [...digest]
    .flatMap((byte) => [byte >> 4, byte & 15])
    .map((nibble) => String.fromCharCode(97 + nibble))
    .join("");
}

function pngDimensions(filePath) {
  const data = fs.readFileSync(filePath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(data.subarray(0, 8).equals(signature), `${filePath} is not a PNG`);
  assert.equal(data.subarray(12, 16).toString("ascii"), "IHDR", `${filePath} has no PNG IHDR`);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = validateStore();
  console.log(`Store validation passed for PDF AI Reader ${result.manifest.version} (${result.extensionId}).`);
}
