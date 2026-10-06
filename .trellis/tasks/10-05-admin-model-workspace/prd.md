# Goal and acceptance

Implement MI1-MI5 and ME1-ME4 plus model IA3-IA5. Read parent artifacts. Create a task-focused ModelManagementView and reuse one accessible Dialog for list/import/detail edits. Discovery automatically queries metadata, provides searchable/selectable batch preview with field provenance/missing/conflict/failure/duplicate states and permits direct batch confirmation without opening every model.

Whole-model editing includes identity/display/enabled, existing routing fields, capabilities, limits, input/output/cache prices. Manual fields survive refresh; restore automatic values previews changed overrides. Missing information stays unknown and must be completed before a routable confirmed import. Save/cancel/failure/dirty/focus/footer behavior is verified in the browser.

## Latest entry requirement

Models is no longer an independent Dashboard page. List configured models under their saved LLM supplier, with only an Edit button per record opening the shared model Dialog. Discovery/batch import also belong under that supplier. No separate detail trigger or list-management modal is needed. Closing, filtering, changing supplier kind or opening supplier editing must preserve dirty-draft confirmation, write locks and focus return. The latest user request takes precedence over the earlier separate workspace design.
