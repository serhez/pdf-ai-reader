# Chrome Web Store listing

## Product details

- **Name:** PDF AI Reader
- **Category:** Productivity
- **Language:** English
- **Short description:** Highlight selected local-document text in Markdown or explain it with project context.
- **Homepage:** https://github.com/serhez/pdf-ai-reader
- **Support:** https://github.com/serhez/pdf-ai-reader/issues
- **Privacy policy:** https://github.com/serhez/pdf-ai-reader/blob/main/PRIVACY.md

## Detailed description

PDF AI Reader connects passages in local PDFs and localhost Peek Markdown previews back to the project where you are working.

**Requirements:** macOS, the separately installed PDF AI Reader companion, Node.js 18 or newer, and Codex CLI and/or Claude Code for AI explanations. Local PDFs also require enabling **Allow access to file URLs** in the extension settings.

**Privacy:** PDF AI Reader has no analytics, advertising, or developer-operated server. When you explicitly choose an AI explanation, your selected text and relevant project-file contents read by the chosen CLI may be sent to OpenAI or Anthropic under your account. An in-product disclosure is accepted separately before the first request to each provider.

Select rendered text and use the context menu to:

- add `==highlight==` markers to the matching Markdown source;
- ask Codex to explain the passage in project context; or
- ask Claude to explain the passage in project context.

The extension is intentionally limited to local `file://` PDFs and exact `http://localhost/*` previews. Highlight edits happen locally. AI explanations run through the Codex or Claude CLI already authenticated on your computer.

## Single purpose

Help users act on selected passages in local project documents by connecting rendered PDFs and Markdown previews to their Markdown source and project-aware AI tools.

## Permission justifications

- **contextMenus:** Shows the three user-invoked actions only when text is selected in a supported local document.
- **nativeMessaging:** Sends the selected action to the separately installed local companion, which edits Markdown or invokes the chosen local AI CLI.
- **scripting:** Reads Peek-specific source metadata from the active localhost preview after a user chooses a context-menu action.
- **sidePanel:** Displays progress, errors, changed-file locations, and AI explanations in Chrome's side panel.
- **storage:** Stores highlight-marker preferences and AI disclosure consent locally, plus the pending request and latest result in session storage.
- **file:///*:** Identifies the local PDF selected by the user. Chrome separately requires the user to enable file-URL access.
- **http://localhost/*:** Supports Peek previews on their temporary localhost port. The extension rejects non-localhost URLs and validates Peek's page structure before accepting metadata.

## Privacy-practices answers

- Data handled: website/document content selected by the user, local document locations, relevant project-file contents read during an AI explanation, extension settings, and the latest session result.
- Data use: extension functionality only.
- Transfers: to the user's selected OpenAI or Anthropic service only after an explicit explanation action and disclosure acceptance.
- Not used for: advertising, analytics, creditworthiness, lending, or sale to third parties.
- Certification: the extension's use of Chrome API data complies with the Chrome Web Store User Data Policy, including Limited Use requirements.
