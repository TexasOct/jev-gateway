# Stable 0.1.5 publication and local upgrade

The operator requested publication of 0.1.5 and a local upgrade, then explicitly instructed that all remaining changes be included. Commit `69cf58501ecba3bc95d8dbdf9bad64fb29412347` includes the eleven pending metadata, locale, backend, documentation and source-adoption test changes, plus the three version records. The preceding `c3e6c8355a353aebd664d158e177502f42bcc668` contains the shadcn B migration and the five task archives. All 65 other lockfile dependency records remain unchanged.

Annotated tag `v0.1.5` retains source `69cf58501ecba3bc95d8dbdf9bad64fb29412347`. Workflow [38136766231](https://github.com/TexasOct/jev-gateway/actions/runs/38136766231) completed build, Ubuntu installed smoke, macOS installed smoke and publication successfully. Its build reported 409 frontend units, 3210 Python tests passed with two skips, and Pyright with zero errors or warnings. These hosted results remain distinct from the earlier captured 3212-test working-candidate result and the B-only commit checks.

[v0.1.5](https://github.com/TexasOct/jev-gateway/releases/tag/v0.1.5) was published at `2026-10-11T11:52:55Z` and observed as latest stable. Unauthenticated downloads of all four public assets match API sizes/digests and both SHA256 sidecars. The installer embeds `v0.1.5`, and wheel metadata declares version `0.1.5`.

Public wheel SHA256:

```text
b255a0185cd97dc88160635fa2bae9dc84dbd2d419452bcc9822e2ef78cb4b9c
```

The local public installer returned native 0 at `2026-10-11T12:12:40.469754+00:00`. The actual uv wheel input was observed and matched that public digest before unchanged installation arguments were forwarded. Both CLI entrypoints now resolve into the owned uv tool environment and `jev --version` reports `jev 0.1.5`. All 99 release files, including 42 static assets, match the wheel bytes/modes, with exact product membership; installer-generated RECORD is handled separately.

The gateway was running and healthy before installation. The installer performed its ownership-aware restart, and post-upgrade status reports a healthy managed process at `127.0.0.1:8000`, PID `19318`. The served dashboard returns HTTP 200 and matches the installed release HTML. Seven existing runtime files retain their bytes and permission modes. SQLite integrity is `ok`, and typed row multisets preserve every original row multiplicity across all six tables.

Protected recovery material remains at `/Users/texas/.local/state/jev-gateway/upgrade-0.1.5-20261011T184735`. The former installed 0.1.4 metadata module and two dashboard files differed from its official wheel, so recovery is based on a complete, verified 11,536-file copy of the actual tool environment. The initial wheel-parity failure remains in the receipt; it was not relabelled as a match.

Repository receipts are retained under the ignored `.trellis/.runtime/shadcn-release-015/20261011-184315/`. The release tag is immutable; this publication and upgrade bookkeeping is committed afterward. E1 remains PASS by operator manual acceptance, and historical automated popup failures and admin acceptance exceptions remain unchanged.
