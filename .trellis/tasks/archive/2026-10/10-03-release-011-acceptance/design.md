# Release 0.1.1 design

## Source and publication boundary

The release starts from the verified merge c29c304. Update the three version owners: project metadata, package metadata, and the root package entry in uv.lock. Keep dependencies and frontend source unchanged unless a reproduced acceptance failure requires a repair. Commit with the configured signing, using a temporary index to preserve the two existing journal edits.

The existing tag-triggered workflow owns publication. It builds one artifact set, validates it, passes it to Ubuntu and macOS installed-wheel jobs, and publishes only after both pass. The stable tag is v0.1.1. If replacement becomes necessary, retain Release JSON, assets, checksums and Git objects first; delete the exact Release ID and change only this tag with an explicit lease.

## Acceptance chain

Source gates establish that the tagged source works. CI evidence establishes that the uploaded wheel was installed on both platforms. Public downloads establish the published bytes. Local public-wheel smoke and public-installer acceptance establish installed behavior. Package-file comparison connects the public dashboard and Python code to the verified source.

Run the existing browser suite with a separate Playwright configuration against the installed public wheel's loopback dashboard. Do not rebuild the dashboard for this run. Keep the existing synthetic API fixtures; they exercise browser behavior without upstream calls. Installed smoke and installer acceptance separately exercise actual authenticated configuration APIs, SQLite and CLI lifecycle.

Reuse scripts/smoke-installed-release.py for wheel acceptance. Its current CLI has no --installer flag, so public installer acceptance must reuse the retained v0.1.0 private driver or a task-scoped driver with the same documented boundaries. The private driver must be reviewed for fixed version/path assumptions and current process ownership.

## Runtime preservation

Synthetic installs isolate uv tool, executable, state and managed Python directories, and use runtime paths containing spaces. Default-path acceptance takes protected file backups and a consistent SQLite backup before ordinary upgrade. Compare each original table tuple as a multiset projected on its original columns, including NULL values. Preserve valid current-schema configuration, credential/overlay bytes, and the original running/stopped state. Control services only through their installed owner CLI.

The operator's earlier public 0.1.0 configuration needed an explicit adjustment before a 0.1.1 upgrade. The user approved the independently reviewed two-file preview: remove the unsupported defaults block, give eleven empty pools the original model reference, and fill eight empty overlay choices with an existing label. Recheck exact preview and original hashes, retain fresh file/SQLite backups, and replace only this pair through the installed configuration transaction while the owned service is stopped. Preserve file modes and all other operator files. Validate and restore the old owned running service with the approved configuration before exercising the ordinary public installer. This establishes a valid running baseline; the installer must preserve that complete baseline. Independently compare all pre-approval original rows and untouched files afterwards as well.

## Evidence and closeout

Raw logs, installed environments, operator backups and artifacts remain in .git/jev-release-011-acceptance with private permissions. Commit sanitized metadata, command results, hashes, criterion mappings, curated UI artifacts and independent review under the task. Report-only commits may follow publication without moving the verified tag.

## Reset disclosure repair

The first public wheel reproduces a hidden configured preview after reset in two complete browser runs. The config-hash key correctly rebuilds draft and inspector state, but also discards the information drawer's open state. A mounted strategy-view wrapper retains that disclosure state across the keyed editor, with an optional controlled prop and the existing direct-editor local fallback. A successful save explicitly collapses review before reloading; reset keeps the information drawer open. Browser synchronization waits for the applied draft to become unchanged and for the restored baseline fallback to render, while retaining the original preview assertion.

All first-publication and failed harness evidence stays intact. Rebuild and republish the same authorized tag after source verification and private backups of the exact existing Release/tag/assets.
