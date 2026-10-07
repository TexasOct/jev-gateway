# Design

Use the existing ProviderManagement gateway projection and saveGatewayCredential transaction. Create `features/settings/AccessSecurity.tsx` (or equivalent) and improve the existing GatewayCredentialForm. Do not modify AppShell in the worker; the parent will mount the section. Own localized copy and targeted settings tests. Register a cancellable dirty guard through the existing manager navigation guard without removing guards owned by other views. Unknown/pending configuration has explicit loading/error/retry feedback.

Keep failed submitted keys in component memory for retry and clear them on confirmed cancel/success; do not clear before an unsuccessful save. Existing key values remain write-only. The active user's Goal authorization covers implementation following recorded planning.
