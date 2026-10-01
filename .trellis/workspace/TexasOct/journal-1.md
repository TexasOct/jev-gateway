# Journal - TexasOct (Part 1)

> AI development session journal
> Started: 2026-09-23

---


## Session 1: macOS v0.1.0 release repair and public acceptance
<!-- trellis-session: v=2 fp=c4ff9df2cab3dcff -->

**Date**: 2026-10-02
**Task**: macOS v0.1.0 release repair and public acceptance
**Branch**: `fix/v0.1.0-macos-release`

### Summary

Repaired foreground runtime lookup, process ownership, and local proxy handling; republished v0.1.0 and verified the public installer in isolated and default macOS paths.

### Main Changes

- Unified installed foreground and managed runtime resolution; replaced rendered ps parsing with actual psutil argv.
- Gated publication on Ubuntu and macOS acceptance of the same built wheel; backed up and replaced the authorized existing tag and Release.
- Preserved operator configuration, credentials, existing SQLite rows, and initial stopped service state; archived the sanitized requirement report.

### Git Commits

| Hash | Message |
|------|---------|
| `33ae6ce` | fix: repair macOS runtime and gate release on installed acceptance |
| `a01b642` | docs: record public v0.1.0 macOS acceptance |

### Testing

- [OK] 755 Python tests, 210 frontend tests, clean Pyright, frontend/build/packaging/shell/release gates.
- [OK] Publication run 36910091577: all four jobs succeeded; four public assets and all digests verified.
- [OK] Public wheel: 59 checks; public isolated/default installer phases: 148 checks; installed parity: 52 files; no probe files remain.

### Status

[OK] **Completed**
