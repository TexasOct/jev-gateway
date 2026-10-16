# Design

The gap lives in the display projection: each criterion repeats the same canonical context edge. Collapse those copies in `model/outputs.ts`; retain the canonical ordered graph and mutation intents. Keep one stable `context` output even while invalid question definitions are being repaired, with review still blocked by existing validation.

Use a 240px card with the existing 56px header and 28px output rhythm. Rule headers show rule number and two-line conditions. Outputs show their semantic role and actual destination. Draw intermediate rule continuation from bottom to top using shared port geometry; other connections remain lateral. Use neutral surfaces, modest semantic accents and smaller visual port marks within existing hit bounds.

`RoutingEditor.tsx` retains all existing mutation owners. Add a question selector and display one definition at a time; unfinished raw inputs remain retained and block review. Show question instructions and criterion descriptions with AND/OR hints in the rule inspector, and put the destination selector first. New-question and explicit repair actions select the owning definition. Preserve the concurrently updated compact header and its distinct strategy-settings accessible name.

Arrange pools by first incoming rule, align their preferred height with that rule, and place shared models near the mean incoming pool height. Keep saved positions authoritative. Terminal no-match wires use the inter-column gutter; bound lateral curve offsets to avoid routing a short connection inside its endpoint cards.

No backend, serialization or layout-schema changes. Existing saved node positions remain authoritative; arrange-all adopts the new dimensions. Pure tests verify graph identity and geometry; browser tests exercise real native input and inspect responsive screenshots with an isolated synthetic configuration.
