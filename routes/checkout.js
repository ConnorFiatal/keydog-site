const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_STARTER,
  campus:  process.env.STRIPE_PRICE_CAMPUS,
};

// POST /checkout/session  — body: { plan, company, email }
router.post('/session', async (req, res) => {
  const { plan, company, email } = req.body;

  if (!PRICE_IDS[plan]) return res.redirect('/pricing');

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email || undefined,
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      metadata: { plan, company: company || '' },
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { plan, company: company || '' },
      },
      success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.BASE_URL}/cancel`,
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.redirect('/pricing?error=checkout_failed');
  }
});

module.exports = router;
