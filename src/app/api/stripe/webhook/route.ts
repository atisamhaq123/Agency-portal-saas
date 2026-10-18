import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { syncStripeSubscription } from '@/lib/billing';
export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), request.headers.get('stripe-signature') || '', process.env.STRIPE_WEBHOOK_SECRET); } catch { return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 }); }
  if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    try {
      const object = event.data.object as Stripe.Subscription;
      // Fetch current Stripe state, rather than trusting a potentially delayed event payload.
      const subscription = await stripe.subscriptions.retrieve(object.id);
      await syncStripeSubscription(subscription, event);
    } catch (error) {
      console.error('Subscription synchronization failed:', error instanceof Error ? error.message : 'Database request failed');
      return NextResponse.json({ error: 'Subscription synchronization failed. Retry this event.' }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}
