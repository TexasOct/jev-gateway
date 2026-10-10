# Native-owner preparation for public installed acceptance

## 1. Scope / Trigger

Use this contract when changing `scripts/public-installed/public_accept_native.py`,
its reversible fixture seams or its producer/consumer joins. These files are
acceptance tooling. They do not change Gateway request handling or routing.
The historical public-installed-013 workflow retains its signed 0.1.3 inputs.
Read the public installed business acceptance section of quality-guidelines.md
for product assertions, origin protection and actual cleanup requirements.

## 2. Signatures

The helper owns these interfaces:

- `preparation_inputs(commit: str, manifest: str, helper_sha: str, source_manifest: str, *, captured: bytes, helper: bytes, sites: list[dict[str, Any]]) -> dict[str, Any]`.
- `runtime_prelaunch(executable: Path, ledger: Ledger | None = None, *, helper: bytes | None = None) -> RuntimeFacts`.
- `load_owner(descriptor: Path, trusted_helper: Path, expected_sources: dict[str, Path]) -> NativeSession | None`.
- `NativeSession.begin(context: CallContext) -> Slot | None`.
- `NativeCoordinator.plan(label: str, argv: list[str], cwd: Path, env: dict[str, str], index: int, log: Any) -> None`.
- `static_capacity(source: Path, helper: Path, preparation: Path, sites: list[dict[str, Any]]) -> dict[str, Any]`.

## 3. Contracts

Preparation admission joins captured manifest bytes to their digest, actual
helper bytes to the helper hash and manifest row, and the copied-source table to
its digest. Available Git base metadata remains separate from working file
hashes. `prep_tree=null` means the tree was not captured. It does not describe
modified or untracked working files. Empty prospective runtime or preparation
approval registries are not required.

Runtime admission captures executable stat identity and bounded source/API
facts. Supported behavior is CPython 3.12 with the exact normalized local run
projection. Loaded constructor, run, context, communicate, poll and wait code,
and pathlib constructor/string code must match captured facts. An external
layout's header/source facts are preliminary; the worker checks the actual
interpreter, version, source and loaded behavior. A version string alone cannot
establish compatibility or custody.

Several sequential returned native objects may occupy live fixed slots.
Allocated/reentrant mutation, lock contention or a foreign registry thread
marks accounting uncertain and forwards native behavior without a ticket.
Slots remain allocated through construction/publication and closure mutation;
finalization retires remaining slots without recycling. Exhaustion forwards
native behavior without creating another receipt chain.

Native returned-object identity, actual poll/closure results, native exception
precedence, signed source assertions and whole-owner cleanup predicates remain
required. Helper completion cannot clear an original observer or cleanup
failure. Limits remain 96 attempts, 512 entries/read admissions and 25,690,112
charged bytes, with no cross-owner borrowing.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Working manifest/helper/source digest differs | Refuse preparation admission |
| Runtime source, loaded API, header or layout is incompatible | Refuse runtime admission |
| Assigned source entry/byte reservation is exceeded | Refuse; preserve partial diagnostics |
| Earlier registered object remains live | Admit a later sequential call into another available slot |
| Registry mutation overlaps, reenters or changes thread | Forward native behavior without a ticket; reject complete owner accounting |
| Fixed slots are exhausted | Emit no additional chain; reject complete owner accounting |
| Native cleanup and receipt finalization both fail | Preserve the original native exception as primary |
| Original cleanup/observer fails or custody is incomplete | Reject whole-owner completion |

## 5. Good/Base/Bad Cases

Good: two returned objects remain live while a third sequential run completes;
each has its own slot and authentic terminal evidence. Base: ordinary single
calls preserve their original native arguments/results. Bad: treating a live
child as an active allocation, accepting a Git base tree as working-file proof,
or borrowing a parent's exit for an unowned descendant.

## 6. Tests Required

Affected pure controls cover usable non-whitelist capture/publication, changed
manifest/source/loaded behavior, resource bounds, multiple live objects,
independent closure, actual reentrant callbacks, exhaustion and native exception
identity. Preserve thirteen full signed-file reversals, fourteen creation sites
(five Popen and nine run), business assertions and original cleanup predicates.

Static harness PASS and unavailable local type diagnostics have their declared
scope. They do not prove installed business behavior or waive hosted product
type gates. Historical failed observations retain their original attribution.
New release evidence must bind its actual source and wheel; 0.1.3 evidence must
not be relabeled as a later release.

## 7. Wrong vs Correct

Wrong: require an empty prospective approval list before collecting facts, or
reject a later call solely because an earlier child is still alive. Correct:
join actual working inputs and supported loaded APIs, and distinguish live
custody from allocation/closure mutation while retaining incomplete-owner
rejection.
