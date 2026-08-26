import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { encodeNativeMessage, readNativeMessage } from "../native-host/protocol.mjs";
import { AppError } from "../native-host/core.mjs";

test("encodes and reads a chunked native message", async () => {
  const message = { version: 1, id: "abc", selection: "hello" };
  const encoded = encodeNativeMessage(message);
  const chunks = [encoded.subarray(0, 2), encoded.subarray(2, 7), encoded.subarray(7)];
  assert.deepEqual(await readNativeMessage(Readable.from(chunks)), message);
});

test("rejects malformed and oversized messages", async () => {
  const invalidJson = Buffer.concat([Buffer.from([1, 0, 0, 0]), Buffer.from("{")]);
  await assert.rejects(
    readNativeMessage(Readable.from([invalidJson])),
    (error) => error instanceof AppError && error.code === "PROTOCOL_ERROR",
  );
  assert.throws(
    () => encodeNativeMessage({ large: "x".repeat(100) }, 20),
    (error) => error instanceof AppError && error.code === "OUTPUT_TOO_LARGE",
  );
});

test("runs an end-to-end highlight through the native host protocol", () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "project-pdf-protocol-")));
  test.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".git"));
  const pdf = path.join(root, "document.pdf");
  const source = path.join(root, "document.md");
  fs.writeFileSync(pdf, "pdf fixture");
  fs.writeFileSync(source, "Protocol selected text.\n");

  const request = {
    version: 1,
    id: "protocol-request",
    action: "highlight",
    pdfUrl: pathToFileURL(pdf).href,
    selection: "selected text",
    markers: { open: "==", close: "==" },
  };
  const host = path.resolve("native-host/host.mjs");
  const result = spawnSync(process.execPath, [host], {
    cwd: path.resolve("."),
    input: encodeNativeMessage(request),
    maxBuffer: 1024 * 1024,
  });

  assert.equal(result.status, 0, result.stderr.toString("utf8"));
  const length = result.stdout.readUInt32LE(0);
  const response = JSON.parse(result.stdout.subarray(4, length + 4).toString("utf8"));
  assert.equal(response.ok, true);
  assert.equal(response.sourcePath, source);
  assert.equal(fs.readFileSync(source, "utf8"), "Protocol ==selected text==.\n");
});
