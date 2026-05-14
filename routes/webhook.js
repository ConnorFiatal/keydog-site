const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const { provisionInstance, updateInstancePlan, teardownInstance } = require('../lib/coolify');
const {
  notifyProvisioned,
  notifyProvisionFailed,
  notifyPaymentFailed,
  notifyPlanChanged,
  notifyCancellation,
} = require('../lib/notify');

// Raw body required for Stripe signature verification
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('Stripe webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ACK immediately — Stripe requires a fast 200; all work happens after
  res.json({ received: true });

  try {
    switch (event.type) {

      // ── New subscription purchased ──────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;

        const params = {
          customerId:     session.customer,
          subscriptionId: session.subscription,
          email:          session.customer_details?.email ?? session.customer_email,
          company:        session.metadata?.company ?? '',
          plan:           session.metadata?.plan    ?? 'starter',
        };

        let result;
        try {
          result = await provisionInstance(params);
        } catch (provisionErr) {
          console.error('[webhook] provisionInstance failed:', provisionErr);
          await notifyProvisionFailed({
            email:   params.email,
            company: params.company,
            plan:    params.plan,
            error:   provisionErr.message,
          });
          break;
        }

        await notifyProvisioned({
          customerId:     params.customerId,
          subscriptionId: params.subscriptionId,
          email:          params.email,
          company:        params.company,
          plan:           params.plan,
          appUrl:         result.url,
        });
        break;
      }

      // ── Plan upgrade / downgrade ────────────────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const prev = event.data.previous_attributes;

        // Only act when the price/plan actually changed
        const planChanged = prev?.items || prev?.metadata;
        if (!planChanged) break;

        const newPlan = sub.metadata?.plan ?? 'starter';
        const oldPlan = prev?.metadata?.plan ?? newPlan;
        if (newPlan === oldPlan) break;

        await updateInstancePlan({
          customerId:     sub.customer,
          subscriptionId: sub.id,
          plan:           newPlan,
        });

        await notifyPlanChanged({
          customerId: sub.customer,
          email:      sub.customer_email ?? '',
          oldPlan,
          newPlan,
        });
        break;
      }

      // ── Payment failed ─────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await notifyPaymentFailed({
          customerId:  invoice.customer,
          email:       invoice.customer_email,
          amountCents: invoice.amount_due,
          nextAttempt: invoice.next_payment_attempt,
        });
        break;
      }

      // ── Subscription cancelled / expired ───────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await teardownInstance({ customerId: sub.customer, subscriptionId: sub.id });
        await notifyCancellation({ customerId: sub.customer, email: sub.customer_email ?? '' });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // Log but don't alter the 200 already sent — prevents Stripe from retrying
    console.error(`[webhook] error handling ${event.type}:`, err);
  }
});

module.exports = router;
