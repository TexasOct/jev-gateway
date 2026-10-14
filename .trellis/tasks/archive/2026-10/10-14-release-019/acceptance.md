# Stable 0.1.9 acceptance

- Metadata feature commit: `049b8bf80ac873d9f4a9ff11fbee723332a13374`.
- Release source: `400b13d2040a0b31380f51beb5e1ce967e44bddf`, valid signature.
- Signed annotated tag: `04bf16b010a1603311134d368d58c545eafbd3d4` (`v0.1.9`).
- [Published release](https://github.com/TexasOct/jev-gateway/releases/tag/v0.1.9): stable/latest, four assets.
- [Hosted workflow](https://github.com/TexasOct/jev-gateway/actions/runs/38593985098): build, Ubuntu smoke, macOS smoke and release all succeeded.
- Local backend: 3362 passed, two skipped. Frontend: 432 passed.
- Native browser: 784 passed, two skipped; supplier-cloud: nine passed.
- Pyright: zero errors/warnings. Lint: zero errors, four preexisting warnings.
- Lock/dependencies, types, build, bundle, package and release validator passed.
- Independent product source review and browser-test correction review: PASS.
- Isolated local wheel, Ubuntu hosted wheel, macOS hosted wheel and public
  installer each report success with 169 checks. Hosted/public checks use the
  same wheel; local build has its own separately validated wheel digest.

## Public identities

```text
install.sh
ed45994183abac0dbe1e99093d7b9d22dc47223defbc72157b39a557dc19b334

jev_gateway-0.1.9-py3-none-any.whl
24e9fb12db27a708f98b56c50552dd056382b2ebced85855fa14911c1ea84b9e
```

Both SHA256 sidecars match; all four asset bytes match GitHub API digests and
hosted build artifacts. Tagged Python/templates/license bytes match the wheel.
Installed smoke confirms every installed package file equals that wheel and
serves the Dashboard JS/CSS with no Node.js on PATH.

Public smoke uses the documented private nine-tool PATH seam. It is a reversible
one-tuple change with unchanged guards, assertions, deadlines and mode. No raw
0.1.9 four-tool installer run is claimed. Native failed attempts and complete
logs remain in private durable state; this file contains only public summaries.

The original 18 browser failures remain recorded; the final full run passed
after correcting stale single-selector assertions and an observable readiness
wait. The original single-scenario race repro passed and is not called a failing
deterministic reproduction. Original 0.1.8 tag/assets remain unchanged. Seven
unrelated primary staged paths and operator runtime inputs are preserved.
