# Synthetic FLAIR OS

A stand-in for Tyler's FLAIR OS MCP endpoint so the Command Center mirror can be built and tested before a real key exists. Plain Node, no dependencies.

- `server.mjs`: JSON-RPC over HTTP at `/api/mcp` with the tool names from Tyler's answers (2026-11-15). Two throwaway bearer keys: `cc-mock-key` carries the `command_center` scope (the nine read tools only) and `full-mock-key` carries everything. Out-of-scope calls answer JSON-RPC error `-32001`, missing key answers 401. Seed: 14 deals across all ten stages plus one parked and one nurture, 10 tasks, 4 clients, activities, two profiles.
- Test hooks (only with `MOCK_TEST_HOOKS=1`): `POST /__test/reset`, `GET /__test/calls`, `POST /__test/calls/clear`, `POST /__test/mutate {dealId, patch}`, `POST /__test/mutate-task {taskId, patch}`, `POST /__test/remove {dealId}`, `POST /__test/add-deal`, `GET /__test/state`.
- `test-mirror.mjs`: drives a running Command Center against the mock and checks the database, the log, the guards, and the allowlist. Writes `docs/integrations/results/mirror-test-results.json`.

Run order and the full switch-over notes: `docs/integrations/FLAIR_OS_MIRROR_BUILD.md`.

The field names here are a best guess shaped from Tyler's description. When a real response is available, adjust the seed to match it and rerun the test.

Seed note (v2): deal 15 is a second "Liquid Death" under another contact, so the board's duplicate marker and the lane's matcher have a real case. The test creates its own Command Center-only leads (notes starting `v2test`) and removes them.
