const N8N_BASE = process.env.N8N_WEBHOOK_URL;

async function post(path, payload) {
  if (!N8N_BASE) {
    console.log(`[notify] n8n not configured — skipping ${path}`, payload);
    return;
  }

  try {
    const res = await fetch(`${N8N_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`[notify] n8n ${path} responded ${res.status}`);
    }
  } catch (err) {
    console.error(`[notify] n8n request failed for ${path}:`, err.message);
  }
}

// Triggered when checkout.session.completed provisioning fails
async function notifyProvisionFailed({ email, company, error }) {
  await post('/provision-failed', { email, company, error });
}

// Triggered on invoice.payment_failed
async function notifyPaymentFailed({ customerId, email, amountCents, nextAttempt }) {
  await post('/payment-failed', {
    customerId,
    email,
    amount: (amountCents / 100).toFixed(2),
    nextAttempt: nextAttempt ? new Date(nextAttempt * 1000).toISOString() : null,
  });
}

// Triggered on customer.subscription.deleted
async function notifyCancellation({ customerId }) {
  await post('/subscription-cancelled', { customerId });
}

module.exports = { notifyProvisionFailed, notifyPaymentFailed, notifyCancellation };
