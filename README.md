# PDF AI Reader

A small personal Chromium extension for local PDFs and localhost [Peek](https://github.com/toppair/peek.nvim) Markdown previews. Select rendered text and use the context menu to:

- add highlight markers around the matching text in the associated Markdown source;
- explain the selection in project context with Codex; or
- explain the selection in project context with Claude.

The extension talks to a local Node process through Chrome Native Messaging. It does not store API keys or send model requests itself.

## Requirements

- macOS and Google Chrome 116 or newer, or Arc
- Node.js 18 or newer
- Codex CLI and/or Claude Code, already authenticated

## Browser support

| Browser | Supported version | Result UI | Native-host registration |
| --- | --- | --- | --- |
| Google Chrome | 116+ | Chrome side panel | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` |
| Arc | 1.160.0+ | Popup window | `~/Library/Application Support/Arc/User Data/NativeMessagingHosts/` |

Only macOS is currently supported. Other Chrome-based browsers are unsupported until their extension UI and native-messaging integration are verified.

A PR adding another Chrome-based browser must include:

- the browser name, operating system, and minimum version tested;
- its user-level `NativeMessagingHosts` directory, with an authoritative reference or reproducible verification;
- installer and uninstaller support in `native-host/install.mjs`, plus path assertions in `test/extension.test.mjs`;
- its extension-management URL and any browser-specific loading instructions;
- verification of whether `chrome.sidePanel` works, using the existing popup fallback when it does not; and
- manual verification of a localhost Peek highlight and at least one native-agent action.

Browser-support PRs must not broaden the extension beyond `file://` and the exact `http://localhost/*` permission without a separate security discussion.

## Install

1. Open `chrome://extensions` in Chrome or `arc://extensions` in Arc, enable **Developer mode**, and choose **Load unpacked**.
2. Select the `extension` directory in this repository.
3. Open the extension's details and enable **Allow access to file URLs** for PDF support. Localhost access is declared separately and does not grant access to internet sites.
4. From this repository, register the native host:

   ```sh
   npm run install-host
   ```

5. Reload the extension from the browser's extensions page.

The host installer registers both Google Chrome and Arc. The unpacked extension has the stable ID `ghljkecfobmdbdhgijffhaehplamigle`. Moving this repository requires running `npm run install-host` again because the native-host launcher records its absolute path.

## Use

Open a local PDF or a Peek preview at `http://localhost:<port>`, select text, and right-click. The extension contributes these actions:

- **Highlight in Markdown**
- **Explain in project with Codex**
- **Explain in project with Claude**

Peek must open the preview in the same browser where the extension is loaded. Arc does not provide Chrome's side-panel surface, so context-menu actions open the same result UI in a small popup window instead.

The project root is the nearest ancestor of the source document containing `.git`; if none exists, it is the document's directory. For `foo.pdf`, highlighting first looks for a sibling `foo.md`, then for exactly one `foo.md` anywhere under the project root. Missing or ambiguous sources are reported without changing a file.

Unmodified Peek exposes the active source directory, but not its filename. The extension therefore finds the source by matching the selection against `.md`, `.markdown`, and `.qmd` files directly in that directory. It changes a file only when exactly one source matches.

Highlight matching tries an exact match first, then Unicode NFKC plus collapsed-whitespace matching. It only edits a unique match and does not support selections spanning blank-line-separated Markdown blocks. The source file is updated atomically; rebuilding or refreshing the rendered document remains part of your existing workflow.

Save a Peek buffer before highlighting from its preview. Peek can render unsaved buffer contents, while the native host deliberately edits the file on disk; run `:checktime` if Neovim does not reload the external change automatically.

To change the opening and closing highlight markers, open the extension's settings from the browser or use the gear button in the result UI. Both markers default to `==`.

Explanations are stateless. Codex runs ephemerally in a read-only sandbox; Claude is limited to its `Read`, `Glob`, and `Grep` tools. Both use their installed CLI's current authentication, project instructions, and default model.

## Exact Peek source integration

For exact source resolution even when the same selection occurs in several files, apply [`integrations/peek.nvim-project-reader.patch`](integrations/peek.nvim-project-reader.patch) to a Peek fork and use that fork in Neovim. The patch sends the active buffer path through Peek's existing local WebSocket and exposes it as hidden page metadata for this extension. It intentionally does not put the filesystem path in the preview URL, so the URL remains `http://localhost:<port>/?theme=light`.

The patch also enables [`markdown-it-mark`](https://www.npmjs.com/package/markdown-it-mark), so Peek renders `==highlighted text==` as a styled `<mark>` element in both light and dark themes.

From the root of the fork:

```sh
git apply /Users/ser/dev/pdf-reader/integrations/peek.nvim-project-reader.patch
deno task --quiet build:fast
```

If the fork already contains the earlier source-path commit, apply only the incremental [`integrations/peek.nvim-mark.patch`](integrations/peek.nvim-mark.patch) before rebuilding.

The extension continues to work without this patch using the safe matching fallback above.

## Development

Run the dependency-free Node test suite:

```sh
npm test
```

The native host writes protocol messages only to stdout and diagnostic errors to stderr. To remove its generated launcher and browser registrations:

```sh
npm run uninstall-host
```

## MVP boundaries

Only local `file://` PDFs and HTTP pages on the exact `localhost` hostname are granted access. Localhost pages must match Peek's page structure before source metadata is accepted. This version intentionally has no custom PDF viewer, remote-document support, automatic rerendering, streaming, custom prompts, multi-turn chat, or saved history.
