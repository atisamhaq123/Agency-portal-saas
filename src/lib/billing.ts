import 'server-only';
import type Stripe from 'stripe';
import { adminDb } from '@/lib/server';
import { subscriptionFields, workspaceSubscription } from '@/lib/subscription';

export async function syncStripeSubscription(subscription: Stripe.Subscription, event = { id: `reconcile-${crypto.randomUUID()}`, created: Math.floor(Date.now() / 1000) }) {
  const fields = subscriptionFields(subscription, { starter: process.env.STRIPE_STARTER_PRICE_ID, pro: process.env.STRIPE_PRO_PRICE_ID });
  const { error } = await adminDb().rpc('sync_subscription', { ...fields, event_id: event.id, event_time: event.created });
  if (error) throw error;
}

export async function reconcileBilling(stripe: Stripe, workspace: { id: string; stripe_customer_id?: string | null; stripe_subscription_id?: string | null }) {
  if (!workspace.stripe_customer_id) return null;
  const subscriptions: Stripe.Subscription[] = [];
  for await (const subscription of stripe.subscriptions.list({ customer: workspace.stripe_customer_id, status: 'all', limit: 100 })) subscriptions.push(subscription);
  const subscription = workspaceSubscription(subscriptions, workspace);
  if (subscription) await syncStripeSubscription(subscription);
  return subscription;
}
