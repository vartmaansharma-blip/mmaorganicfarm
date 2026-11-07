# Combined review from this chat

The user asked to merge the completed work first for a review. This branch includes only completed reviews #54, #56, #57 and #58, with their histories preserved. It excludes older unrelated drafts and the unfinished follow-up branch `codex/remaining-chat-work`.

| Review | Included head | Scope |
| --- | --- | --- |
| #54 | 54369c1ba661d3459f4bda7ca7a58e7836efe6c7 | Today delivery controls, notifications, driver/farm consistency |
| #56 | 1f026b7a3501c18994116cd5e08f3b56f18c4621 | Location, both cart groups, account menu and two-sided referrals |
| #57 | 25a152adba7db55c499d90c1571f0371bf3c43ba | Compact synchronized Week/Month calendar and dated checkout |
| #58 | a1b92b34f6c2ec9818e819172821ffcc3d38b15a | Selected latte artwork, smooth reversible reveal, fixed milk/glass |

The integration resolves test-fixture overlaps by retaining all calendar, referral and delivery handlers. It preserves the milk, paneer and ghee product pages, current prices/fees and bottle modes, existing checkout guard and farm systems.

## Installation and release

A code merge does not install database functions. The local SQL files under `docs/verification/` remain outside deployable migration history and have not been applied to production. Referral and master-calendar features fail closed when their schema is unavailable. Today additions remain uncharged/unconfirmed; stock and payment reservations beyond this phase remain follow-up work. No merchant settings, production records or real charges are changed.

Main currently auto-publishes through Vercel. `vercel.json` holds automatic main deployments (`git.deploymentEnabled.main=false`) so this approved merge does not become an unapproved live release. Feature previews continue. Remove the hold or explicitly deploy/promote only with the applicable production and schema approval, after verifying the same release candidate. The current production commit is recorded separately from the merge SHA.

Reference: https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled

## Verification

Typecheck, lint, build, application unit tests and the combined customer, shop, hero and local database journeys must pass on this integration. Individual PR checks alone are not evidence of combined acceptance. The broader unfinished master-brief tasks remain on the follow-up branch and are not represented as completed by this merge.
