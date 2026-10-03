# Version metadata verification

The project version in `pyproject.toml`, the package `__version__` in
`jev_gateway/__init__.py`, and the root `jev-gateway` entry in `uv.lock` are
0.1.1.

| Command | Exit code | Sanitized result |
| --- | --- | --- |
| `uv lock --offline` | 0 | Resolved 66 packages; updated jev-gateway from 0.1.0 to 0.1.1. |
| `uv lock --check` | 0 | Resolved 66 packages; lockfile is current. |
| `python3 scripts/validate-release.py v0.1.1` | 0 | Validated release tag v0.1.1. |

An exact comparison against the pre-edit tracked lockfile confirms that only
the root package version changed. All 65 dependency package entries are
unchanged. The release validator ran in tag-only mode; this result does not
validate built artifacts or publication.

SHA256 comparisons before and after the edits confirm preservation of the two
dirty journal files and the synthetic release-validation test file:

| Path | Preserved SHA256 |
| --- | --- |
| `.trellis/workspace/TexasOct/index.md` | `af00db6e65bd08a076a728f31742adfab8dd7453f449d2d7f459807557da567f` |
| `.trellis/workspace/TexasOct/journal-1.md` | `9c87f62b236d6e198ff88d9f6f7207eaf35593418fd5cde4ef6fb605552254a5` |
| `tests/test_release_validation.py` | `c8f3c744d1e17f268de096599604fb60b65d79d7d702fd187f0590c69db7a2b3` |

This scoped step ran no frontend or backend suites, generated no static assets,
and performed no commit, push, tag operation, or live installation change.
