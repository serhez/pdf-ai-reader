# PDF AI Reader companion for macOS

The Chrome Web Store installs only the browser extension. This companion gives PDF AI Reader narrowly scoped access to local Markdown files and to the Codex or Claude CLI already installed on your Mac.

## Requirements

- macOS
- Node.js 18 or newer
- Google Chrome or Arc
- Codex CLI and/or Claude Code for AI explanations

## Install

1. Extract this archive and open Terminal in the extracted directory.
2. Run:

   ```sh
   npm run install-host
   ```

3. Reload PDF AI Reader in `chrome://extensions` or `arc://extensions`.
4. Enable **Allow access to file URLs** on the extension-details page if you use local PDFs.

The installer copies the runtime into `~/Library/Application Support/Project PDF Reader/`, registers it for Chrome and Arc, and does not require administrator privileges. You may delete the extracted archive after installation.

## Remove

Before deleting the extracted archive, run:

```sh
npm run uninstall-host
```

If you already deleted it, download the same companion release again and run the uninstall command.

The companion has no analytics or developer-operated server. Highlighting is local. AI explanations use the CLI and provider account you select; see the [privacy policy](https://github.com/serhez/pdf-ai-reader/blob/main/PRIVACY.md).
