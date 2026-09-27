# Existing preview: Toss TEST deployment (2026-09-23)

Target: https://sg.jisung.lol on `nhn-rocky`, Compose project
`summergear-preview`.

This deployment uses the current non-production PostgreSQL fixture, whose
marker is `summergear-foundation-fixture-v1`. It is not a Supabase test
environment. The separate `signal-archive` services and their configuration
were inspected as healthy and were not changed.

## Baseline, secrets, and backups

- Deployment source: `/home/rocky/projects/summergear-toss-20260922`.
  It contains the workspace's existing uncommitted commerce work. No commit or
  remote push was made.
- The private runtime input remains
  `/home/rocky/.config/summergear/test.env` with mode `0600`. Only a complete,
  paired Toss **test** key set is accepted by API and worker startup. Values
  were never printed or baked into images.
- Connectivity/auth preflight was limited to a nonexistent payment lookup,
  which received Toss `404 NOT_FOUND_PAYMENT`. That proves connectivity and
  test-key authorization only; it is not a payment validation.
- Backups were written before the change and immediately before deployment:
  `/home/rocky/.local/state/summergear/backups/before-toss-20260922T103134Z`
  (`884d9ba00a7623e7da76d081a6599d37bef2b4316c16727628c99dc75775149a`), and
  `/home/rocky/.local/state/summergear/backups/predeploy-toss-20260923T174708Z`
  (`e17e5fc06fa25fd8c6b9effc14a99058bc68a8f094a83a62cd1874982b733c8b`).
  Both are custom PostgreSQL archives with image/migration/rollback records.
- Migration state before deployment was recorded in the backup. Current app
  migrations are `0007_go_foundation` through `0015_toss_test`; `0015` was
  applied exactly once by the dedicated migration image.

## Deployed images and order

| Component | Image ID |
| --- | --- |
| API | `summergear-api:toss-20260922-r3` / `sha256:da80847035432152a9b228b568366cff42f13936cb64adbf98580544058133ec` |
| Worker | `summergear-worker:toss-20260922-r3` / `sha256:00779a5c38b7d12e4b9dfa908c7544e0b7efec7cce7eabefe961b860b6e5ab23` |
| Migration | `summergear-migration:toss-20260922` / `sha256:c82c5cfb13e37bc19b4bffb484549e81d82ecd0a4dab9337d87acf97ef4c2316` |
| Web | `summergear-web:toss-20260922-r3` / `sha256:929d3194e54f55a4c94e1de758be39a98d1dbcf81fa6e6d134e78f4c1107ca77` |

Deployment order was: final backup and image record, one migration run,
API/worker startup and readiness, then web/gateway connection. The public
`/health/ready` endpoint returns `{"status":"ready"}`. The later `r3` change
only recreated web/gateway to fix the payment-confirmation CSS; it did not
rerun migrations or replace API/worker.

The immediately preceding styled-web image is
`summergear-web:toss-20260922-r2` /
`sha256:92b9f75ed07d8868af7f525e26ee853b2af0886f4cce91ff6af007b43c2cd5a3`.
The original baseline image IDs and rollback instructions are in the first
backup. Application rollback may reuse a compatible prior app image without
reversing a migration. Database recovery is separate: stop writers, restore
the custom archive to a new isolated database, verify marker/roles/data, then
change connections. A database restore cannot reverse a completed Toss action.
Restore rehearsal was not run.

Before the webhook hardening rollout, another custom archive and exact image,
migration, and rollback record was written to
`/home/rocky/.local/state/summergear/backups/predeploy-webhook-20260922T193242Z`.
Its database SHA-256 is
`ae71c07a9b45fa8ac8744d9da510d0cf95869c7947f3fa4086b20dd76afa20a2`.
No migration changed. Compose configuration was checked, then only API and
worker were recreated; web, gateway, PostgreSQL, volumes, rollback images, and
the separate `signal-archive` service were preserved. Public readiness returned
`{"status":"ready"}` after rollout.

## Contract and UI change

- The API/worker use Toss test keys only, keep them server-side, use the
  `toss_test` provider tag, and reject live, mixed, or incomplete key pairs.
- The confirmation page loads Toss Payments v2 using buyer-specific public
  configuration. Callback data is validated against the stored order. Failed
  or unknown results do not become approved by browser input alone.
- Full buyer cancellation is CSRF-protected. It creates a durable refund
  intent, uses a provider idempotency key, and the worker reconciles pending
  approval/cancellation work.
- The CSS fix adds an order route viewport, a centered payment card, clear
  success/error/cancel states, and an explicit hidden-widget selector. The
  cancellation screen was checked in the deployed browser after the `r3`
  rollout; the raw default controls and leftover widget line are gone.

## Verification results

The following were executed against real Toss **test** services, not the old
shared fixture preview gateway:

| Scenario | Result |
| --- | --- |
| Quick-transfer test payment approval | Passed. Toss lookup returned `DONE`, matching the stored order and KRW 1,000 amount; the database recorded `confirmed`, approved `toss_test`, consumed reservation, and seller/buyer separation. |
| Full cancellation | Passed. Toss lookup returned `CANCELED`, remaining balance `0`, and one cancellation; the database recorded completed refund, released reservation, and restored inventory. |
| Duplicate cancellation | Passed at provider level. Repeating the same idempotency key returned `CANCELED`; no second cancellation was created. Service terminal-state short-circuiting is additionally covered by automated tests. |
| User-cancelled payment callback | Passed. Toss returned `PAY_PROCESS_CANCELED`; no payment attempt was approved. Expiry worker cancellation released the reservation and restored stock. |
| Result reconciliation | Passed for both approved and cancelled payment by safe provider lookup, compared with stored order/refund/inventory state. |
| Deployed webhook mock delivery | Passed. Two POSTs with the same synthetic transmission ID both returned 200, produced one event row, and worker provider lookup marked it processed and verified without reverting the cancelled order. This was not an event sent by Toss. |

Automated checks passed: local `pnpm typecheck`, web lint, web test (24), web
build, and domain tests (13); remote Linux Go unit/vet/integration compilation,
isolated fixture database check, Compose config, and production Docker builds.
The `r3` CSS selector change passed web lint and its production Docker build.

## Remaining limits

- This remains a PostgreSQL fixture preview, not a real Supabase test project.
  Supabase Storage/RLS service integration, real OAuth, and mobile WebView
  flows are unverified.
- Card-method testing reached the KB Card authentication screen for isolated
  order `525c54d8-07fa-4c8d-9050-2a660271753f`. Approval, lookup, full
  cancellation, and their DB comparison remain unverified until the user
  completes cardholder authentication in the retained Codex browser tab.
- Real provider webhook delivery remains unverified. The configured key pair
  was classified without printing values and contains Toss's public `_docs_`
  test key, whose merchant is not owned by the user's Developer Center account.
  Replace the server file with a paired Developer Center TEST client/secret key
  (keeping mode `0600`) before registering
  `https://sg.jisung.lol/api/v1/payments/toss/webhook` for
  `PAYMENT_STATUS_CHANGED`.
- Seller payout is outside scope. No live key, actual charge, production
  deployment, or remote Git push occurred.
- Toss test-mode dev buyers are isolated per login; losing the test cookie also
  loses access to that buyer's prior order in the development-login flow.
- Docker build cache (3.137GB) and unused Go verification images had been cleared before this follow-up.
  After building the r3 API/worker images, nhn-rocky has about 2.5GB free (88% used);
  active images, rollback images, and volumes were kept.

References: [SDK](https://docs.tosspayments.com/sdk/v2/js/payment-widget),
[API](https://docs.tosspayments.com/reference).
