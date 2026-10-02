# v0.1.0 replacement preparation

Observed 2026-10-02 UTC. This research performed authenticated reads and created a private backup. Product files, shared Git refs, remote refs and releases were unchanged. The dispatch names this existing task; `task.py current --source` reports no active pointer. User authorization to republish 0.1.0 applies after implementation and validation. The parent owns replacement.

## Authoritative state

- Origin: `git@github.com:TexasOct/jev-gateway.git`; repository/default branch: `TexasOct/jev-gateway`, `main`.
- Local branch: `fix/v0.1.0-macos-release`. HEAD, remote HEAD, remote main and local origin/main: `16929b38d780bd04385fecb9aaa76d824acf04c7`.
- Remote `fix/v0.1.0-macos-release` branch and its local origin tracking ref are absent. Task metadata names main as branch/base. Parent must choose and push the reviewed source branch explicitly.
- Annotated remote and local v0.1.0 tag object, exact replacement lease: `d4eb6b79799d30c6ae3a413813eabe131084d379`.
- Tag peeled commit: `33ae6ce272b65ac274838f92db318566967c1d32`.
- Release numeric ID: `401261321`; tag `v0.1.0`, target_commitish `main`, draft false, prerelease false. Latest endpoint returns the same ID/tag. Target_commitish is metadata; the peeled tag supplies the actual commit.
- Latest release workflow run: `36910091577`, push event, headSha `33ae6ce272b65ac274838f92db318566967c1d32`, completed success. Build, Ubuntu smoke, macOS smoke and release jobs each succeeded. URL: https://github.com/TexasOct/jev-gateway/actions/runs/36910091577
- Remote main release.yml bytes equal local workflow. Tag push `v*` builds the tagged checkout; frontend lint/tests/build/freshness, pytest, Pyright, wheel validation and both installed-wheel smoke jobs precede publication. Existing release/draft prevents publication; lookup errors other than confirmed 404 prevent publication. Stable release becomes latest. Current project version: 0.1.0.

## Private backup and verification

Private directory: `/Users/texas/.cache/jev-release-backups/v0.1.0-20261002T062815Z-hemev9tu`. Root and nested directories have mode 700; regular files have mode 600. The parent cache directory is mode 700.

Files: original `release.json`, `latest.json`, `assets/` containing exactly four assets, `annotated-tag.txt`, `repository.bundle`, private bare `git/`, `remote-refs.txt`, `remote-release-main.yml`, `workflow-runs.json`, `workflow-jobs.json`, `verified-state.json`, `backup.sha256.json`. The checksum manifest covers release JSON, tag text, bundle and verified state. It is a local integrity record.

| Asset | API asset ID | Bytes | SHA256 |
| --- | --- | ---: | --- |
| install.sh | 603919151 | 10215 | 2147aa40b8048a17244eeae4dd976e5647a53165a50613bb74467668069aa63d |
| install.sh.sha256 | 603919150 | 77 | e88837fdbeb8561431dcb115284191403644ce2478013664ad4b34c2445b117a |
| jev_gateway-0.1.0-py3-none-any.whl | 603919148 | 351668 | e528d5726ea9c8230b3c6dcd259b513c5aa379f50971fce1a63d3c3b735a69db |
| jev_gateway-0.1.0-py3-none-any.whl.sha256 | 603919149 | 101 | bbfa5db7b4d773ff77d313ad4a78be92c4a32576dd00c8735613f5e0d1d38528 |

All four downloaded byte lengths and hashes match API size/digest. Both sidecars contain the expected payload filename and matching payload hash. `git bundle verify` passed. `git hash-object -t tag annotated-tag.txt` equals the exact tag lease SHA; private fetched tag is an annotated tag. Release ID and remote tag object were rechecked unchanged after backup.

`gh api user --jq .login` succeeded as TexasOct without displaying credentials. Available tools: Git 2.55.0, gh 2.101.0, Python 3.14.7 (checkout virtualenv), uv 0.7.16, Node 24.18.0, npm 11.16.0, curl and shasum. Release workflow specifies Python 3.12 and Node 22; parent should select matching environments for release gates.

## Proposed sequential commands, not executed

After implementation, commit reviewed scoped changes, run all gates in docs/releasing.md from a clean checkout, and smoke the same validated wheel with Python 3.12. Build into a fresh directory. Preserve unrelated staged work. Choose the source branch deliberately; below assumes the current fix branch is intended. Set RELEASE_COMMIT to the reviewed commit and verify version 0.1.0.

```sh
REPO=TexasOct/jev-gateway
TAG=v0.1.0
OLD_TAG=d4eb6b79799d30c6ae3a413813eabe131084d379
OLD_RELEASE_ID=401261321
RELEASE_COMMIT='<reviewed fully validated commit SHA>'
git push origin "$RELEASE_COMMIT:refs/heads/fix/v0.1.0-macos-release"
git ls-remote origin refs/heads/fix/v0.1.0-macos-release refs/tags/v0.1.0 'refs/tags/v0.1.0^{}'
gh api "repos/$REPO/releases/tags/$TAG" --jq '{id,tag_name,draft,prerelease,assets:[.assets[]|{id,name,size,digest}]}'
```

Compare the exact source SHA, tag object, release ID and all assets to this backup. Stop on drift and prepare a new backup. Reverify private hashes and bundle. Use a dedicated clean checkout to create the new annotated tag, leaving the shared checkout's tag alone. Record NEW_TAG_OBJECT before replacement. Immediately recheck ID/tag before deleting; GitHub release deletion lacks a compare-and-swap lease, so an operator must prevent concurrent release changes during this interval.

```sh
# Run in the dedicated release checkout after all gates pass.
git tag -d v0.1.0
git tag -a v0.1.0 "$RELEASE_COMMIT" -m 'Release v0.1.0'
NEW_TAG_OBJECT=$(git rev-parse refs/tags/v0.1.0)
test "$(gh api "repos/$REPO/releases/tags/$TAG" --jq .id)" = "$OLD_RELEASE_ID"
test "$(git ls-remote origin refs/tags/v0.1.0 | cut -f1)" = "$OLD_TAG"
gh api --method DELETE "repos/$REPO/releases/$OLD_RELEASE_ID"
git push --force-with-lease="refs/tags/v0.1.0:$OLD_TAG" origin refs/tags/v0.1.0:refs/tags/v0.1.0
```

Tag push initiates publication; monitor the newly created run with exact RELEASE_COMMIT/headSha. Require every job to succeed. Then inspect stable/latest flags, exactly four assets, API digests, pinned/latest downloads and installed-wheel/public-installer acceptance prescribed by docs. Do not manually publish to bypass gates. A failed push after deletion leaves a temporary release gap; use restoration below if replacement cannot finish.

## Restoration command shapes

Stop or cancel any replacement publication run before restoring. Inspect current tag and any partial replacement release. Back up a partial release before explicitly removing it by its own numeric ID. Restore the old annotated object from the private repository/bundle, with a lease against the actually observed replacement tag SHA. If the tag never changed, no tag push is needed. If absent, use an empty expected lease. Restoring by pushing the tag can start a workflow, so coordinate cancellation before recreating original assets to avoid competing publication.

```sh
BACKUP=/Users/texas/.cache/jev-release-backups/v0.1.0-20261002T062815Z-hemev9tu
git -C "$BACKUP/git" bundle verify "$BACKUP/repository.bundle"
# If private bare repository must be recovered:
git clone --bare "$BACKUP/repository.bundle" '<private restore repository>'
# EXPECTED_CURRENT_TAG is the freshly observed object SHA, or empty if absent.
git -C "$BACKUP/git" push \
  --force-with-lease="refs/tags/v0.1.0:$EXPECTED_CURRENT_TAG" \
  git@github.com:TexasOct/jev-gateway.git \
  refs/tags/v0.1.0:refs/tags/v0.1.0
```

Prepare a private JSON request from release.json retaining tag_name, target_commitish, name, body and prerelease, with draft true. POST it to `repos/TexasOct/jev-gateway/releases` using `gh api --method POST --input <private-create-json>`, retain the returned numeric ID, then upload the four original assets:

```sh
gh release upload v0.1.0 --repo TexasOct/jev-gateway \
  "$BACKUP/assets/install.sh" "$BACKUP/assets/install.sh.sha256" \
  "$BACKUP/assets/jev_gateway-0.1.0-py3-none-any.whl" \
  "$BACKUP/assets/jev_gateway-0.1.0-py3-none-any.whl.sha256"
gh release edit v0.1.0 --repo TexasOct/jev-gateway --draft=false --prerelease=false --latest
```

Recheck all digests, latest and restored tag object. Recreated release/asset IDs and publication timestamps will differ; GitHub cannot restore the deleted numeric IDs. Preserve original JSON as evidence. These commands are restoration shapes requiring fresh IDs/leases and coordinated workflow state, not an automatic recovery script.
