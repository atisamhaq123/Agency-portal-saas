import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { adminDb, ownerContext } from '@/lib/server';
import { reconcileBilling } from '@/lib/billing';
export async function POST(request: Request) {
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL;
    if (!origin || request.headers.get('origin') !== new URL(origin).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    const { workspace, user } = await ownerContext();
    if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Stripe billing has not been configured yet.' }, { status: 503 });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); const { plan } = await request.json();
    if (plan === 'sync') {
      await reconcileBilling(stripe, workspace);
      return NextResponse.json({ synced: true });
    }
    if (plan === 'portal') {
      if (!workspace.stripe_customer_id) return NextResponse.json({ error: 'Choose a plan before opening the billing portal.' }, { status: 400 });
      const session = await stripe.billingPortal.sessions.create({ customer: workspace.stripe_customer_id, return_url: `${origin}/?billing=success` });
      return NextResponse.json({ url: session.url });
    }
    if (plan !== 'starter' && plan !== 'pro') return NextResponse.json({ error: 'Choose a valid plan.' }, { status: 400 });
    const subscription = await reconcileBilling(stripe, workspace);
    const price = plan === 'starter' ? process.env.STRIPE_STARTER_PRICE_ID : process.env.STRIPE_PRO_PRICE_ID;
    if (!price) return NextResponse.json({ error: 'The selected Stripe price is not configured.' }, { status: 503 });
    if (subscription && ['active', 'trialing'].includes(subscription.status)) {
      if (subscription.items.data.length !== 1) return NextResponse.json({ error: 'Manage this subscription through Manage billing.' }, { status: 409 });
      const item = subscription.items.data[0];
      if (item.price.id === price) return NextResponse.json({ error: 'This is already your current plan.' }, { status: 409 });
      const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      const session = await stripe.billingPortal.sessions.create({
        customer,
        return_url: `${origin}/?billing=success`,
        flow_data: {
          type: 'subscription_update_confirm',
          subscription_update_confirm: { subscription: subscription.id, items: [{ id: item.id, price, quantity: item.quantity || 1 }] },
          after_completion: { type: 'redirect', redirect: { return_url: `${origin}/?billing=success` } },
        },
      });
      return NextResponse.json({ url: session.url });
    }
    if (['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(subscription?.status || workspace.subscription_status)) return NextResponse.json({ error: 'Manage your existing subscription in the billing portal.' }, { status: 409 });
    let customer = workspace.stripe_customer_id;
    if (!customer) { const created = await stripe.customers.create({ email: user.email, name: workspace.name, metadata: { workspace_id: workspace.id } }, { idempotencyKey: `workspace-customer-${workspace.id}` }); customer = created.id; const { error } = await adminDb().from('workspaces').update({ stripe_customer_id: customer }).eq('id', workspace.id); if (error) throw error; }
    const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer, line_items: [{ price, quantity: 1 }], client_reference_id: workspace.id, subscription_data: { metadata: { workspace_id: workspace.id } }, success_url: `${origin}/?billing=success`, cancel_url: `${origin}/?billing=cancelled`, allow_promotion_codes: true }, { idempotencyKey: `checkout-${workspace.id}-${plan}-${Math.floor(Date.now() / 3600000)}` });
    return NextResponse.json({ url: session.url });
  } catch (e) { const message = e instanceof Error ? e.message : 'Billing request failed'; const unauthorized = /Sign in|Only workspace owners/.test(message); console.error('Billing request failed:', unauthorized ? message : 'Stripe or database request failed'); return NextResponse.json({ error: unauthorized ? message : 'Could not open billing. Please check your Stripe configuration and try again.' }, { status: unauthorized ? 403 : 500 }); }
}
