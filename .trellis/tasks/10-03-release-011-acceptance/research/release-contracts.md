# Release evidence and command owners

Preflight: local main c29c304bea3f33fcc9e696db3d8104a75ab27d61; remote main eeb798f18e260ec84475944c627cc05126ab5d83. No v0.1.1 remote tag or Release exists. Latest is v0.1.0. Git signing is enabled. The initial two dirty journals and index are backed up under .git/jev-release-011-acceptance/preflight.

Version owners found by rg: pyproject.toml:3, jev_gateway/__init__.py:3 and uv.lock:639. The v0.1.0 literal in tests/test_release_validation.py is synthetic mismatch-test data and stays unchanged.

Release contracts: docs/releasing.md; .github/workflows/release.yml; .trellis/spec/backend/quality-guidelines.md; .trellis/spec/backend/cli-lifecycle.md. scripts/validate-release.py checks metadata, entry points, templates, license and exact assets, then generates a stamped installer and checksum sidecars. scripts/smoke-installed-release.py currently requires --wheel, --version and --work-dir, with absolute wheel/work paths. It does not support --installer.

Prior public acceptance: .trellis/tasks/archive/2026-10/10-02-release-010-macos-acceptance/acceptance.md. Retained helpers: /tmp/jev-v010-macos-acceptance/public-installed-acceptance.py and verify-public-assets.py. Inspect hardcoded versions, evidence roots and process cleanup before reusing them. Do not copy historical success into this release's evidence.

Feature requirements: archived 10-03-dashboard-gateway-key-page/prd.md AC1–AC6; archived 10-03-strategy-workflow-canvas-editing/prd.md AC1–AC9. Existing frontend/tests/browser suites cover these and other connected pages. The normal Playwright config uses Vite at 127.0.0.1:4178; public-wheel acceptance needs an alternate server/config to avoid rebuilding or serving source output.

Runtime and operator evidence is private. Published reports contain only hashes, counts, exit codes, versions and pass/fail. The final audit must include original tuple preservation, credential permissions, ownership-aware cleanup and no real upstream generation calls.
