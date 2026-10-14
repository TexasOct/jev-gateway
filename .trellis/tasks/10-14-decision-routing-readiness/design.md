# Decision routing readiness

The observed behavior is intentional fallback under a disabled, unconfigured decision engine. The product gap is the absence of a supported enable control after onboarding decision suppliers.

Add `set_decision_enabled` to ProviderConfiguration.command and the shared frontend ProviderOperation union. It accepts exactly action and a strict boolean enabled. Preserve timeout/default provider/provider order. Reuse baseline/effective catalog validation and the existing recoverable transaction. Enabling requires at least one resolved credential in the completed candidate, after any accompanying provider upserts. Explicit disabling remains valid without credentials.

Render readiness and an enable/disable button in the decision-provider tab through a small stateless control. Read the existing decision snapshot and credential-presence booleans. Reuse manager.save, its pending/revision/error/uncertain-write safeguards and catalog refresh; publish success only after an accepted write. Keep the control outside provider draft editing so it cannot hide/discard edits.

No routing algorithm, default template, fallback semantics, credentials, installed package or operator runtime configuration changes. Existing local working changes are saved and retained. Runtime repair remains blocked on the missing real decision supplier configuration.
