# Dashboard configuration workflows

The Dashboard provides Monitoring, Strategy workflow, Suppliers and General settings. Each supplier's editor contains its model settings. Configuration uses the existing installation files and authorization rules. Moving a control does not reset its saved value.

## Starting points and required changes

The development baseline is `0501e29044eeda1c5b23516bd05f667c3f4ed532`. It includes the supplier and select-control work already present when this task began.

| Module | Observed baseline | Required change |
| --- | --- | --- |
| Settings | Settings displayed appearance and default-model controls; the existing gateway-key form had no mounted Settings entry. | Put initialization and replacement in Access and security, with permission, activation and draft feedback. |
| Suppliers | The connection form exposed saved profiles and credentials but had no bounded upstream connection-test interface. | Organize setup around the chosen supplier or transport, handle generated identity and credentials, and explain listing-test results. |
| Model discovery | Discovery and import opened within the selected supplier's page. | Keep searchable batch review and shared model editing under the corresponding supplier connection. |
| Model editing | Configuration operations supported model import but had no whole-record `update_model` action or shared model Dialog. | Edit existing and candidate models through one Dialog and validate existing-model updates in the revision-aware transaction. |
| Canvas | Selection, pan, zoom, fit, context commands, an inspector and a review toolbar already existed. | Complete their interaction and persistence boundaries, show the selected strategy's information, and distinguish policy, validation and layout status. |

The corresponding baseline sources are `AppShell.tsx`, the provider views and API types, and `RoutingCanvas.tsx`/`RoutingEditor.tsx`. The task acceptance records identify the source paths, candidate versions and evidence for each change.

## Page and field ownership

| Page | User task | Fields and actions |
| --- | --- | --- |
| General settings | Configure access to this gateway and console preferences | Gateway access key, language/theme and global default model |
| Suppliers | Connect the gateway to an upstream service and maintain its models | Supplier summaries and Edit/Delete entries; each LLM supplier's editor has Connection settings and Model settings, including model editing and discovery/import |
| Strategy workflow | Decide how requests select a model | Questions, ordered rules, fallback and model-pool membership, with a separate canvas layout |

Supplier instance IDs and credential reference names are implementation identifiers. The normal setup flow generates them. Changing a supplier's display name does not rename its model IDs or invalidate strategy references. A supplier brand can have several connections, each with its own name, address and credentials. Advanced compatibility controls retain existing environment and shared-reference setups.

Ordinary Ollama and LM Studio connections can use their unauthenticated local setup without a primary credential reference. Adding authentication or selecting an existing reference is a deliberate choice. Other templates retain their credential requirements.

## Access and security

The gateway access key authenticates clients calling the gateway. The Dashboard currently uses the same Bearer boundary for connected reads and configuration writes. A supplier credential authenticates outbound calls from the gateway to that supplier. These are separate credentials even when the console displays both configuration states.

General settings owns access-key initialization and replacement. Initialization retains the existing local-bootstrap restrictions. Replacement requires the current gateway key and takes effect immediately after a successful write. Other clients must start using the new value. The console installs a successfully submitted key in module memory before releasing reads waiting for rotation.

The service returns only configured/unconfigured state and safe reference information. Saved secret values are not prefilled. Failed writes retain the current draft for retry; successful writes and confirmed cancellation clear the secret input. The browser does not store gateway or supplier credentials in URLs, cookies or browser storage. Reloading the page can require reconnecting with the gateway key.

## Supplier connection flow

Choose a supplier template or a custom connection method, then enter a display name, service address and the required credential. Templates supply known defaults. Account-specific endpoints and required cloud fields still require the operator's values. The native-default endpoint option cannot bypass an account-specific endpoint requirement.

Existing credentials are shown as configured. Leaving replacement empty retains the saved value. Replacing and clearing are explicit actions. Clearing a local value may expose an inherited environment value, and shared credential references remain protected from an accidental change to other consumers.

Vertex connections accept service-account JSON alongside the project and location fields. Bedrock connections accept an access ID and secret pair, with an optional session token. These inputs use protected credential references generated by the console. Server/default authentication is an explicit alternative. Selecting it removes direct credential bindings from the connection; it does not delete the detached values from protected storage. Existing references remain stable during a display-name edit.

Saved account parameters are redacted by the existing safe configuration response. An unchanged account edit keeps the stored parameter map. Changing those fields or switching authentication modes requires the complete required account information; the console explains this beside the empty fields. It never submits a redaction marker as a credential or account value.

A connection test reports its scope. For a supported LLM transport, it exercises the upstream model-list endpoint with the candidate connection and credentials. Authentication failure, rejected address and network failure have separate feedback. A successful listing test does not certify that generation is enabled for every model or that the account has sufficient balance. A protocol without a safe listing probe is explicitly unsupported or offers configuration validation only.

The API returns fixed diagnostic codes in `warnings`. Every result includes `generation_unverified`, followed by a listing diagnostic. The console translates status and scope into operator feedback.

A connection test belongs to the configuration revision that started it. Loading a different revision cancels the pending probe and suppresses its late result; testing again uses the current draft and revision.

| Status | Diagnostic code | Meaning |
| --- | --- | --- |
| `success` | `listing_succeeded` | Listing completed; zero models is a valid result. |
| `authentication_error` | `authentication_failed` | The upstream rejected the credential. |
| `address_error` | `address_unavailable` | The address is invalid, unavailable or rejected by network policy. |
| `network_error` | `upstream_failed` | The bounded request could not complete. |
| `unsupported` | `discovery_unsupported` or `listing_unsupported` | The transport or endpoint has no supported listing probe. |
| `incomplete` | `credential_unconfigured` or `listing_incomplete` | A declared credential is absent, or the listing is partial/invalid. |

Choose Edit on an LLM supplier, then open Model settings to search its configured models, edit them, or discover and import upstream models. The supplier list shows each connection's summary and configured-model count. New connections and unsaved connection changes must be saved before Model settings becomes available. Switching back to Connection settings or leaving the editor protects unsaved model drafts with a discard prompt. Saved model changes take effect through their own transaction. Decision suppliers retain their connection form and optional model field.

A model's Edit button opens the shared model Dialog for that exact connection and upstream model. Discovery, metadata reads and connection tests do not save a supplier, credential or model.

## Drafts, permissions and recovery

Returning editable values to the values opened in the form restores a clean draft. Leaving a dirty editor asks whether to keep editing or discard its changes. Pending configuration writes and queued layout writes block departure until they settle.

Secret submission captures the current values and actions, then clears the visible inputs while the operation is pending. Validation or write failure restores the captured draft in component memory. Vertex JSON retains its original formatting for editing; canonical JSON is used only for submission. Successful writes and confirmed cancellation clear the captured inputs.

Entering and then deleting a replacement credential returns that field to KEEP. CLEAR remains an explicit action. Submission reads the current native input so a removed replacement cannot be sent from an earlier React state.

If a connected request receives HTTP 401, the shell shows its connection form and suspends the mounted editors. Reconnection restores their drafts after the required authenticated reads, including theme, complete. Validation started before suspension cannot initiate a configuration write after reconnecting. Source responses are bound to the selected connection, request and configuration generation.

Feedback remains with its operation. Supplier errors appear beside connection editing; model errors appear in that supplier's model controls or open editor; access-key and default-model results remain in Settings. A write that committed before a catalog-read failure is reported as saved. Its recovery action retries reads without repeating the write. A default-model conflict keeps Save and Clear blocked until a successful configuration read supplies the current revision.

When a write's outcome is unknown, the console requires a successful configuration read before another validation or write. A failed recovery read keeps the draft and the write block. Recovery does not automatically repeat the original write.

## Model discovery and import

Open Model settings in the relevant supplier's editor, expand the discovery/import controls, fetch its upstream model list, search it and select a batch. Metadata lookup uses the existing Models.dev, OpenRouter, packaged LiteLLM and supported provider-native evidence sources. An ID-only listing does not establish model capabilities or prices.

The import preview distinguishes complete matches, missing fields, conflicting evidence, failed retrieval and already configured models. Complete metadata can be reviewed and imported as a batch. A row can open the same model editor used for existing models; batch import does not require a separate dialog confirmation for each row. Existing qualified IDs are skipped during import. Updating an existing record uses its edit action rather than an import that silently overwrites it.

Prices use USD per million tokens. Input, output and applicable cache-read/cache-write prices keep their source units and billing conditions in the evidence record. A provider-wide retail quote does not establish a proxy's effective price. Matching uses the serving provider and exact upstream model ID or an evidenced alias; similar names alone are insufficient.

Unknown price is not zero. Unknown capabilities are not support or rejection. Capability controls retain three states in a draft. Before adding a routable model, the existing confirmation boundary requires explicit input/output prices, capabilities, reasoning-effort values and limit decisions. A positive integer declares a known limit; an explicit unknown limit preserves the existing routing treatment and is explained in the editor. An incomplete row can be edited or retried while other evidence remains visible.

## One model editor

The model Dialog groups basic information, capabilities, limits and prices. Routing tags, priority and quality remain available where they affect the existing catalog. Existing canonical identity is protected so an edit cannot break supplier, default-model or strategy references. Display name changes are independent of that identity.

Use Edit beside a configured model under its supplier to inspect or change its saved values. The same editor is used for import-preview records. Opening or cancelling writes nothing; successful saves update the supplier's model list, while failed saves retain the editor draft and existing configuration. Model rows have one Edit action rather than a separate details entry.

The configuration response identifies tags and priority owned by the routing overlay. Those fields are read-only in the model editor and omitted from its save payload. Baseline-owned fields remain editable. If a conflict reload changes ownership, the editor keeps the draft and asks the operator to adopt the current workflow values before saving other changes. A removed model stays visible with its draft and a recovery message. Older responses without ownership information use a read-only compatibility state.

Each automatic field exposes its source state and dates. Retrieval time, source-declared update time and operator confirmation time have distinct meanings. Manual overrides remain manual after the Dialog is reopened. Refresh updates fields that are still automatic; restoring an automatic value shows the difference before replacing a manual value. A failed refresh preserves already fetched evidence and provides retry.

For the same serving connection and model, unknown, conflicting, reference-only or failed refreshes retain useful acquired values and their history, including cache prices. The editor explains the latest uncertainty and requires a reliable retry or explicit manual resolution before confirming those fields. Changing the serving connection invalidates its earlier automatic applicability. A source failure in an HTTP 200 response appears as a failed fetch with a retry for that item.

Restoration also covers source ownership when the manual and automatic values are equal. The preview explains that the selected field will return to automatic updates while keeping the same value.

Saved evidence retains the existing source-count and size limits. The editor keeps required provenance and original confirmation dates, with older unreferenced evidence available in its history view. If a refresh cannot fit without removing a required source, it keeps the previous savable values and confirmations and explains how to retry. Clearing an import selection or restoring the original inputs clears the unsaved-change prompt when no other edit remains; edits to unselected models and pending writes still protect departure.

Saved reasoning-effort capabilities and known or confirmed field values use the same ladder order with duplicates removed. Original supplier effort declarations remain in the source history with their original ordering and text. Normalization preserves field ownership and dates; the server checks the original evidence size before normalizing it.

One save submits the full validated model record through the revision-aware provider configuration transaction. Cancel writes nothing. Failed validation or persistence keeps the input and identifies the relevant fields. A committed save followed by a failed catalog refresh offers a read retry without repeating the successful write. The Dialog body scrolls while its actions remain reachable, and closing returns focus to its trigger. Dirty cancellation and page navigation require a discard choice.

If filtering, renaming or removal hides the trigger, closing returns focus to the visible model search. An existing finite legacy quality value, including `2.5`, can be retained during an unrelated edit. New, imported or changed quality must be within `0..1`; the server compares an unchanged value with the actual stored record.

Disabled model records remain manageable. Runtime selection excludes them, including default and pinned selection paths. Catalogs omitting the optional enabled flag retain their previous enabled behavior. Optional cache prices may remain unknown without inventing a free cache charge.

## Canvas editing

The visual graph represents the existing ordered routing workflow. It is not an independent executable graph. Questions feed the ordered rule sequence; matching rules select configured model pools, and generated failure/default paths retain their existing meaning.

Right-click blank canvas space or use the explicit add control to create a supported editable node. Pointer coordinates account for zoom, pan, scroll and the canvas content origin. The new node is selected and its configuration is accessible. Menus stay within the window and close on Escape or an outside interaction.

Node and connection actions use the same semantic mutation helpers as other editors. Delete and Backspace affect the selected supported object unless focus is in a text-editing control. Removing a rule updates dependent connections and rule-slot layout. Generated or necessary nodes and connections explain why they cannot be deleted independently. Undo and redo cover ordinary draft/layout changes, respecting configuration reload and save boundaries.

The inspector groups the selected node's configuration. Cards show type, name and a useful summary, with separate selected/incomplete/error feedback. Validation identifies the affected question, rule or connection so the operator can repair it. The advanced editors use the same pending draft and validation feedback as canvas actions.

The information area identifies the selected strategy and its matching catalog description, with the actual baseline source and overlay state. Policy validation, review and application feedback remain separate from layout saving. Description requests stop when the editor becomes inactive, and a late response cannot describe a different selected strategy.

After reconnection, validation, application and reset requests from the previous connection cannot display an obsolete error, disconnect the current session or clear the status of a new operation. A server write that already committed remains effective and is recovered through authenticated reads.

If the initial layout read fails or returns an unreadable layout, the canvas offers a read retry and keeps layout editing blocked. Retry reads the saved positions and viewport before permitting any layout write. A valid empty or default layout remains editable. A write failure after a successful read retains the saved layout and offers the existing save retry.

Canvas positions and viewport continue to use `routing-canvas-layout.json`. Routing logic uses `routing-overrides.json`. Moving a node or fitting the view does not activate a routing change. Policy changes still go through validation, review and explicit application.

A failed policy activation restores the previous overlay bytes and permissions, active catalog and strategy registry. It leaves retained configuration versions and request history intact. Successful activation publishes the accepted configuration; recording failure does not undo a committed change.

## Delivery order and compatibility

| Module | Required changes | Dependency |
| --- | --- | --- |
| Settings | Access/security ownership, rotation feedback, draft retention | Existing credential transaction |
| Canvas | Context commands, semantic deletion, history, inspector/status | Existing draft and layout contracts |
| Supplier UI | Task-oriented connection form, stable generated identity, direct credentials, accurate test, symbol-only DeepSeek | Connection-test API for remote probe |
| Model contracts | Atomic whole-record edit, optional display/enabled/cache fields, safe projections and source evidence | Existing catalog parser/transaction |
| Model workspace | Batch metadata preview and unified Dialog | Model-edit contract and shared configuration manager |
| Integration | Four navigation destinations, supplier-owned model lists, page-exit guards, fixtures, documentation and browser acceptance | All module outputs |
| Frontend source organization | Supplier, model and shared feature directories; gateway-key form under Settings; synchronized source/resource references | Integrated supplier and model behavior |

Settings and canvas changes can be developed independently. Supplier and model interfaces can proceed in parallel against the recorded API contracts; integration checks the actual backend and frontend shapes together. Extra shortcuts or convenience sorting are optional. None replace the required add/delete/import/edit flows.

Existing credential values, supplier IDs and model/strategy references remain effective. Optional model fields require no destructive migration. Model and supplier transactions continue to validate the baseline and effective overlay before activation and retain recoverable writes and backups. Generated static assets are rebuilt for packaging and are not tracked in Git.

Browser tests use synthetic credentials and deterministic API fixtures. Backend tests separately verify real authorization, file persistence, runtime selection and rollback. Screenshots and a requirement audit are recorded with the task acceptance evidence; fixture browser behavior does not certify external account access or real model generation.
