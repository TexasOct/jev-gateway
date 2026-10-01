# Release repair and macOS acceptance design

The published wheel, stamped installer, and installed CLI form the acceptance boundary. Repository execution alone cannot establish that a release is usable. Start with the original artifacts in a separate uv tool environment, then verify the real default tool and runtime paths after the demonstrated defects are repaired.

## Installation and runtime boundaries

Use explicit installed executable paths for acceptance and launch commands from outside the repository. The isolated baseline uses separate `UV_TOOL_DIR`, `UV_TOOL_BIN_DIR`, `XDG_STATE_HOME`, and runtime home. The production check retains the user's normal home and uv defaults. Snapshot existing runtime file hashes and file metadata privately before writes; never emit secret file contents.

Runtime mutations use unique acceptance filenames. Application-level configuration transactions must either use an isolated runtime or restore the prior document after a reversible change. Preserve existing records, credentials, and unrelated services. Verify health and process ownership before controlling any existing PID.

## Defect repair

Trace every reproducible failure to its existing owner module. Add a regression at that boundary, including macOS command behavior when relevant. Keep the installed package independent of repository files, the developer virtual environment, frontend build tooling, and the caller's working directory.

Retired configuration fields remain invalid. The operator handles removal of old configuration; installation preserves an existing current-schema document and copies the packaged template only when absent. This release does not add compatibility or migration code.

## Publication and recovery

The user requested replacement of v0.1.0. Preserve the old Release JSON, annotated tag object, installer, wheel, and checksums in a private backup directory before changing GitHub. Complete local source and artifact validation before replacing the Release and moving the tag. Use a tag-scoped force-with-lease operation against the observed old tag, retain normal source history, and let the existing tag-triggered publication workflow enforce its gates.

After publication, verify the tag's commit, workflow conclusion, release flags, exact asset set, both checksums, and wheel metadata. Download through pinned and latest public URLs and install the downloaded assets again. If publication fails, diagnose the failed gate; do not label local artifacts as a completed public release.
