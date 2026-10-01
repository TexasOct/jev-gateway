# Appearance redesign design

## Boundary

Keep `AppearanceView` as a presentational view receiving existing theme state and callbacks from `App.tsx`. The saved seed persists through the existing theme GET/PUT/DELETE API; light/dark scheme and palette derivation remain shared-shell responsibilities. No additional persistence or backend fields.

## View

Show the saved and previewed seed as an accent on neutral shared surfaces. Make preview, save, reset, loading/error and contrast information easy to distinguish. Use shared Button/Card patterns with keyboard focus and legible labels in English/Chinese. Ensure representative seeds remain legible in both schemes.

## Ownership

This child edits `appearance/AppearanceView.tsx`, view CSS and tests only. Shared palette, `App.tsx`, i18n and control primitives belong to the shell owner. Roll back only appearance-owned changes.
