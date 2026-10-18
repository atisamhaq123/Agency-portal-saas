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

Open http://localhost:3000. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

Without Supabase environment variables the app opens an interactive demo. Demo project creation, reviews, settings, and progress changes persist in browser localStorage. Sample downloads contain placeholder text; uploads retain file metadata only. Settings lets you switch owner/client views and reset demo data. The workspace selector contains a second sample agency to demonstrate tenant filtering.

## Connect Supabase

1. Create a Supabase project and run `supabase/migrations/001_clientnest.sql` in its SQL editor.
2. Copy `.env.example` to `.env.local`. Set the public URL, anon/publishable key, service-role key, and application URL. Never expose the service-role key in a `NEXT_PUBLIC_` variable.
3. Under Authentication → URL Configuration, set the Site URL to your application origin. Allow `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/callback?recovery=1` during development; add equivalent production callbacks before deployment. Keep email confirmation enabled. Configure SMTP for reliable delivery.
4. Restart the dev server after changing environment variables. Create an agency account and confirm your email. The first authenticated workspace request provisions its workspace.
5. Create a project using a client's email. Share the application URL with the client. The client signs up and verifies that exact email to see assigned projects. There is no outbound invitation email feature in this version.

Owners create projects, change progress/status, and upload deliverables. Assigned clients approve or request changes with feedback. A reviewed deliverable is immutable; upload a new version as a new deliverable after changes. Each owner has one agency workspace. A client assigned across multiple agencies currently opens the earliest assigned workspace; live workspace selection is a future enhancement.

## Connect Stripe

1. Use Stripe test mode initially. Create two recurring monthly prices: Starter ($19/month) and Pro ($49/month), or adjust UI pricing to your chosen prices. Set their price IDs and the secret API key in `.env.local`.
2. Enable Stripe's customer billing portal. Enable subscription updates with price changes and include both Starter and Pro products/prices, then configure cancellation. Active subscribers can select Upgrade to Pro or Switch to Starter on the pricing cards; the app opens Stripe's subscription update confirmation, where the customer reviews prorations and confirms. Only the current plan's button is disabled. New subscribers use Checkout.
3. Register `/api/stripe/webhook` for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Set the signing secret. For local testing, use Stripe CLI:

```sh
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

4. Subscribe through Plans & billing with a test account. Returning from checkout opens billing and checks the authenticated owner's customer subscriptions directly with Stripe before updating the database. Opening Plans & billing also reconciles a missed webhook, and checkout checks existing subscriptions to prevent another purchase while activation is pending. The redirect itself never grants a plan. Keep webhooks configured for renewals, payment failures, and cancellations while the owner is away. Manage payment methods, invoices, cancellation, and upgrades in the Stripe portal.

The free workspace and Starter plan allow five projects; an active/trialing Pro subscription allows fifty. Limits include completed projects. A payment failure removes Pro entitlement after Stripe reports a non-active status; existing projects remain readable. This is an intentionally small v1 with no seats, Stripe Connect, invoice collection on behalf of agencies, custom domains, or notification emails.

## Security and data

- Row-level security limits owners to their workspace and clients to projects assigned to their verified email.
- Privileged operations use server-side `getUser()`; customer billing requests also verify request origin.
- Database column privileges prevent users from changing subscription status or plan. Project creation serializes workspace limit checks.
- Approval RPC validates the assigned client, required change-request feedback, and review state under a row lock.
- Files are private, limited to 10 MB, and downloadable through short-lived signed URLs. Storage policies validate both workspace and project identifiers.
- Stripe webhooks verify signatures, fetch current subscription state, deduplicate events, and reject older events/customer mismatches.
- New accounts assigned to existing projects become clients; other accounts receive their own agency workspace. Demo mode contains no real customer data and is not authentication.

## Validate and deploy

```sh
npm run typecheck
npm test
npm run build
npm start
```

With a production server running in demo mode, `npm run test:browser` checks the main user workflows and seven mobile views in installed Chrome. Set `CHROME_PATH` for another Chrome installation and `TEST_URL` for another port/origin. Screenshots are written to `artifacts/desktop.png` and `artifacts/mobile.png`.

Deploy to a Next.js-compatible Node host such as Vercel, with the environment variables from `.env.example`. Configure the final application origin in Supabase, `NEXT_PUBLIC_APP_URL`, and Stripe webhooks. Public Supabase environment variables must be present at build time. No live Supabase migration or Stripe configuration is applied automatically by this repository.

Database policy tests use an isolated embedded PostgreSQL instance, with lightweight mocks of Supabase's auth and storage schemas. They do not connect to or modify a hosted database. Hosted authentication/email delivery, Stripe Checkout, and actual private file transfer still require configured service accounts; the demo browser checks do not verify those external integrations.

Implementation references: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Next.js cookies](https://nextjs.org/docs/app/api-reference/functions/cookies), [Stripe Checkout sessions](https://docs.stripe.com/api/checkout/sessions).
