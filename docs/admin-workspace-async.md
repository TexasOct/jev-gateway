# Dashboard recovery during asynchronous work

When the Dashboard needs a new access key, it keeps the workspace mounted but
hides it and makes its controls inert. Reconnecting returns to the same forms.
The workflow draft, its history, supplier inputs and model import selections stay
in memory. None of these drafts or credentials are saved to browser storage.

Workflow policy validation, policy application, policy reset and canvas layout
errors use the same Dashboard authentication boundary. An HTTP 401 opens the
connection form. A supplier probe that reports `authentication_error` in an HTTP
200 response describes upstream authentication and stays in the supplier form.
Connection tests verify only the model-list endpoint; they do not certify model
generation, capabilities or prices.

Navigation and refresh are disabled while policy or layout work is pending.
This includes the layout debounce and waiting layout writes. These operations
cannot be dismissed through the ordinary discard-draft confirmation. During
reauthentication, the canvas cancels queued work, timers, deferred measurements,
focus changes and transient gestures. It retains local coordinates and history.
An already submitted write may finish; reconnecting does not submit it again.

A configuration validation that started before suspension cannot proceed to its
write after reconnecting. If a write has already committed, the Dashboard retains
the committed configuration and reports any missing catalog refresh. The retry
action repeats reads, without repeating the write.

Model suggestions belong to the supplier selector, upstream model IDs and
configuration generation that produced them. Changing a supplier connection
invalidates its discovery and metadata responses, including delayed responses.
A conflicting external configuration reload keeps selected imports and manual
values, removes stale automatic evidence and requires fresh lookup or explicit
review. Refreshing metadata keeps manually owned values. Supplier and model
operation errors appear in their own workspace; a genuine catalog read failure
continues to provide a read-retry action.

The configuration files and HTTP payloads retain their existing ownership.
Supplier/model baseline writes, routing policy writes and canvas layout writes
remain separate. These recovery changes require no configuration migration.
