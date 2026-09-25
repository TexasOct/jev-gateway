# Design: dashboard localization

## Architecture

Add a lightweight typed dictionary for `en` and `zh-CN` under `frontend/src/i18n/`, with a shared React provider/hook exposing locale and parameterized translation. Use English as a fallback for missing keys and a test to ensure dictionary key parity. Add a language selector in the dashboard toolbar.

## Persistence and security

Persist only the fixed locale identifier under a dedicated localStorage key. Never place credentials in browser storage; the API module continues to keep its bearer credential in memory. Update the dashboard bundle security test to permit the narrowly scoped locale key while asserting that credential APIs/values are not persisted or included in URLs, cookies, or the shell. Validate locale values read from storage and fall back to `navigator.languages` when absent/invalid.

## Coverage

Localize navigation, session list, request detail labels, provider observation labels, status/empty/error/loading states, configuration editor, workflow nodes, review/validation messages, accessibility labels, and date/time formatting. Do not translate model IDs, strategy/config values, raw request evidence JSON, or unknown server diagnostics. Map stable API error codes to translations when available and retain unknown messages.

## Integration

Add the shared translation provider before `App` renders. Use the same hook in monitoring and routing editor; because both components are changing, integrate the provider/API before their UI refinements or coordinate a shared branch. Preserve selected session and draft state during locale changes.

## Risks

- Dynamic copy and data-label attributes can be missed by simple JSX extraction; test representative rendered states in both languages.
- Persisting locale introduces localStorage into built JS, so existing security assertions need a precise update without weakening credential guarantees.
- User content and config identifiers may resemble UI text; keep them data-driven and untranslated.
