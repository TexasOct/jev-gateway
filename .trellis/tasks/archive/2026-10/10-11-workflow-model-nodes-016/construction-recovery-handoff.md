Workflow completed with 8 child run(s). Return: {
  "state": "needs-recovery",
  "stage": "integration-implement",
  "error": "Error: Run 'integration-implement' failed: Run fan-out: 8/64 used, 56 remaining\nSubagent timed out after 7200000ms.",
  "completed": [
    {
      "stage": "models",
      "task": ".trellis/tasks/10-11-model-optional-016",
      "implementationRunId": "fd4f7796-1c07-4dff-9fe4-33a511bbb5ae",
      "reviewRunId": "b12a7064-4a9e-41d9-ae0d-850cb91777ec",
      "reviewOutput": "/Users/texas/Workspace/jev-gateway/.trellis/tasks/10-11-model-optional-016/check-handoff.md"
    },
    {
      "stage": "state",
      "task": ".trellis/tasks/10-11-strategy-state-016",
      "implementationRunId": "d34c22e7-0e61-40de-96d9-8114ed8e5188",
      "reviewRunId": "50471859-d5b2-4574-9e2c-3924b342b756",
      "reviewOutput": "/Users/texas/Workspace/jev-gateway/.trellis/tasks/10-11-strategy-state-016/check-recovery-handoff.md"
    },
    {
      "stage": "controls",
      "task": ".trellis/tasks/10-11-workflow-controls-016",
  … Emitted: {
  "completedStage": "state",
  "verdict": "PASS for durable/API scope",
  "review": {
    "stage": "state",
    "task": ".trellis/tasks/10-11-strategy-state-016",
    "implementationRunId": "d34c22e7-0e61-40de-96d9-8114ed8e5188",
    "reviewRunId": "50471859-d5b2-4574-9e2c-3924b342b756",
    "reviewOutput": "/Users/texas/Workspace/jev-gateway/.trellis/tasks/10-11-strategy-state-016/check-recovery-handoff.md"
  }
}, {
  "completedStage": "controls",
  "verdict": "PASS for stage scope",
  "review": {
    "stage": "controls",
    "task": ".trellis/tasks/10-11-workflow-controls-016",
    "implementationRunId": "a4b3c6da-15d6-4d57-9c5f-924649500453",
    "reviewRunId": "7228e8fe-7a8c-47ff-95d3-3db006f7ab0e",
    "reviewOutput": "/Users/texas/Workspace/jev-gateway/.trellis/tasks/10-11-workflow-controls-016/check-handoff-recheck-2.md"
  }
} (truncated; full return value and emits: /var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/pi-subagents-uid-501/async-subagent-runs/b53f37fd-4111-4604-98cf-42ebbfc9f9ed/status.json (workflow.value, workflow.emits)) Trace: 16 event(s).