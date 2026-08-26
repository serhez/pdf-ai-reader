#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateStore } from "./validate-store.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { manifest } = validateStore(projectRoot);
const outputDirectory = path.join(projectRoot, "dist");
const extensionOnly = process.argv.includes("--extension");
const hostOnly = process.argv.includes("--host");
const identityDraft = process.argv.includes("--draft");

if (extensionOnly && hostOnly) {
  throw new Error("Choose at most one of --extension or --host.");
}
if (identityDraft && !extensionOnly) {
  throw new Error("--draft must be used with --extension.");
}

fs.mkdirSync(outputDirectory, { recursive: true });

if (!hostOnly) {
  packageExtension();
}
if (!extensionOnly) {
  packageHost();
}

function packageExtension() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-ai-reader-extension-"));
  const output = path.join(
    outputDirectory,
    identityDraft ? "pdf-ai-reader-identity-draft.zip" : `pdf-ai-reader-${manifest.version}-chrome.zip`,
  );

  try {
    copyDirectoryContents(path.join(projectRoot, "extension"), temporaryDirectory);
    if (identityDraft) {
      const manifestPath = path.join(temporaryDirectory, "manifest.json");
      const draftManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      delete draftManifest.key;
      draftManifest.version = "0.0.0.1";
      fs.writeFileSync(manifestPath, `${JSON.stringify(draftManifest, null, 2)}\n`, "utf8");
    }
    fs.copyFileSync(path.join(projectRoot, "LICENSE"), path.join(temporaryDirectory, "LICENSE"));
    fs.copyFileSync(path.join(projectRoot, "PRIVACY.md"), path.join(temporaryDirectory, "PRIVACY.md"));
    createZip(temporaryDirectory, output);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(`Created ${path.relative(projectRoot, output)}`);
  if (identityDraft) {
    console.log("Upload this archive only as an unpublished draft to obtain the Store Item ID and public key.");
  }
}

function packageHost() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-ai-reader-host-"));
  const packageName = `pdf-ai-reader-host-${manifest.version}-macos`;
  const packageDirectory = path.join(temporaryDirectory, packageName);
  const output = path.join(outputDirectory, `${packageName}.zip`);

  try {
    fs.mkdirSync(packageDirectory);
    fs.cpSync(path.join(projectRoot, "native-host"), path.join(packageDirectory, "native-host"), { recursive: true });
    fs.copyFileSync(path.join(projectRoot, "LICENSE"), path.join(packageDirectory, "LICENSE"));
    fs.copyFileSync(path.join(projectRoot, "store", "HOST_README.md"), path.join(packageDirectory, "README.md"));
    fs.writeFileSync(
      path.join(packageDirectory, "package.json"),
      `${JSON.stringify({
        name: "pdf-ai-reader-host",
        version: manifest.version,
        private: true,
        type: "module",
        scripts: {
          "install-host": "node native-host/install.mjs",
          "uninstall-host": "node native-host/install.mjs --uninstall",
        },
        engines: { node: ">=18" },
      }, null, 2)}\n`,
      "utf8",
    );
    createZip(temporaryDirectory, output);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(`Created ${path.relative(projectRoot, output)}`);
}

function copyDirectoryContents(source, destination) {
  for (const entry of fs.readdirSync(source)) {
    fs.cpSync(path.join(source, entry), path.join(destination, entry), { recursive: true });
  }
}

function createZip(workingDirectory, output) {
  fs.rmSync(output, { force: true });
  const entries = normalizedArchiveEntries(workingDirectory);
  const result = spawnSync("zip", ["-X", "-q", output, ...entries], {
    cwd: workingDirectory,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "zip failed");
  }
}

function normalizedArchiveEntries(root) {
  const timestamp = new Date("2000-01-01T00:00:00.000Z");
  const files = [];

  function visit(relativeDirectory) {
    const directory = path.join(root, relativeDirectory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relativePath = path.join(relativeDirectory, entry.name);
      const absolutePath = path.join(root, relativePath);
      if (entry.isDirectory()) {
        visit(relativePath);
      } else if (entry.isFile()) {
        fs.utimesSync(absolutePath, timestamp, timestamp);
        files.push(relativePath);
      } else {
        throw new Error(`Refusing to package non-regular file: ${relativePath}`);
      }
    }
  }

  visit("");
  return files;
}
