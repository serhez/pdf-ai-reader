# PDF AI Reader privacy policy

Effective: August 26, 2026

PDF AI Reader helps you highlight selected text in local Markdown files and ask a locally installed Codex or Claude CLI to explain selected text in project context.

## Data the extension handles

Depending on the action you choose, PDF AI Reader may handle:

- text you select in a local PDF or a Peek Markdown preview;
- the local URL and filesystem path of the selected document;
- relevant file contents read by your chosen AI command-line tool from the detected project directory;
- your configured Markdown highlight markers; and
- the pending request and latest result shown in the extension interface.

PDF AI Reader does not collect authentication credentials, advertising identifiers, or analytics.

## How data is used and shared

**Highlight in Markdown** is processed locally. The selected text and document location are passed from the extension to the PDF AI Reader native host on the same computer. The native host finds the associated Markdown source and edits that local file. This action does not intentionally send document contents to the extension developer or an AI provider.

**Explain with Codex** and **Explain with Claude** are initiated only when you choose the corresponding context-menu command and accept the in-product AI data disclosure. The extension passes the selection and document location to the local native host. The native host starts the CLI you selected and permits it to read relevant files within the detected project directory. The CLI may transmit the selection, prompt, file contents, tool results, account information, and operational data to its provider:

- Codex uses OpenAI services under your locally authenticated account. See the [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy/).
- Claude uses Anthropic services under your locally authenticated account. See the [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy).

The PDF AI Reader developer does not operate an intermediary server and does not receive these requests or responses. OpenAI and Anthropic handle data according to your account, service settings, and their respective terms and policies.

## Local storage and retention

Highlight-marker settings and your AI-disclosure choice are stored in `chrome.storage.local`. Pending requests and the latest displayed result are stored in `chrome.storage.session`. You can clear extension data or uninstall the extension through the browser. Files changed by the highlight action remain in your project until you edit or restore them yourself.

Data handled by Codex or Claude is retained according to the selected provider and your account settings. PDF AI Reader cannot delete provider-side data for you.

## Permissions

PDF AI Reader uses narrowly scoped browser permissions to add selection context-menu commands, inspect a user-invoked local Peek preview, communicate with the local native host, display results, and save settings. Host access is limited to local `file://` documents and `http://localhost/*` previews.

## Your choices

- AI explanations are optional. Highlighting continues to work if you decline AI data sharing.
- Choosing an AI explanation is an instruction to send the disclosed data through your selected local CLI.
- Consent is saved separately for Codex and Claude. You can revoke the saved choices from the extension settings and will be asked again before that provider's next AI explanation.
- You control which local projects and files you use with the extension.

## Chrome Web Store Limited Use disclosure

PDF AI Reader's use of information received from Chrome APIs adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data), including the Limited Use requirements.

## Changes and contact

Material changes to data handling will be disclosed in the extension and reflected in this policy before the changed handling begins. For privacy questions or support, [open an issue in the PDF AI Reader repository](https://github.com/serhez/pdf-ai-reader/issues).
