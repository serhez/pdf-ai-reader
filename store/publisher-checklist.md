# Chrome Web Store publisher checklist

## Before the first draft upload

- [ ] Run `npm test` and `npm run validate:store`.
- [ ] Run `npm run fixture:review` and confirm the PDF text is selectable in Chrome.
- [ ] Run `npm run package:chrome-draft`.
- [ ] Review and approve `store/assets/icon-source.png` and the generated extension icon sizes.
- [ ] Confirm the repository, privacy policy, issue tracker, and releases page are public.

## Store identity checkpoint

- [ ] Upload `dist/pdf-ai-reader-identity-draft.zip` as a new unpublished Chrome Web Store item. Its manifest intentionally uses version `0.0.0.1` and omits the development key.
- [ ] Copy the draft item's Item ID and public key from the Package tab.
- [ ] Update `extension/manifest.json` with the Store public key.
- [ ] Update `EXTENSION_ID` in `native-host/constants.mjs` if the calculated ID changed.
- [ ] Run `npm test`, `npm run validate:store`, and `npm run package:store` to create the real `0.3.0` packages.
- [ ] Confirm the unpacked extension ID, Store Item ID, and native-host `allowed_origins` ID are identical.

## Release and listing

- [ ] Publish `dist/pdf-ai-reader-host-<version>-macos.zip` as a GitHub release asset before review.
- [ ] Capture at least one accurate 1280×800 product screenshot from the final Store-ID build.
- [ ] Upload the icon, screenshot, and required promotional artwork from `store/assets/`.
- [ ] Paste `store/listing.md` into the Store Listing and Privacy tabs.
- [ ] Paste `store/reviewer-instructions.md` into Test instructions.
- [ ] Select the intended visibility and regions in Distribution.
- [ ] Confirm the developer account has two-step verification and a monitored publisher email.
- [ ] Test installation from a clean Chrome profile before submitting for review.
