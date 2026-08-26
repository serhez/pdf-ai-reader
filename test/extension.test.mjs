import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { DEFAULT_MARKERS, NATIVE_HOST } from "../extension/config.js";
import { EXTENSION_ID, NATIVE_HOST_NAME } from "../native-host/constants.mjs";
import {
  buildLauncher,
  capturedPath,
  installationPaths,
  shellQuote,
} from "../native-host/install.mjs";

test("extension manifest has the required permissions, narrow hosts, and stable ID", () => {
  const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));
  assert.equal(manifest.name, "PDF AI Reader");
  assert.equal(manifest.action.default_title, "PDF AI Reader");
  for (const permission of ["contextMenus", "nativeMessaging", "scripting", "sidePanel", "storage"]) {
    assert.ok(manifest.permissions.includes(permission));
  }
  assert.ok(manifest.host_permissions.includes("file:///*"));
  assert.ok(manifest.host_permissions.includes("http://localhost/*"));
  assert.equal(
    manifest.host_permissions.some((pattern) => pattern.includes("https:") || pattern.includes("*://*")),
    false,
  );

  const digest = createHash("sha256")
    .update(Buffer.from(manifest.key, "base64"))
    .digest()
    .subarray(0, 16);
  const calculatedId = [...digest]
    .flatMap((byte) => [byte >> 4, byte & 15])
    .map((nibble) => String.fromCharCode(97 + nibble))
    .join("");
  assert.equal(calculatedId, EXTENSION_ID);
  assert.equal(NATIVE_HOST, NATIVE_HOST_NAME);
  assert.deepEqual(DEFAULT_MARKERS, { open: "==", close: "==" });
});

test("browser scripts and host modules pass syntax checks", () => {
  const files = [
    "extension/background.js",
    "extension/config.js",
    "extension/options.js",
    "extension/sidepanel.js",
    ...fs.readdirSync("native-host")
      .filter((name) => name.endsWith(".mjs"))
      .map((name) => path.join("native-host", name)),
  ];

  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test("Peek patches expose the source path and render highlight syntax", () => {
  const combined = fs.readFileSync("integrations/peek.nvim-project-reader.patch", "utf8");
  const markOnly = fs.readFileSync("integrations/peek.nvim-mark.patch", "utf8");

  assert.match(combined, /dataset\.peekSourcePath/u);
  assert.match(combined, /markdown-it-mark@4\.0\.0/u);
  assert.match(combined, /use\(MarkdownItMark\)/u);
  assert.match(markOnly, /markdown-it-mark@4\.0\.0/u);
});

test("installer paths and shell quoting are deterministic", () => {
  const paths = installationPaths("/tmp/test home");
  assert.deepEqual(paths.manifests, [
    {
      browser: "Google Chrome",
      directory: "/tmp/test home/Library/Application Support/Google/Chrome/NativeMessagingHosts",
      path: "/tmp/test home/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.local.project_pdf_reader.json",
    },
    {
      browser: "Arc",
      directory: "/tmp/test home/Library/Application Support/Arc/User Data/NativeMessagingHosts",
      path: "/tmp/test home/Library/Application Support/Arc/User Data/NativeMessagingHosts/com.local.project_pdf_reader.json",
    },
  ]);
  assert.equal(shellQuote("plain path"), "'plain path'");
  assert.equal(shellQuote("it's here"), "'it'\\''s here'");

  const pathValue = capturedPath("/opt/homebrew/bin/node", "/usr/bin:/opt/homebrew/bin");
  assert.equal(pathValue, "/opt/homebrew/bin:/usr/bin");
  assert.equal(
    buildLauncher({
      nodePath: "/opt/homebrew/bin/node",
      hostScript: "/tmp/repo/native-host/host.mjs",
      pathValue,
    }),
    "#!/bin/sh\nexport PATH='/opt/homebrew/bin:/usr/bin'\nexec '/opt/homebrew/bin/node' '/tmp/repo/native-host/host.mjs' \"$@\"\n",
  );
});
