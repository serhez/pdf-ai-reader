#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NATIVE_HOST_NAME,
  NATIVE_HOST_ORIGIN,
} from "./constants.mjs";

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.platform !== "darwin") {
    console.error("This MVP installer supports macOS only.");
    process.exitCode = 1;
  } else if (process.argv.includes("--uninstall")) {
    uninstall();
  } else {
    install();
  }
}

function install() {
  const paths = installationPaths();
  fs.mkdirSync(paths.supportDirectory, { recursive: true, mode: 0o700 });

  const launcher = buildLauncher({
    nodePath: process.execPath,
    hostScript: paths.hostScript,
    pathValue: capturedPath(process.execPath, process.env.PATH),
  });
  fs.writeFileSync(paths.launcher, launcher, { encoding: "utf8", mode: 0o700 });
  fs.chmodSync(paths.launcher, 0o700);

  const manifest = {
    name: NATIVE_HOST_NAME,
    description: "Local Markdown and agent bridge for PDF AI Reader",
    path: paths.launcher,
    type: "stdio",
    allowed_origins: [NATIVE_HOST_ORIGIN],
  };

  for (const target of paths.manifests) {
    fs.mkdirSync(target.directory, { recursive: true });
    fs.writeFileSync(target.path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  console.log(`Installed ${NATIVE_HOST_NAME}.`);
  for (const target of paths.manifests) {
    console.log(`${target.browser}: ${target.path}`);
  }
  console.log("Reload PDF AI Reader in chrome://extensions or arc://extensions if it is already open.");
}

function uninstall() {
  const paths = installationPaths();
  for (const target of paths.manifests) {
    removeIfPresent(target.path);
  }
  removeIfPresent(paths.launcher);

  try {
    fs.rmdirSync(paths.supportDirectory);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY"].includes(error?.code)) {
      throw error;
    }
  }

  console.log(`Uninstalled ${NATIVE_HOST_NAME}.`);
}

export function installationPaths(homeDirectory = os.homedir()) {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const supportDirectory = path.join(homeDirectory, "Library", "Application Support", "Project PDF Reader");
  const manifests = [
    {
      browser: "Google Chrome",
      directory: path.join(
        homeDirectory,
        "Library",
        "Application Support",
        "Google",
        "Chrome",
        "NativeMessagingHosts",
      ),
    },
    {
      browser: "Arc",
      directory: path.join(
        homeDirectory,
        "Library",
        "Application Support",
        "Arc",
        "User Data",
        "NativeMessagingHosts",
      ),
    },
  ].map((target) => ({
    ...target,
    path: path.join(target.directory, `${NATIVE_HOST_NAME}.json`),
  }));

  return {
    hostScript: path.join(scriptDirectory, "host.mjs"),
    supportDirectory,
    launcher: path.join(supportDirectory, "native-host.sh"),
    manifests,
  };
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

export function capturedPath(nodePath, currentPath = "") {
  const entries = [path.dirname(nodePath), ...currentPath.split(path.delimiter)]
    .filter(Boolean);
  return [...new Set(entries)].join(path.delimiter);
}

export function buildLauncher({ nodePath, hostScript, pathValue }) {
  return [
    "#!/bin/sh",
    `export PATH=${shellQuote(pathValue)}`,
    `exec ${shellQuote(nodePath)} ${shellQuote(hostScript)} \"$@\"`,
    "",
  ].join("\n");
}

function removeIfPresent(target) {
  try {
    fs.unlinkSync(target);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}
