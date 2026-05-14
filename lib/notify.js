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

// Triggered after successful provisioning — n8n should send the welcome email
async function notifyProvisioned({ customerId, subscriptionId, email, company, plan, appUrl }) {
  await post('/provision-success', {
    customerId,
    subscriptionId,
    email,
    company,
    plan,
    appUrl,
  });
}

// Triggered when provisioning throws — n8n should alert the ops team
async function notifyProvisionFailed({ email, company, plan, error }) {
  await post('/provision-failed', { email, company, plan, error });
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

// Triggered on customer.subscription.updated (plan change)
async function notifyPlanChanged({ customerId, email, oldPlan, newPlan }) {
  await post('/plan-changed', { customerId, email, oldPlan, newPlan });
}

// Triggered on customer.subscription.deleted
async function notifyCancellation({ customerId, email }) {
  await post('/subscription-cancelled', { customerId, email });
}

async function notifyInquiry(payload) {
  await post('/contact-inquiry', payload);
}

module.exports = {
  notifyProvisioned,
  notifyProvisionFailed,
  notifyPaymentFailed,
  notifyPlanChanged,
  notifyCancellation,
  notifyInquiry,
};
