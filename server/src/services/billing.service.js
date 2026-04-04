const env = require('../config/env');
const { query } = require('../config/database');
const planModel = require('../models/plan.model');

let stripe = null;
function getStripe() {
  if (!stripe) {
    if (!env.stripeSecretKey) throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)');
    stripe = require('stripe')(env.stripeSecretKey);
  }
  return stripe;
}

/**
 * Create a Stripe Checkout session for plan upgrade/change
 */
async function createCheckoutSession(userId, planSlug) {
  const s = getStripe();

  // Look up the plan
  const plan = await planModel.findBySlug(planSlug);
  if (!plan) throw new Error('Plan not found');

  // Get the user
  const { rows } = await query('SELECT id, email, first_name, last_name, stripe_customer_id FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  if (!user) throw new Error('User not found');

  // Get or create Stripe customer
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await s.customers.create({
      email: user.email,
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || undefined,
      metadata: { monkflow_user_id: userId },
    });
    customerId = customer.id;
    await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId]);
  }

  // Create a Stripe Price on-the-fly or use lookup_key
  // For simplicity, create inline price (in production, you'd use pre-created Stripe prices)
  const session = await s.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `MonkFlow ${plan.name} Plan`,
          description: `${plan.monthly_workflow_runs} workflow runs, ${plan.monthly_agent_tasks} agent tasks/month`,
        },
        unit_amount: plan.price_cents,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    metadata: {
      monkflow_user_id: userId,
      monkflow_plan_id: plan.id,
      monkflow_plan_slug: plan.slug,
    },
    success_url: `${env.frontendUrl}?page=billing&checkout=success`,
    cancel_url: `${env.frontendUrl}?page=billing&checkout=cancelled`,
    subscription_data: {
      metadata: {
        monkflow_user_id: userId,
        monkflow_plan_id: plan.id,
      },
    },
  });

  return { sessionId: session.id, url: session.url };
}

/**
 * Create a Stripe Billing Portal session for managing subscription
 */
async function createPortalSession(userId) {
  const s = getStripe();

  const { rows } = await query('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  if (!user?.stripe_customer_id) throw new Error('No billing account found. Please subscribe to a plan first.');

  const session = await s.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${env.frontendUrl}?page=billing`,
  });

  return { url: session.url };
}

/**
 * Handle Stripe webhook events
 */
async function handleWebhook(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.monkflow_user_id;
      const planId = session.metadata?.monkflow_plan_id;

      if (userId && planId) {
        await query(
          `UPDATE users SET plan_id = $1, stripe_subscription_id = $2 WHERE id = $3`,
          [planId, session.subscription, userId]
        );
        console.log(`User ${userId} upgraded to plan ${planId}`);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const userId = subscription.metadata?.monkflow_user_id;
      if (userId) {
        // If subscription becomes past_due or unpaid, we could downgrade
        if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
          console.log(`Subscription ${subscription.id} is ${subscription.status} for user ${userId}`);
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const userId = subscription.metadata?.monkflow_user_id;
      if (userId) {
        // Downgrade to starter (or free) when subscription is cancelled
        const starterPlan = await planModel.findBySlug('starter');
        if (starterPlan) {
          await query(
            'UPDATE users SET plan_id = $1, stripe_subscription_id = NULL WHERE id = $2',
            [starterPlan.id, userId]
          );
          console.log(`User ${userId} downgraded to starter after subscription cancellation`);
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.log(`Payment failed for invoice ${invoice.id}, customer ${invoice.customer}`);
      break;
    }

    default:
      // Unhandled event type
      break;
  }
}

module.exports = { createCheckoutSession, createPortalSession, handleWebhook };
