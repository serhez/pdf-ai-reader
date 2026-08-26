# Chrome Web Store reviewer instructions

PDF AI Reader requires its separately distributed macOS native-messaging companion. No login is needed to test the local highlight action.

## Setup

1. Use macOS with Google Chrome 116 or newer and Node.js 18 or newer.
2. Download the matching `pdf-ai-reader-host-<version>-macos.zip` asset from https://github.com/serhez/pdf-ai-reader/releases/latest.
3. Extract it, open Terminal in that directory, and run `npm run install-host`.
4. Install or reload the submitted PDF AI Reader extension.
5. On the extension-details page, enable **Allow access to file URLs**.

## Test the core highlight flow

1. Download `store/reviewer-fixture/review.pdf` and `store/reviewer-fixture/review.md` from https://github.com/serhez/pdf-ai-reader and keep them together in one directory.
2. Open `review.pdf` in Chrome.
3. Select the sentence: `A highlighted passage remains connected to its Markdown source.`
4. Right-click and choose **Highlight in Markdown**.
5. The side panel reports success. Open `review.md` and verify that the sentence is wrapped in `==` markers.

## Test setup and privacy UI

1. Click the PDF AI Reader toolbar icon or open its settings.
2. Verify that the companion requirement, file-URL instruction, AI data-sharing summary, consent-reset control, and privacy-policy link are present.
3. From the PDF, choose **Explain in project with Codex** or **Explain in project with Claude**. Before any native request is sent, a one-time disclosure explains that selected text and relevant project files may be transmitted by the chosen CLI.
4. Choose **Not now** to verify that no AI request is sent and local highlighting remains available.

The explanation actions additionally require the reviewer to have the corresponding Codex or Claude CLI installed and authenticated. They run in read-only modes and are not required to verify the extension-to-native-host highlight flow.
