# Bulk research deployment

The shortlist's **Run research on selected** action queues up to 200 shows. It uses saved research prompts and generates the recommended angle's pitch sequence. Completed research, archived shows, active runs, and shows requiring relationship review are skipped. It does not replace campaign drafts or send emails. Generated sequences are stored in the batch and available under **View draft**.

## Deployment

1. Apply `20261031000500_bulk_research.sql`.
2. Set a randomly generated `RESEARCH_TICK_SECRET` for the edge functions.
3. Deploy `workspace-client-shortlist` and `client-research-tick` with the checked-in JWT settings.
4. Add Vault secrets `research_tick_url` (the full URL of the `client-research-tick` function) and `research_tick_secret` (the same secret as the edge environment). Use the secure deployment secret mechanism; do not commit the values.
5. Deploy the frontend. Verify one selected show reaches research, pitch, and completed, and its saved draft can be opened after a page reload.

The migration installs a one-minute cron. Each tick claims at most one job, serializes global worker concurrency, and handles one research invocation or pitch generation. Research continuation tokens persist across ticks. Workers revalidate the initiating user's current access, original credential epoch, subscription, and each show's relationship restrictions. No user bearer token is stored.

A worker that stops reporting for ten minutes becomes failed and requires an explicit retry. Completed stage outputs remain in the existing research document. Retry resumes that job's phase; a pitch failure does not rerun research. Batch results remain separate from existing campaign drafts. The batch-history selector retains previews from the most recent 1,000 jobs. Job transitions refresh the shortlist. The pitch editor reuses a completed batch draft when its research run still matches the current report, preserving existing editor drafts. Each batch invocation performs at most one new model call; pitch outputs checkpoint before yielding, and completed research is reconciled by run identity after a lost response. The executor saves the final pitch before responding, so a lost response does not downgrade completed work. Model calls share a 110-second invocation deadline within the worker’s 140-second timeout.

## Verification

- App TypeScript and edge-function type checks.
- Shortlist and batch UI tests cover selected row IDs, explicit start, persisted progress, draft preview, and retry targeting.
- SQL grammar and security-definer grant checks.
- Live cron/provider execution requires deployment and is not covered by these local checks.

## Production activation — 2026-10-29

- Applied and recorded migration `20261031000500` after a successful rollback rehearsal.
- Deployed `workspace-client-shortlist` version 111 (JWT verification enabled) and `client-research-tick` version 1 (shared-secret authentication).
- Configured the worker environment secret and both Vault schedule entries; no secret values are stored in this document.
- Verified public/authenticated database roles cannot read the queue or claim jobs. A transactional fixture verified one claim succeeds and a second simultaneous active claim is refused; the fixture was rolled back.
- Worker probes returned 401 without its secret and 200 with an idle queue when authorized.
- The one-minute cron executed successfully at 11:45 UTC; its worker HTTP response was 200 without a timeout.
- Confirmed the deployed frontend client bundle contains the bulk-research action.
- No real podcast research or email sending was triggered. Real provider completion remains to be observed on the first user-started batch.
- Added this migration to the SQL grammar check's explicit input list (128 files validated).
