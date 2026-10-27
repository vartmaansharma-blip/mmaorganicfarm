# Daily milk intake

This is the next independent farm feature while GPS automation is paused: record physical milk receipts before building recipes, production allocation and finished-stock accounting.

The manager/owner workspace is `/farm/production`, reachable through Milk intake in the existing farm navigation. Drivers cannot open it. Staff select the intake day and enter the actual IST receipt time, source, unique receipt/batch reference, received litres, accepted litres, handling state, location and measured quality observations. Accepted quantity is not defaulted to received quantity. Rejected/unusable litres are the exact difference and require an explanation when positive.

The day’s totals include recorded receipts and exclude explicitly voided ones. They do not establish sellable inventory, physical milk still on hand, a production yield or a food-quality certification. Order capacity, paid obligations, driver load and accounting remain separate records. No generic recipe or farm yield is assumed.

Corrections require the expected version and a reason. Every change preserves before/after evidence and the actual staff actor; stale concurrent edits cannot overwrite a newer version. A void keeps the receipt and all evidence while excluding its quantities from intake totals. It cannot rewrite or erase history. The intake day stays fixed on correction; a wrongly dated receipt is voided and entered on the correct day with a distinct audited receipt. Duplicate active source/reference identities on the same day are rejected case-insensitively. Retries reuse the same command key and cannot create another receipt/event/notification.

Receipt pages contain fifty rows and full-day totals. Evidence loads in pages of twenty, so older revisions remain reviewable rather than silently truncating history. Empty and missing-schema states do not invent supply. Errors preserve the entered form values and report through the shared notification system.

`supabase/migrations/20261027110513_daily_milk_intake.sql` creates the receipt and immutable evidence tables, RPC-only access and manager role checks. It follows the farm-notification migration and emits one management update per committed intake event. No production intake data is seeded or inferred.

Native database checks cover measurements, date/time validation, rejection explanations, active receipt uniqueness, permissions, idempotency, concurrent corrections, before/after history, void totals and role-scoped notifications and viewer dismissals. Local Chromium/WebKit journeys record, correct and void a synthetic intake and inspect its history. This proves the implementation with the stated test adapter, not a physical collection or hosted production write.

Remaining production stages are farm-confirmed recipes/yields, milk allocation, production batches, finished-stock movements and planning from paid demand. They are not claimed by this receipt ledger.
