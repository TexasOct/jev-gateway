# Monitoring route replay proposal

## Purpose

Make the selected request's recorded routing evidence easier to understand. Magpie's “Smart routing” section inspired using a spatial route diagram and a moving marker to explain a path. Magpie renders routing decisions and account failover as a live simulated process. JEV's current record schema exposes a bounded set of retained fields and does not provide an ordered retry trace or live event subscription. The prototype therefore uses a static evidence view plus a user-started illustrative replay.

## Proposed monitoring interaction

1. The operator selects a session and a retained request from existing monitor lists.
2. A route view reflects fields on that exact selected `RetainedRequest`: inbound request, decision, upstream request, outcome. Missing records remain “Unavailable”.
3. A persistent label states the records are synthetic in the design prototype and that playback is illustrative.
4. “Replay path” starts a finite animation. The operator can pause, resume, reset or replay again. Motion does not start automatically and does not stand in for elapsed or live time.
5. The request evidence remains visible while the route is replayed. Selecting another request resets the prior animation and updates evidence.
6. Under `prefers-reduced-motion`, selecting and reading the route remains complete; replay changes the static emphasis without a moving packet.

## Status semantics

- Success/failure comes only from a present recorded `outcome.ok`.
- A null outcome is “Outcome unavailable/not retained,” not “Running”.
- Missing decision/upstream sections remain explicit. Do not imply the path traversed missing stages.
- Do not display failover through candidates as real attempts. Candidate lists do not prove which alternatives ran.
- Provider summary values describe a bounded retained observation window; they do not prove health/uptime or request-in-flight state.

## Animation design values

Current prototype uses a 3.6 second presentation with evenly stepped node highlighting. That time is a proposed readability choice and has no relationship to the stored `latency_ms` or stage `created_at` timestamps. The static trace is the canonical information. Do not show the replay duration as a metric.

## Product integration is deferred

This concept expands monitoring interactions while the previous user request said to preserve interaction logic. The user explicitly requested this monitoring interaction/animation design and approved a separate prototype. That is not yet approval to modify the production app or change APIs. Before integration, present and obtain explicit approval for the precise monitoring interaction behavior. The strategy editor, policy review/apply behavior and canvas gestures remain unchanged.
