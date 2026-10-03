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

## Evidence and closeout

Raw logs, installed environments, operator backups and artifacts remain in .git/jev-release-011-acceptance with private permissions. Commit sanitized metadata, command results, hashes, criterion mappings, curated UI artifacts and independent review under the task. Report-only commits may follow publication without moving the verified tag.
