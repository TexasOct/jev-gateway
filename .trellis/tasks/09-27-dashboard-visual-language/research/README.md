# Dashboard visual and monitoring concept

Everything in this directory is planning evidence or an offline design prototype. No product files were changed by the concept work.

## Review first

- [`style-board.html`](./style-board.html): visual language board for shared chrome, monitoring, route canvas, inspector, drawer and control states. Includes light/dark switch.
- [`style-spec.md`](./style-spec.md): proposed palette roles, typography, spacing, surface and state rules. Values need visual review before production adoption.
- [`monitoring-prototype.html`](./monitoring-prototype.html): standalone synthetic-data prototype for session/request selection, field-by-field recorded evidence, and explicit route replay with pause/resume/reset/replay again.
- [`monitoring-motion-proposal.md`](./monitoring-motion-proposal.md): interaction and animation proposal plus production integration boundary.
- [`design-review.md`](./design-review.md): outstanding user decisions for production interaction.
- [`implementation-outline.md`](./implementation-outline.md): proposed product integration slice, acceptance and risks. It does not authorize implementation.
- [`verified-preview/checks.json`](./verified-preview/checks.json): output from `verify-prototypes.py`, covering playback state, empty/missing records, reduced motion, local-only resources, themes and 320/390/1440px layouts.
- [`production-verification-summary.md`](./production-verification-summary.md): implementation scope, automated gates and browser-data caveats.
- [`verified-preview/checks.json`](./verified-preview/checks.json): repeatable-browser verification results across theme and viewport combinations.
- [`monitoring-data-contract.md`](./monitoring-data-contract.md): schema-backed constraints for what the current monitoring APIs can and cannot show. Prototype records follow these supported field shapes.
- [`reference-analysis.md`](./reference-analysis.md): observed Magpie page and animation details, with evidence and limitations.

## Screenshots

- `style-board-dark.png`, `style-board-light.png`, `style-board-mobile.png`
- `monitoring-prototype-desktop.png`, `monitoring-prototype-mobile.png`
- `magpie-reference/intent-route.png`, `magpie-reference/smart-route.png`
- `baseline-images/`: screenshots of the pre-existing JEV page through a synthetic API fixture, captured during the original design audit.

Open either HTML directly in a browser. It uses a local stylesheet and local in-page samples only. The monitoring concept does not fetch from JEV or any external service.

## Interpretation limits

Magpie has an animated simulated account/model-routing demo with selectable strategies, a moving SVG packet, changing destination states and counters. JEV's retained record schema can show request/decision/upstream/outcome fields, nullable evidence and aggregate observations. It does not encode a complete ordered retry trace, exact per-stage duration or an event subscription. The prototype animates only to make selected recorded fields easier to scan. Sample values and replay timing are synthetic and must not be presented as production facts.

Production integration and a change to monitoring interaction behavior still need explicit review and approval. Strategy editing remains outside that interaction redesign.
