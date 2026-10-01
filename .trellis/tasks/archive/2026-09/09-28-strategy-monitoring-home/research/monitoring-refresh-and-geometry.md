# Monitoring refresh and connection baseline

## Observed source

- `frontend/src/monitoring/MonitoringView.tsx` already renders registered strategy tabs, a source/strategy/model composition, live-session distribution and secondary evidence panels. It uses two generic `monitoring-map-link` elements; the second ends at the model list rather than connecting to each destination. The activity disclaimer currently describes explanatory-only motion. This child must replace that particular motion/disclaimer while preserving retained-request playback.
- `frontend/src/monitoring/monitoring.css` gives those links a one-shot `monitoring-explain-path` animation and stacks them at 760px. It does not contain independently addressed model branches. Each destination must receive a real connector whose endpoint follows row layout, including wrapped translated labels and narrow screens.
- `frontend/src/monitoring/strategy-distribution.ts` deduplicates sessions and groups each row once by its latest strategy and canonical `provider/upstream_model`, with route and unknown fallbacks. Keep this count intact. Request-specific activity must be a separate projection: one session may have two concurrently active destinations without belonging to both latest-selection count buckets.
- `frontend/src/session-pages.ts` walks cursors, accumulates stable-ID-deduplicated rows and preserves the last successful cursor for retry. Session response metadata is replaced by the next page as rows accumulate, so per-page activity timing must be retained at row level or normalized before merging. Never apply the newest page's clock to earlier rows.
- `frontend/src/App.tsx` owns API orchestration. `loadMonitoring` currently clears sessions, increments the list epoch and reloads providers/strategies while traversing all session pages. Reusing it as a periodic timer would reset list scroll/focus, flash loading and repeat unrelated reads. Add a quiet session/activity refresh path with generation guards; preserve user selection and detail state.
- `frontend/src/monitoring/MonitoringView.tsx` treats retained-evidence storage failure as uncertified distribution data. Authoritative activity must be independent of that flag; absent/failed SQLite evidence does not imply that in-memory stream tracking is unavailable.
- `frontend/package.json` exposes `lint`, `test` and `build`; `build` runs `tsc --noEmit` and Vite. No added diagram or animation package is required for SVG/CSS connectors.

## Design direction

Use the supplied `magpie-route-reference.png`: compact strategy selection above the diagram, a centered strategy node, and individually connected model rows. Render low-contrast static branch paths and an accent dot or flowing dash overlay only on verified active model paths. Motion communicates activity, not a request count or token/chunk cadence. Keep semantic model text and counts in HTML, SVG decorative to assistive technology, and do not introduce pan/zoom or editing to monitoring.

Measure node anchors in the diagram's local coordinate system after layout; use the same path for its base stroke and activity overlay. Recalculate on resize, wrapping, locale changes and destination changes. On narrow screens, use an intentional stacked composition with paths joining the actual nodes. Respect reduced motion, keyboard focus and the current palette.

## Proposed refresh rules

Use non-overlapping reads of the new `GET /v1/routing/activity` endpoint at 3-second intervals after the previous read completes, only while monitoring is visible and authenticated. Do not poll the existing session/evidence traversal for this purpose; its previous geometry/data notes explain why activity needs a separate read. Keep existing lists/detail visible during refresh. Timestamp each activity request at dispatch using monotonic browser time; discard a sample ten seconds after dispatch. No server recent-arrival window is used. Never use browser wall-clock time or session `updated_at`.

Treat activity snapshots older than 10 seconds, failed reads, absent fields, incomplete activity projection and worker mismatches as unknown for motion. Session-page cursor failures remain separate from activity endpoint health. A slow/partial session traversal must not certify complete distribution counts. Clear a failed activity generation's motion promptly, retain distribution information with its existing partial/stale labels, and require a fresh successful activity response to resume. Resume polling on visible/monitoring focus; auth failure stops polling until credentials are supplied. These timings are implementation defaults, not measured stream latency guarantees.

## Ownership

Parent artifacts assign `App.tsx` and translation integration to the shell owner. There is no active remote-pi mesh session to contact from this planning session. Before implementation, establish a single writer for shared `App.tsx`, `api.ts` and `i18n.tsx`, and preserve all pre-existing changes. Do not treat unavailable peer discovery as proof no other writer exists.

## Verification

Use only synthetic fixtures and mocked upstreams. Test snapshot staleness, overlapping destinations, stale reads, hidden-view polling, authentication, unchanged detail selection and scroll/focus. Browser checks must compare branch endpoints with actual node anchors at desktop and 390px/320px in both locales/schemes, and confirm that only the intended paths animate. No production gateway, records, logs or credential-bearing configuration was inspected for these findings.
