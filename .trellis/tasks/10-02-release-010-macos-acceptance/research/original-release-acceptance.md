# Original v0.1.0 macOS acceptance

## Artifact identity

The original annotated tag resolves to `2ccd6cce6c25df864806f88c2f98b42e64876c88`. Its Release is published and stable, with the intended four assets. Installer SHA256 is `2147aa40b8048a17244eeae4dd976e5647a53165a50613bb74467668069aa63d`; wheel SHA256 is `4ccef1f7cba5129dfeb79c5a80ea7d18f21bf6674050ec48a266d81960a37482`. Both downloaded sidecars match. The wheel declares Python >=3.12, both CLI entry points, and the dashboard shell and assets.

Original Release JSON, tag ref/object, and all four assets are preserved privately under `/tmp/jev-v010-macos-acceptance/original-release`.

## Installed baseline

Running the published installer with separate `UV_TOOL_DIR`, `UV_TOOL_BIN_DIR`, `XDG_STATE_HOME`, and runtime `--home` succeeded. The explicitly installed CLI reported `jev 0.1.0`; doctor, start, status, stop, health, routing strategies, Dashboard HTML, and referenced JS/CSS succeeded. The baseline service was stopped after checks.

Before formal installation, the default `~/.local/bin/jev` and `jev-gateway` were absent. The session PATH selected the repository virtual environment. Subsequent acceptance uses absolute installed commands from `/tmp`.

## Operator configuration

The existing runtime configuration initially failed strict validation because it retained retired `signals`, reasoning trigger fields, and label `score`. Removing only those fields from an in-memory copy allowed validation. The operator then removed obsolete fields manually; the current production document validated. The user explicitly excludes migration or compatibility for retired fields, so this diagnosis does not authorize adding a migration layer.

The original default-path published installer subsequently succeeded. Installed doctor/config validation and background start/status/stop passed. Current operator configuration and credential file hashes remained unchanged across installation and lifecycle checks.

## Reproduced foreground defect

With no `JEV_GATEWAY_HOME`, running `/Users/texas/.local/bin/jev-gateway` from `/tmp` exited 1 with `FileNotFoundError` for `/private/tmp/models.json`, despite valid initialized default runtime data and install state. `gateway.runtime_directory()` uses the caller's cwd. Resolve foreground runtime through the existing CLI path contract so entry points agree.

## Production-path file operations

Exclusive named probes completed create, read, update, rename, and delete under:

- `/Users/texas/.jev-gateway`
- `/Users/texas/.local/bin`
- `/Users/texas/.local/share/uv/tools/jev-gateway`
- `/Users/texas/.local/state/jev-gateway`

Each probe was removed in cleanup. No existing operator file was deleted. Private command evidence is under `/tmp/jev-v010-macos-acceptance`; credential values, raw configuration, and request content are excluded from this report.
