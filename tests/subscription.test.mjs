import test from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionFields, workspaceSubscription } from '../src/lib/subscription.ts';

const subscription = (overrides = {}) => ({ id: 'sub_paid', customer: 'cus_owner', metadata: { workspace_id: 'workspace_owner' }, status: 'active', items: { data: [{ price: { id: 'price_starter' } }] }, ...overrides });
const prices = { starter: 'price_starter', pro: 'price_pro' };

test('paid Starter and Pro prices map to their workspace entitlements', () => {
  assert.equal(subscriptionFields(subscription(), prices).new_plan, 'starter');
  assert.equal(subscriptionFields(subscription({ items: { data: [{ price: { id: 'price_pro' } }] } }), prices).new_plan, 'pro');
  assert.equal(subscriptionFields(subscription({ customer: { id: 'cus_expanded' } }), prices).customer_id, 'cus_expanded');
});
test('unmapped workspaces and unknown active prices cannot grant entitlements', () => {
  assert.throws(() => subscriptionFields(subscription({ metadata: {} }), prices), /workspace mapping/);
  assert.throws(() => subscriptionFields(subscription(), {}), /price is not configured/);
  assert.throws(() => subscriptionFields(subscription({ items: { data: [] } }), prices), /price is not configured/);
});
test('reconciliation excludes subscriptions belonging to other workspaces', () => {
  assert.equal(workspaceSubscription([subscription()], { id: 'another_workspace' }), undefined);
});
test('a canceled old subscription cannot override a paid replacement', () => {
  const canceled = subscription({ id: 'sub_old', status: 'canceled' });
  const active = subscription();
  assert.equal(workspaceSubscription([canceled, active], { id: 'workspace_owner', stripe_subscription_id: 'sub_old' }), active);
  assert.equal(workspaceSubscription([canceled], { id: 'workspace_owner', stripe_subscription_id: 'sub_old' }), canceled);
});
test('subscriptions needing payment remain discoverable so checkout does not create a duplicate', () => {
  for (const status of ['past_due', 'unpaid', 'paused', 'incomplete']) {
    const pending = subscription({ status });
    assert.equal(workspaceSubscription([subscription({ status: 'canceled' }), pending], { id: 'workspace_owner' }), pending);
  }
});
