const crypto = require('crypto');

const BASE       = process.env.COOLIFY_URL;
const TOKEN      = process.env.COOLIFY_TOKEN;
const SERVER     = process.env.COOLIFY_SERVER_UUID;
const PROJECT    = process.env.COOLIFY_PROJECT_UUID;
const ENV_NAME   = process.env.COOLIFY_ENVIRONMENT || 'production';
const GIT_REPO   = process.env.KEYDOG_GIT_REPO;
const GIT_BRANCH = process.env.KEYDOG_GIT_BRANCH || 'main';

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`Coolify ${method} ${path} → ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function provisionInstance({ customerId, subscriptionId, email, company, plan }) {
  const slug    = slugify(company || customerId);
  const appName = `keydog-${slug}`;

  const app = await api('POST', '/applications/public', {
    project_uuid:     PROJECT,
    server_uuid:      SERVER,
    environment_name: ENV_NAME,
    git_repository:   GIT_REPO,
    git_branch:       GIT_BRANCH,
    name:             appName,
    build_pack:       'nixpacks',
    ports_exposes:    '3000',
    environment_variables: [
      { key: 'SESSION_SECRET',   value: crypto.randomBytes(32).toString('hex'), is_preview: false },
      { key: 'NODE_ENV',         value: 'production',  is_preview: false },
      { key: 'CUSTOMER_ID',      value: customerId,    is_preview: false },
      { key: 'SUBSCRIPTION_ID',  value: subscriptionId, is_preview: false },
      { key: 'PLAN',             value: plan,          is_preview: false },
    ],
  });

  // Trigger initial deployment
  await api('GET', `/applications/${app.uuid}/start`);

  console.log(`[coolify] Provisioned ${appName} for ${email} plan=${plan}`);
  return app;
}

async function teardownInstance({ customerId }) {
  const apps = await api('GET', '/applications');

  const target = Array.isArray(apps)
    ? apps.find(a =>
        Array.isArray(a.environment_variables) &&
        a.environment_variables.some(e => e.key === 'CUSTOMER_ID' && e.value === customerId)
      )
    : null;

  if (!target) {
    console.warn(`[coolify] No app found for customer ${customerId} — nothing to tear down`);
    return;
  }

  // Stop then delete
  await api('GET', `/applications/${target.uuid}/stop`).catch(() => {});
  await api('DELETE', `/applications/${target.uuid}`);

  console.log(`[coolify] Torn down ${target.name} for customer ${customerId}`);
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

module.exports = { provisionInstance, teardownInstance };
