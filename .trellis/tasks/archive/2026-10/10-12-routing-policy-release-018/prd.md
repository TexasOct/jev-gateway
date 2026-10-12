# Repair legacy workflow editing and publish 0.1.8

## Goal

Restore validation and saving for legacy wrapped strategies with an optional global policy; verify migration and publish stable 0.1.8.

## Requirements

- Restore workflow validation and saving for valid wrapped strategy catalogs whose top-level `policy` is absent or null, including migration from an existing version-1 overlay.
- Preserve each workflow's own policy, selected models, overrides, and isolation from other workflows. Saving must leave baseline configuration bytes unchanged, and the resulting state must survive reload.
- Keep malformed explicit global policies invalid. Compact strategy catalogs must still provide their required global policy.
- Publish stable 0.1.8 through the existing signed-tag release workflow, verify its public assets and isolated installer, and record task completion.
- Preserve the operator's running 0.1.7 installation, configuration, credentials, and records. All write-path verification uses synthetic isolated homes.

## Acceptance Criteria

- [x] A1: A regression reproduces the legacy missing-policy failure before the fix and passes afterward for absent and null global policies.
- [x] A2: Invalid explicit policies and compact catalogs without a required policy remain rejected.
- [x] A3: API validation, apply, and reload work after v1-to-v2 migration; baseline bytes, unselected workflows, model selection, and override boundaries are preserved.
- [x] A4: Required backend, type, frontend, build, release validation, and isolated macOS wheel checks pass on the candidate; independent review accepts the frozen source.
- [x] A5: Version records agree on 0.1.8 and third-party dependency records are unchanged.
- [x] A6: Signed product commits and annotated v0.1.8 tag are published; the hosted build and both OS wheel checks succeed.
- [x] A7: Four pinned public assets match their checksums and hosted bytes, and the public installer passes isolated acceptance.
- [ ] A8: Task/archive/journal records are truthful; local and remote main agree, prior release refs remain unchanged, and the operator installation is untouched.

## Notes

- User authorization: "请帮我进行修复，然后发布0.1.8", following the concrete diagnosis and repair-task proposal. This authorizes task creation, implementation, verification, signed commits, tag/push, and publication.
- Reproduction returned HTTP 400 with `baseline tier_models has missing tiers or unknown tiers: complex, simple, standard.` from an otherwise valid installed 0.1.7 configuration.
