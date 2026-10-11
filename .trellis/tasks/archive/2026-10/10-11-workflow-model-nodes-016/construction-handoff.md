Workflow completed with 6 child run(s). Return: {
  "state": "needs-recovery",
  "stage": "state-check-1",
  "error": "Error: Run 'state-check-1' failed: Run fan-out: 6/64 used, 58 remaining\nUpstream HTTP/2 stream failed",
  "completed": [
    {
      "stage": "models",
      "task": ".trellis/tasks/10-11-model-optional-016",
      "implementationRunId": "fd4f7796-1c07-4dff-9fe4-33a511bbb5ae",
      "reviewRunId": "b12a7064-4a9e-41d9-ae0d-850cb91777ec",
      "reviewOutput": "/Users/texas/Workspace/jev-gateway/.trellis/tasks/10-11-model-optional-016/check-handoff.md",
      "reviewReference": "/Users/texas/Workspace/jev-gateway/.trellis/tasks/10-11-model-optional-016/check-handoff.md"
    }
  ],
  "remaining": "Preserve source/evidence and inspect this exact native lane; no silent execution-runner fallback."
} Emitted: {
  "completedStage": "models",
  "verdict": "PASS for stage scope",
  "remaining": "A8 requires parent publication",
  "review": {
    "stage": "models",
    "task": ".trellis/tasks/10-11-model-optional-016",
    "implementationRunId": "fd4f7796-1c07-4dff-9fe4-33a511bbb5ae",
    "reviewRunId": "b12a7064-4a9e-41d9-ae0d-850cb91777ec",
    "reviewOutput": "/Users/texas/Workspace/jev-gateway/.trellis/tasks/10-11-model-optional-016/check-handoff.md",
    "reviewReference": "/Users/texas/Workspace/jev-gateway/.trellis/tasks/10-11-model-optional-016/check-handoff.md"
  }
} Trace: 12 event(s).