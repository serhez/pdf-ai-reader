import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildAgentSpec, buildExplanationPrompt, runAgent } from "../native-host/agents.mjs";
import { AppError } from "../native-host/core.mjs";

function executable(contents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-pdf-agent-"));
  test.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, "stub-agent");
  fs.writeFileSync(target, `#!/usr/bin/env node\n${contents}\n`, { mode: 0o700 });
  fs.chmodSync(target, 0o700);
  return { root, target };
}

test("builds the agreed read-only CLI arguments", () => {
  const codex = buildAgentSpec("codex", "/project", { codex: "/bin/codex" });
  assert.equal(codex.command, "/bin/codex");
  assert.deepEqual(codex.args, [
    "exec", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check",
    "--color", "never", "--cd", "/project", "-",
  ]);

  const claude = buildAgentSpec("claude", "/project", { claude: "/bin/claude" });
  assert.deepEqual(claude.args, [
    "--print", "--no-session-persistence", "--permission-mode", "dontAsk",
    "--tools", "Read,Glob,Grep", "--output-format", "text",
  ]);
});

test("quotes the selection as untrusted material in a generic prompt", () => {
  const prompt = buildExplanationPrompt({
    projectRoot: "/project",
    pdfPath: "/project/build/notes.pdf",
    sourcePath: "/project/docs/notes.md",
    selection: "Explain this claim.",
  });

  assert.match(prompt, /context of this project/u);
  assert.match(prompt, /untrusted quoted material/u);
  assert.match(prompt, /build\/notes\.pdf/u);
  assert.match(prompt, /docs\/notes\.md/u);
});

test("labels a Peek document as a Markdown source", () => {
  const prompt = buildExplanationPrompt({
    projectRoot: "/project",
    sourcePath: "/project/docs/notes.md",
    selection: "Explain this claim.",
  });

  assert.match(prompt, /Markdown source: docs\/notes\.md/u);
  assert.doesNotMatch(prompt, /PDF:/u);
});

test("passes the prompt through stdin and returns stdout", async () => {
  const stub = executable(`
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => process.stdout.write("answer:" + input));
`);

  const answer = await runAgent("codex", "hello", stub.root, {
    commands: { codex: stub.target },
    timeoutMs: 1_000,
  });
  assert.equal(answer, "answer:hello");
});

test("maps missing commands and non-zero exits to stable errors", async () => {
  await assert.rejects(
    runAgent("codex", "hello", os.tmpdir(), {
      commands: { codex: path.join(os.tmpdir(), "definitely-not-a-command") },
      timeoutMs: 1_000,
    }),
    (error) => error instanceof AppError && error.code === "CLI_NOT_FOUND",
  );

  const failing = executable(`process.stderr.write("test failure"); process.exit(2);`);
  await assert.rejects(
    runAgent("claude", "hello", failing.root, {
      commands: { claude: failing.target },
      timeoutMs: 1_000,
    }),
    (error) => error instanceof AppError && error.code === "AGENT_FAILED" && /test failure/u.test(error.message),
  );
});

test("enforces timeout and output limits", async () => {
  const slow = executable(`process.stdin.resume(); setTimeout(() => process.stdout.write("late"), 1_000);`);
  await assert.rejects(
    runAgent("codex", "hello", slow.root, {
      commands: { codex: slow.target },
      timeoutMs: 30,
    }),
    (error) => error instanceof AppError && error.code === "AGENT_TIMEOUT",
  );

  const noisy = executable(`process.stdin.resume(); process.stdin.on("end", () => process.stdout.write("x".repeat(200)));`);
  await assert.rejects(
    runAgent("claude", "hello", noisy.root, {
      commands: { claude: noisy.target },
      timeoutMs: 1_000,
      maxOutputBytes: 50,
    }),
    (error) => error instanceof AppError && error.code === "OUTPUT_TOO_LARGE",
  );
});
