# Synthetic FLAIR OS

A stand-in for Tyler's FLAIR OS MCP endpoint so the Command Center mirror can be built and tested before a real key exists. Plain Node, no dependencies.

- `server.mjs`: JSON-RPC over HTTP at `/api/mcp` with the tool names from Tyler's answers (2026-11-15). Three throwaway bearer keys: `cc-mock-key` carries the `command_center` scope (the nine read tools only), `cc-write-key` carries `command_center_write` (reads plus the eight write tools of the two-way plan: create/update deal, update contact, add activity, create/complete task, upsert meeting note, check outreach eligibility) and `full-mock-key` carries everything. Write tools follow the real input schemas listed from tools/list on 2026-11-17 (flat camelCase, stageSlug enum, dedupe by email or company unless forceCreate, `agent` recorded as `source_agent`); their response shapes are a guess. Out-of-scope calls answer JSON-RPC error `-32001`, missing key answers 401. Seed: 14 deals across all ten stages plus one parked and one nurture, 10 tasks, 4 clients, activities, two profiles.
- Test hooks (only with `MOCK_TEST_HOOKS=1`): `POST /__test/reset`, `GET /__test/calls`, `POST /__test/calls/clear`, `POST /__test/mutate {dealId, patch}`, `POST /__test/mutate-task {taskId, patch}`, `POST /__test/remove {dealId}`, `POST /__test/add-deal`, `GET /__test/state`, `GET /__test/deal?id=`, `GET /__test/deals`, `GET /__test/activities?dealId=`, `GET /__test/tasks?dealId=`.
- `test-mirror.mjs`: drives a running Command Center against the mock and checks the database, the log, the guards, and the allowlist. Writes `docs/integrations/results/mirror-test-results.json`.
- `test-writes.mjs`: drives a WRITE-ENABLED Command Center (`FLAIR_OS_MCP_KEY=cc-write-key FLAIR_OS_WRITE_ENABLED=1`, port 3007, launch config `command-center-flairos-write`) and checks that edits, notes, tasks, merges, adds and new deals land in the mock first and mirror back, with the `CommandCenter` agent on every call. Writes `docs/integrations/results/writes-test-results.json`. Refuses any MOCK_URL that is not local.

Run order and the full switch-over notes: `docs/integrations/FLAIR_OS_MIRROR_BUILD.md`.

The field names here are a best guess shaped from Tyler's description. When a real response is available, adjust the seed to match it and rerun the test.

Seed note (v2): deal 15 is a second "Liquid Death" under another contact, so the board's duplicate marker and the lane's matcher have a real case. The test creates its own Command Center-only leads (notes starting `v2test`) and removes them.
