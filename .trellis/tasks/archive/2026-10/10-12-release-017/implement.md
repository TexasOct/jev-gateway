# Release 0.1.7 execution

1. Preserve main HEAD/index/status, all admitted source bytes/modes, task records
   and session pointers in the private persistent recovery directory.
2. Construct the combined candidate in `release/0.1.7`; update the three version
   records and prove all dependency records unchanged.
3. Obtain a fresh source review and run combined frontend unit/lint/build,
   browser/type and backend/Pyright gates. Use owned strict ports and retain
   each native result. Preserve original failures and escalate concrete source
   findings to the parent.
4. Build a fresh wheel, validate `v0.1.7` and run the existing isolated macOS
   installed-wheel smoke against that exact local wheel.
5. Recheck main inputs and candidate hashes, commit the metadata, UI and version
   changes in coherent signed work commits. Keep task bookkeeping separate.
6. Verify remote main and tag absence, push main and annotated `v0.1.7`, then
   observe the existing release workflow through actual terminal success.
7. Download hosted and public artifacts; verify source/tag/latest identity,
   both OS smoke evidence and all four asset bytes/digests/sidecars.
8. Run the isolated downloaded public-installer smoke. Preserve any raw PATH
   failure and use only the existing documented reversible nine-tool seam.
9. Close acceptance from actual evidence, archive accepted tasks and journal the
   publication in separate signed bookkeeping commits. Push and verify final
   local/remote state, unchanged release tag and unchanged operator runtime.

The user has authorized publication of all current changes. Do not pause for
another commit/tag approval. Do not upgrade the operator package or daemon.
