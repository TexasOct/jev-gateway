# Publish JEV Gateway 0.1.7 with all current changes

## Goal

Publish all frozen metadata and workflow UI changes as stable 0.1.7, verifying combined source, signed tag, hosted artifacts and isolated public installation.

## Requirements

- R1: Publish stable `0.1.7` with all 33 tracked modifications frozen from the main checkout, covering generic model metadata and the workflow/canvas UI refresh. Preserve every admitted change and any later concurrent work.
- R2: Keep the generic metadata contract accepted by its source task. Validate the combined frontend, including native canvas gestures, responsive controls, localization and policy/layout recovery.
- R3: Align `pyproject.toml`, `jev_gateway/__init__.py` and the root `jev-gateway` record in `uv.lock` at `0.1.7`, without changing resolved dependencies.
- R4: Publish through the existing tag workflow after source review and local package validation. Require the build and both same-wheel OS smoke jobs to succeed and verify the four public assets against native checksums and hosted identities.
- R5: Retain original failures and final native receipts. Use isolated source/build/smoke directories and preserve normal Git index custody. Keep configured signing and hooks; never overwrite an existing tag or Release.
- R6: Commit the authorized work, record release completion and finish the accepted task records. Keep the operator's installed package, running daemon, credentials and configuration unchanged.

## Acceptance Criteria

- [x] A1: The exact combined candidate has independent review with no source blocker and applicable frontend/backend/type/browser gates pass.
- [x] A2: Version records agree, dependency records remain identical and a fresh wheel passes `scripts/validate-release.py` for `v0.1.7`.
- [x] A3: The validated local wheel passes the existing isolated macOS installed-wheel smoke with its actual native exit and evidence.
- [x] A4: Signed product commits on `main` contain the accepted source and the annotated `v0.1.7` tag targets the intended commit; remote updates are fast-forwards.
- [x] A5: The existing formal release workflow succeeds on that source; Ubuntu and macOS smoke consume the same hosted wheel.
- [x] A6: The public stable Release is latest, non-draft and non-prerelease; all four pinned asset bytes, sizes, digests, sidecars and version identities agree.
- [x] A7: The downloaded public installer passes the existing isolated smoke, including reinstall preservation, using only the documented reversible PATH seam if needed.
- [ ] A8: Release/task records preserve the original acceptance boundaries and failures, final bookkeeping is committed/pushed, and operator installation/runtime remain untouched.

## Authorization

The user instructed: `现在正对我们的所有新修改发布0.1.7`.
This authorizes the version bump, inclusion of the current metadata and UI
changes, scoped commits, tag/push and stable publication. It supersedes the
earlier metadata-only commit exclusions. Additional commit confirmation is not
required. Operator installation is a separate scope.
