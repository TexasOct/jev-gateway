# Provider icon and preset acceptance

## Verified behavior

The installed wheel was served by a real gateway on loopback with an isolated
catalog and synthetic credentials. Browser requests used the gateway's unchanged
CSP. No upstream model call was made.

| Requirement | Direct evidence |
| --- | --- |
| R1: independent icon control in both kinds | Create/edit browser coverage; real LLM edit and decision creation saved different brand icons |
| R2: persistence and compatibility | Real browser save, API read, page reload and disk checks; unknown icon reads including `constructor`, `__proto__`, `toString` and `hasOwnProperty`; automatic reset; original `timeout: 42` and model references preserved |
| R3: mainstream coverage | Registry has 41 LLM templates and one decision template; focused Python checks compile every LLM template against installed LiteLLM |
| R4: shared templates and cloud setup | CLI derives choices from the same registry; real Azure/Vertex/Bedrock UI forms save the required parameters to disk; browser-only selection leaves the file byte-identical |
| R5: packaged artwork and responsive operation | All 39 SVG HTTP responses match recorded SHA-256 under actual gateway CSP; exact license texts render from the installed bundle; real 390px page has no horizontal document overflow |

`research/installed-acceptance.json` records the real-gateway checks.
`research/screenshots/` contains inspected desktop and 390px screenshots.
Separate browser coverage checks 320px/390px/desktop, both locales and schemes,
keyboard focus, cancellation and failed-image recovery.

## Gates

- Full Python suite: 832 passed.
- Independent focused backend/API checks: 116 passed.
- Frontend lint: passed, with four existing React refresh warnings.
- Frontend unit tests: 35 files, 240 tests passed.
- Frontend application build/typecheck: passed.
- Browser test TypeScript check: passed.
- Related browser suite: 95 passed, covering provider management, icons and presets.
- Static bundle freshness: passed.
- Pyright: zero errors, warnings or information findings.
- Wheel and sdist: built successfully.
- Wheel inspection: 39 exact SVG hashes, no SVG data URLs, license and source evidence included.
- Independent full-scope Trellis check: PASS; earlier review findings were fixed and covered by regression tests.
- Final installed-wheel rerun after account-endpoint hardening: passed.
- Shared-workspace browser integration, including the preserved select-control styling: 116 passed.

The final check's browser/build/packaging gap is closed by the parent's completed
rerun against the final source. No code changes followed those gates. Task
artifacts and documentation were updated afterward.

## Delivery

Product commit: `170b878` (`feat(providers): add selectable icons and mainstream presets`).
Its 72 source blobs match the independently verified files. The shared workspace
retains the separate form-alignment hunk, select-control CSS/tests, other task
archives and earlier journal changes. Protected file hashes were checked before
and after the product commit. The feature was committed locally; no release or
runtime provider configuration was published.

## Operator configuration

Templates do not add providers or models until saved. Cloud account endpoints,
regions, projects, deployment names and credentials remain operator inputs.
Native transport and source checks establish configuration compatibility; they
do not establish account access or upstream model availability.
