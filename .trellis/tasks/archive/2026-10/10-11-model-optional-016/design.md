# Model seam

Use the existing provider transaction, import parser and frontend model draft/confirmation owners. Make required identity separate from optional runtime facts. Avoid manufacturing booleans or prices in persisted records or metadata. Public management reads and editor initialization must reveal omissions accurately even where the runtime catalog uses backward-compatible defaults.

Expected production scope: provider_config.py and its safe projection/import/update helpers; necessary model DTO/metadata parsing only; shared API model types; provider model draft/fields/dialog/import components and locales. Read adjacent domain/evidence tests before editing. Add no package dependency. Runtime catalog parsing must retain legacy compatibility.

The old spec requiring all fields is intentionally superseded by parent R1; update it to the new executable contract. Source-reference adoption and manual confirmation remain explicit.
