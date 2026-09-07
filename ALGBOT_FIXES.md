# AlgerBot — Fixes applied in this distribution

Applied fixes:

1. Suspended merchants are blocked from public marketplace/storefront browsing and checkout.
2. Approved billing renewals preserve remaining time for active subscriptions and correctly restart lapsed subscriptions from the current time.
3. Checkout tracking codes now use cryptographically secure randomness via Node `crypto.randomInt`.
4. Tracking-code collision handling now verifies every generated candidate before insertion and fails safely after repeated collisions.
5. Removed development-only `.bak` files from the distribution.
6. Removed the local `.env` file from the distribution. Create it from `.env.example` in the target environment.
7. Updated README references from the old `PIVOTCLOUD_DATABASE_URL` / `*.server.ts` names to the current project names.
8. Added `*.bak` to `.gitignore`.

Important merge behavior:

- The included `.env` is intentionally absent.
- Keep the existing production `.env` in your target installation; the supplied merge script does not overwrite it.
- Before deploying, rotate any credentials that may have been exposed in previous copies of the project archive.
