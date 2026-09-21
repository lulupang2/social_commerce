# Listing image recovery

The Go API owns cleanup for private `listing-images` objects and image metadata.
No browser, mobile client, worker, or Storage policy is allowed to repair these rows directly.

## Runtime owner and schedule

`listingimages.Register` starts one recovery loop inside each configured Go API process.
The first sweep runs at API startup and subsequent sweeps run every 5 minutes.
The loop is disabled when Storage is intentionally unconfigured, and it is cancelled during
Fiber pre-shutdown.

Normal execution starts recovery automatically:

```bash
cd apps/api
go run ./cmd/api --env-file /path/to/private.env
```

There is no public recovery HTTP endpoint. The isolated database verification command is:

```bash
bash ops/nhn-rocky/test-listings-database.sh
```

That script must use its dedicated disposable Compose project and refuses to reuse existing
resources.

## State transitions and cleanup

Recovery uses the existing image state machine; it does not change the HTTP contract.

- Expired `pending_upload` rows become `upload_failed`.
- `upload_failed` and `deleting` rows older than the 5 minute grace period are candidates.
- The API deletes the exact private Storage path. Storage 404 means cleanup already happened
  and is treated as success.
- Metadata is deleted only after object deletion succeeds or returns 404.
- A Storage failure leaves metadata in place for the next sweep.
- A database failure after object deletion also leaves state in place. The next sweep retries
  the object delete; a 404 is success, so metadata can then be removed.

The sweep is bounded to 100 candidates per run. Old failed/deleting rows therefore remain
retryable but are not intended to accumulate without bound while Storage and PostgreSQL are
healthy.

## Idempotency and concurrency

Each object path is immutable and scoped as:

`<member_uuid>/<listing_uuid>/<image_uuid>`

Recovery always operates under a transaction-local member context so image RLS remains
effective and one member context cannot leak to another pooled connection. Final metadata
cleanup is state-gated to `upload_failed` or `deleting`; concurrent or repeated sweeps can
safely observe the same candidate. Deleting an already absent object is successful.

Request-side cleanup uses a short detached context after an upload/delete/replacement side
effect. This prevents client cancellation from immediately abandoning required cleanup.
Anything that still cannot finish is left in a recoverable state for the periodic sweep.

## Observation

The API emits structured recovery logs without service-role credentials or raw object bytes:

- `listing_image_recovery_sweep`: `scanned`, `cleaned`, `deferred`
- `listing_image_recovery_failed`: error plus the same counters

Database operators can observe backlog with a privileged, read-only query such as:

```sql
SELECT state, count(*) AS rows, min(updated_at) AS oldest
FROM summergear_app.listing_images
WHERE state IN ('pending_upload', 'upload_failed', 'deleting')
GROUP BY state
ORDER BY state;
```

A growing `upload_failed`/`deleting` count or old `updated_at` values while sweeps report
`deferred` indicates Storage or database cleanup needs investigation. Do not log service-role
keys or signed URL tokens while debugging.
