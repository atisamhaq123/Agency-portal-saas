# ClientNest

A small agency client portal built with Next.js App Router, React, TypeScript, Supabase Auth/Postgres/Storage, and Stripe Billing.

## Business use case

ClientNest helps small web, design, and marketing agencies, as well as freelancers, manage client work in one portal. Project updates, shared files, and approval requests often get scattered across email and chat. The portal gives agencies and their clients a shared place to track progress, review deliverables, and record feedback.

For example, a web design agency creates a website project for a client, updates its progress, and uploads design drafts. The client signs in with the assigned email, reviews the files, and either approves them or requests changes with feedback. The agency can then upload a revised deliverable for another review.

- **Agency owners** create projects, track status, upload deliverables, and manage their subscription.
- **Clients** view assigned projects, download files, and approve work or request changes.
- **The SaaS operator** sells subscriptions to agencies through Stripe. Agencies pay for the portal and higher project limits; these payments are separate from what agencies charge their own clients.

The intended business value is less time spent answering status questions, clearer approval records, and a more consistent client experience. The current product supports these workflows without AI; potential future additions include AI-generated progress reports and summaries of client feedback.

## Run locally

Requires Node.js 20.9+ and npm. In this directory:

```sh
npm install
npm run dev
```

Open http://localhost:3000 for the landing page. The workspace lives at `/portal`; `/portal?demo=1` opens the interactive demo, and `/portal?auth=signup` opens account creation. Existing invitation, recovery, and billing query links at the root redirect to the workspace. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

Without Supabase environment variables the workspace opens an interactive demo. Demo project creation, reviews, settings, and progress changes persist in browser localStorage. Sample downloads contain placeholder text; uploads retain file metadata only. Settings lets you switch owner/client views and reset demo data. The workspace selector contains a second sample agency to demonstrate tenant filtering.

## Connect Supabase

1. For a fresh Supabase project, run only `supabase/migrations/001_clientnest.sql` in its SQL editor. This file includes the explicit account-flow changes. Existing databases that already applied the original 001 and account-flow migration 002 need `supabase/upgrades/20261018_collaboration.sql` (if not already applied), followed by `supabase/upgrades/20261019_in_app_notifications.sql`. Run each upgrade once; do not rerun the fresh-install script on an existing database.
2. Copy `.env.example` to `.env.local`. Set the public URL, anon/publishable key, service-role key, and application URL. Never expose the service-role key in a `NEXT_PUBLIC_` variable.
3. Under Authentication → URL Configuration, set the Site URL to your application origin. Allow `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/callback?recovery=1` during development; add equivalent production callbacks before deployment. Keep email confirmation enabled. Configure SMTP for reliable delivery.
4. Restart the dev server after changing environment variables. Choose **I'm an Agency**, create an agency account, and confirm your email. The first authenticated agency workspace request provisions its workspace. Choosing **I'm a Client** never provisions an agency workspace.
5. Create a project using a client's email. Open **Clients > Copy invitation link** and share the link with that client. It prefills the assigned email and targets the agency workspace. Login asks only for email and password; the server detects the account from ownership, verified email, and saved signup type. The agency/client choice appears only when creating an account. The client signs in or creates a client account, then verifies that exact email. Links are shared manually; the app does not send invitation emails. The link itself grants no access. Keep Supabase callback allowlists compatible with the role/workspace query parameters on `/auth/callback` (including password recovery).

Owners create projects, change progress/status, and upload deliverables. Assigned clients approve or request changes with feedback. A reviewed deliverable is immutable; upload a new version as a new deliverable after changes. Each owner has one agency workspace. Invitation links select the assigned agency; without an invitation, login opens the agency owned by the account or the earliest assigned client workspace. Clients without assignments see the client dashboard with zero counts, empty project and file lists, and a Check again button. This does not create a workspace or grant agency permissions. Agency signup intent is saved on the account and used to provision its workspace automatically. Existing owners remain supported, including accounts created before account-type metadata existed. Accounts previously given an automatic workspace retain it; this migration does not delete existing workspaces. A new agency uses a separate agency signup account.

## Project conversations, milestones, and in-app notifications

Open a project to use its conversation and milestones. Agency owners add, complete, and remove milestones; assigned clients can read them. Both participants can post messages. Messages are immutable, stamped with the verified author email, and visible only within assigned projects. Live conversations use Supabase Realtime and update when the other participant sends a message. History is synchronized on connection/reconnection and tab focus, with a 15-second resync for missed events. Message IDs deduplicate send responses and incoming updates. Drafts are preserved, and automatic scrolling follows new messages only while near the bottom. **Refresh updates** remains available for milestones. Existing installations must run `supabase/upgrades/20261019_realtime_messages.sql` once to publish the messages table; fresh installs still run only `001_clientnest.sql`. Demo collaboration is stored only in browser localStorage.

The header bell opens an in-app notification inbox with unread counts, individual read controls, and **Mark all read**. New deliverables, client review decisions, project messages, and milestone creation/completion notify the other participant. Selecting a notification opens its project and marks it read. The inbox refreshes every 30 seconds while the tab is visible, on window focus, and when opened; it also has a manual refresh control.

Notifications are created transactionally in PostgreSQL. Recipient-level row policies require both ownership of the notification and current project access. Clients who lose a project assignment can no longer read its notifications. Only read state can be updated by recipients; notification content cannot be forged from the browser.

No Resend account, custom sending domain, email credentials, or notification cron is needed. Remove any old external scheduler targeting `/api/notifications`. Existing installations should apply `supabase/upgrades/20261019_in_app_notifications.sql` after the collaboration upgrade; it disables the old email trigger/worker and preserves historical outbox records without dispatching them. Fresh installs still use only `supabase/migrations/001_clientnest.sql`. Supabase Auth confirmation and password-reset emails remain part of authentication.

## Connect Stripe

1. Use Stripe test mode initially. Create two recurring monthly prices: Starter ($19/month) and Pro ($49/month), or adjust UI pricing to your chosen prices. Set their price IDs and the secret API key in `.env.local`.
2. Enable Stripe's customer billing portal. Enable subscription updates with price changes and include both Starter and Pro products/prices, then configure cancellation. Active subscribers can select Upgrade to Pro or Switch to Starter on the pricing cards; the app opens Stripe's subscription update confirmation, where the customer reviews prorations and confirms. Only the current plan's button is disabled. New subscribers use Checkout.
3. Register `/api/stripe/webhook` for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Set the signing secret. For local testing, use Stripe CLI:

```sh
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

4. Subscribe through Plans & billing with a test account. Returning from checkout opens billing and checks the authenticated owner's customer subscriptions directly with Stripe before updating the database. Opening Plans & billing also reconciles a missed webhook, and checkout checks existing subscriptions to prevent another purchase while activation is pending. The redirect itself never grants a plan. Keep webhooks configured for renewals, payment failures, and cancellations while the owner is away. Manage payment methods, invoices, cancellation, and upgrades in the Stripe portal.

The free workspace and Starter plan allow five projects; an active/trialing Pro subscription allows fifty. Limits include completed projects. A payment failure removes Pro entitlement after Stripe reports a non-active status; existing projects remain readable. This is an intentionally small v1 with no seats, Stripe Connect, invoice collection on behalf of agencies, or custom domains.

## Security and data

- Row-level security limits owners to their workspace and clients to projects assigned to their verified email.
- Privileged operations use server-side `getUser()`; customer billing requests also verify request origin.
- Database column privileges prevent users from changing subscription status or plan. Project creation serializes workspace limit checks.
- Approval RPC validates the assigned client, required change-request feedback, and review state under a row lock.
- Files are private, limited to 10 MB, and downloadable through short-lived signed URLs. Storage policies validate both workspace and project identifiers.
- Stripe webhooks verify signatures, fetch current subscription state, deduplicate events, and reject older events/customer mismatches.
- Account selection appears only during signup; database ownership and verified email determine permissions. Only explicit agency signups can provision a new workspace. Unassigned clients and legacy accounts without a workspace never receive an agency workspace automatically. Demo mode contains no real customer data and is not authentication.

## Validate and deploy

```sh
npm run typecheck
npm test
npm run build
npm start
```

With a production server running in demo mode, `npm run test:browser` checks the main user workflows and seven mobile views in installed Chrome. Set `CHROME_PATH` for another Chrome installation and `TEST_URL` for another port/origin. Screenshots are written to `artifacts/desktop.png` and `artifacts/mobile.png`. Run `node tests/landing.browser.mjs` against the same demo server to check the landing page, responsive navigation, FAQs, and signup links; it writes landing screenshots to `artifacts/`. Actions such as sign-in, signup, uploads, reviews, downloads, saves, and billing show an animated status and prevent additional interactions until complete. Loading states clear on success and failure.

Deploy to a Next.js-compatible Node host such as Vercel, with the environment variables from `.env.example`. Configure the final application origin in Supabase, `NEXT_PUBLIC_APP_URL`, and Stripe webhooks. Public Supabase environment variables must be present at build time. No live Supabase migration or Stripe configuration is applied automatically by this repository.

Database policy tests use an isolated embedded PostgreSQL instance, with lightweight mocks of Supabase's auth and storage schemas. They do not connect to or modify a hosted database. Hosted authentication/email delivery, Stripe Checkout, and actual private file transfer still require configured service accounts; the demo browser checks do not verify those external integrations.

Implementation references: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Next.js cookies](https://nextjs.org/docs/app/api-reference/functions/cookies), [Stripe Checkout sessions](https://docs.stripe.com/api/checkout/sessions).
