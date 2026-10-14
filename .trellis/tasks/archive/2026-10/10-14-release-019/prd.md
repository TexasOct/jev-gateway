# Publish JEV Gateway 0.1.9

## Goal

Publish scoped agent metadata/cache support and the integrated decision routing controls as stable 0.1.9 while preserving unrelated staged work.

## Requirements

- Publish the scoped metadata/cache implementation and already integrated decision routing controls as stable 0.1.9.
- Keep all three version records aligned and preserve every resolved dependency record.
- Verify the exact isolated release source, package, installed wheel and hosted Ubuntu/macOS smokes.
- Verify the four published assets, sidecars, latest identity and the isolated public installer.
- Preserve unrelated primary staged blobs, working bytes and the existing 0.1.8 tag/assets.
- Keep operator configuration, credentials and installation untouched.

## Acceptance Criteria

- [x] Metadata/cache implementation committed separately after source review and focused checks.
- [x] A1: Three version records and dependency preservation verified.
- [x] A2: Full backend/frontend/type/build gates pass on isolated release inputs.
- [x] A3: Versioned wheel, installer and sidecars pass release validation.
- [x] A4: Isolated macOS installed-wheel smoke passes.
- [x] A5: Signed release commit and annotated tag target exact reviewed source.
- [x] A6: Hosted build and Ubuntu/macOS same-wheel smoke pass.
- [x] A7: Four pinned public assets and latest identity verified.
- [x] A8: Isolated public-installer smoke passes; closure archived without moving the release tag.

## Notes

- Gateway fields do not implement native Pi compaction or Claude Code/Codex config writers.
- The operator still has no configured decision supplier; publication does not enable live classification.
