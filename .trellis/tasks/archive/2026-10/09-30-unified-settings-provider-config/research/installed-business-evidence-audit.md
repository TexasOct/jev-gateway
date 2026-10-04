# Installed business evidence audit

The five ordinary completed business streams and their durable continuations
pass the corrected record checks against retained evidence. The original
installed acceptance remains FAIL with 306 passing checks and two failed
assertions. No stream, request, limit or result was changed, and no new real
generation call was made for this audit.

The candidate wheel SHA256 is
`57e49d26d089d3bbe4b06f2e7b03d0344a11a04e881ed4549f84beb4da4f6914`.
The original run is `run-20261002T160029.047834Z` under the protected
`final-installed-business/` evidence root. See
[the original report](./final-installed-business.md) for all six calls, metadata,
isolation, byte parity, lifecycle results and preserved failures.

## Repeated-answer continuation assertion

The original private `business.py::evidence()` requires `len(matched) == 1`
among all same-key continuation records in a session. That condition conflicts
with `save_assistant_continuation()` and the SQLite store, which append one
record per completed assistant turn. Replay matches repeated content in
occurrence order.

The supplied-assistant followup produced the same visible message as the first
turn. Both records therefore have the same normalized message key. SQLite
contains the original record at `1790956886.367146` and the new record at
`1790956922.481344`. The followup request arrived at
`1790956920.8288372` and its successful `stop` outcome was recorded at
`1790956922.481926`. The original record remains unchanged, and exactly one
new correct-origin capture belongs to this request/outcome window.

The separate read-only verifier checks one new correct-origin capture for each
of the three ordinary strategy streams, the post-reinstall supplied-assistant
followup and the fresh assigned-tag stream. All 20 checks pass. The original
`results.json` hash is unchanged. The verifier runs through the candidate's
installed Python with `-I -B`, outside the checkout. Its script and result are
`verify-retained-business.py` and `retained-business-verification.json`.

This corrects a harness assumption about session-wide uniqueness. It does not
change capture timing or application code. The stream finalization requirement
still includes SDK exhaustion, a finish reason and terminal ASGI delivery;
the source and native gates verify that ordering.

## Visible output at the deliberate length boundary

The additional explicit 2048-token long-output probe completed transport with
HTTP 200, `length`, one `[DONE]`, EOF and no error events. Its recorded native
usage is 51 prompt, 2048 completion and 2099 total tokens. It returned 8657
reasoning characters, reported all 2048 completion tokens as reasoning and
returned zero visible characters. The nonempty-visible-output assertion remains
failed. The gateway retained its finish, usage and successful transport outcome,
and did not create an assistant continuation for an empty visible message.

Earlier direct-upstream/JEV comparisons and saved-stream SDK/serializer replay
in [the budget diagnostic](./real-budget-analysis.md) established analogous
reasoning-only budget behavior and preserved each observed character. They
remain diagnostic evidence for their own snapshot. The current probe does not
certify an upstream guarantee to produce visible text at every client budget.

## Ordinary reinstall and remaining scope

The original run proves byte-identical baseline JSON, credential file and valid
active overlay through forced ordinary reinstall. Original populated request,
decision, outcome, upstream-submission and continuation tuples remain intact
immediately afterward, after the supplied-assistant followup and after the
remaining calls. Final counts are six request/decision/outcome/upstream rows,
five continuations and eight config versions. All 54 installed package files
match the wheel and frozen source before and after reinstall. Auth sources and
134 historical evidence files remain unchanged; the owned service is stopped.

The original failure report stays separate from this corrected evidence audit.
Public release, public downloads/installations and the actual operator reset
remain required and unverified here. The independent
[requirements review](./installed-business-requirements-review.md) confirms
publication eligibility while retaining the failed length-probe assertion.
