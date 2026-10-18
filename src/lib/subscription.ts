import type Stripe from 'stripe';

export function subscriptionFields(subscription: Stripe.Subscription, prices: { starter?: string; pro?: string }) {
  const workspace = subscription.metadata.workspace_id;
  if (!workspace) throw new Error('Subscription has no workspace mapping.');
  const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const price = subscription.items.data[0]?.price.id;
  const plan = price && price === prices.pro ? 'pro' : price && price === prices.starter ? 'starter' : 'free';
  if (plan === 'free' && ['active', 'trialing'].includes(subscription.status)) throw new Error('Subscription price is not configured.');
  return { target_workspace: workspace, customer_id: customer, subscription_id: subscription.id, new_status: subscription.status, new_plan: plan };
}

export function workspaceSubscription(subscriptions: Stripe.Subscription[], workspace: { id: string; stripe_subscription_id?: string | null }) {
  const mapped = subscriptions.filter(s => s.metadata.workspace_id === workspace.id);
  return mapped.find(s => ['active', 'trialing'].includes(s.status))
    || mapped.find(s => ['past_due', 'unpaid', 'paused', 'incomplete'].includes(s.status))
    || mapped.find(s => s.id === workspace.stripe_subscription_id)
    || mapped[0];
}
