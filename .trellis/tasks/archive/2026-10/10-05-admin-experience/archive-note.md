# Operator-directed closure and stable 0.1.4 delivery

The operator requested completion, task archival and online stable 0.1.4
publication. After the release-preparation agent reached its 30-minute limit,
the operator explicitly instructed: “请不要测试，直接发布，上一个阶段的任务已经验证了”.
No further local or supplementary acceptance tests are run under that direction.
The existing tag-driven publication workflow retains its configured checks.

## Delivered source

The release retains the previously committed Gateway/admin source at
`1633302d1518c7da7f8136f6bee8e7be9b3578b8`. Its only new package changes are the
0.1.4 version in pyproject.toml, package metadata and the root uv.lock record.
All 65 dependency records are unchanged.

Seven acceptance-tool files are integrated verbatim from the independently
reviewed candidate. The bounded static reviewer returned PASS; its report
SHA-256 is `67324a33884d42d8b6d9d38b73821734f109852adcc7a18baad01cbd06176bc9`.
The helper SHA-256 is
`3b2a4b65680c0bd244d3fcd86198d0991df3fd4879d594e00a7732f140c2ce22`.
All sixteen source bindings were inspected, and nine restricted files remain
unchanged. The source/API and fixed-slot contract is recorded in the backend
native-owner spec.

The release-preparation worktree remains preserved on `work/release-014-final`.
Its two additional browser-spec changes are not included in the release:
canvas focus instrumentation and a Settings model-opening fixture adjustment.
No new unverified Gateway behavior is taken from that interrupted stage.

## Verification and exceptions

Earlier independent source/product acceptance remains recorded in acceptance.md.
The operator accepts that prior phase and directs publication without another
local acceptance cycle. This closure does not manufacture a new independent
installed-business PASS.

The interrupted stage has retained successful receipts for frontend lint/unit/
build/freshness, lock consistency, full Python tests, Pyright, wheel build and
validation, ordinary isolated installed smoke, and selected capture/replay.
It also retains failed full/affected browser attempts, including the canvas
reset fallback `default` versus `quality` observation, and an installed-browser
configuration load error. These failures are not relabeled as passes or erased.
The native writer and its orchestration failed by timeout; no final independent
release-preparation review was launched.

Detailed native logs and snapshots remain under
`.trellis/.runtime/admin-experience/release-014-20261010/` and the retained release
worktree's owned runtime. Historical public 0.1.3 observations, unknown creators,
missing true-owner closures and incomplete business evidence retain their
original identities. New 0.1.4 publication does not retroactively resolve them.

Archival records this operator-directed closure with verification exceptions.
The task's administrative completed status is distinct from complete fresh
local acceptance.

## Published stable release

[Stable 0.1.4](https://github.com/TexasOct/jev-gateway/releases/tag/v0.1.4) was
published at `2026-10-10T17:23:48Z` from tag source
`48b042ed2f164a7df62950dab61b17c2deb22dce`.
[Workflow 38071055208](https://github.com/TexasOct/jev-gateway/actions/runs/38071055208)
completed successfully: build, Ubuntu installed smoke, macOS installed smoke
and publication. The tag is retained at that source; this later documentation
records the observed outcome.

The release is public, neither draft nor prerelease, and the latest stable
release returned by GitHub. All four assets were downloaded without credentials:
install.sh, its SHA-256 file, jev_gateway-0.1.4-py3-none-any.whl and its SHA-256
file. Published sizes, GitHub digests and both sidecars match the actual bytes.
The wheel's distribution metadata and package version declare 0.1.4.

Installer SHA-256:
`c803952520701fb80a3c20a013a86015cfa8586ffeaad740bdf645d372aee914`.
Public wheel SHA-256:
`41afb6fa549441feab30500489e4f3c9b5cdbdeca1921213c8dd3ee95f88d72b`.
This public wheel is separate from the interrupted preparation wheel. The
publication receipt is retained at
`.trellis/.runtime/admin-experience/release-014-20261010/direct-publication/publication-receipt.json`.
No further local product tests, installer execution or wheel installation were
performed. The existing publication workflow supplied its configured checks.

Ten archived child context entries now point to the moved parent's current-state
research file. Only their file fields changed; reasons and historical parent
identities remain intact. Parent self-references use the loader's archived-task
mapping. The archive command clears only session pointers matching this task.
