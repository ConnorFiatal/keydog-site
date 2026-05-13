const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const { provisionInstance, teardownInstance } = require('../lib/coolify');
const { notifyPaymentFailed, notifyCancellation } = require('../lib/notify');

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

  // Always acknowledge immediately; do async work after
  res.json({ received: true });

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;
        await provisionInstance({
          customerId:     session.customer,
          subscriptionId: session.subscription,
          email:          session.customer_email,
          company:        session.metadata?.company || '',
          plan:           session.metadata?.plan    || 'starter',
        });
        break;
      }

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

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await teardownInstance({ customerId: sub.customer, subscriptionId: sub.id });
        await notifyCancellation({ customerId: sub.customer });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // Log but don't change the 200 already sent — prevents Stripe retries for unrecoverable errors
    console.error(`Error processing ${event.type}:`, err);
  }
});

module.exports = router;
