const crypto = require('crypto');

const BASE       = (process.env.COOLIFY_BASE_URL || '').replace(/\/$/, ''); // strip trailing slash
const TOKEN      = process.env.COOLIFY_API_TOKEN;
const SERVER     = process.env.COOLIFY_SERVER_UUID;
const PROJECT    = process.env.COOLIFY_PROJECT_UUID;
const ENV_NAME   = process.env.COOLIFY_ENVIRONMENT || 'production';
const GIT_REPO   = process.env.KEYDOG_GIT_REPO;
const GIT_BRANCH = process.env.KEYDOG_GIT_BRANCH || 'main';
const DOMAIN_TPL = process.env.COOLIFY_DOMAIN_TEMPLATE;
const DB_URL     = process.env.KEYDOG_DATABASE_URL;

// Maps Stripe plan slug → env vars injected into the KeyDog app instance.
// These control feature gating and limits inside the app itself.
const PLAN_CONFIG = {
  starter: {
    FEATURE_FLOOR_PLANS:    'false',
    FEATURE_KEY_AGREEMENTS: 'false',
    FEATURE_RING_CHECKOUT:  'false',
    AUDIT_RETENTION_DAYS:   '30',
    MAX_BUILDINGS:          '1',
    MAX_ADMINS:             '3',
  },
  campus: {
    FEATURE_FLOOR_PLANS:    'true',
    FEATURE_KEY_AGREEMENTS: 'true',
    FEATURE_RING_CHECKOUT:  'true',
    AUDIT_RETENTION_DAYS:   '365',
    MAX_BUILDINGS:          '5',
    MAX_ADMINS:             '0',    // 0 = unlimited
  },
  enterprise: {
    FEATURE_FLOOR_PLANS:    'true',
    FEATURE_KEY_AGREEMENTS: 'true',
    FEATURE_RING_CHECKOUT:  'true',
    AUDIT_RETENTION_DAYS:   '1825', // 5 years
    MAX_BUILDINGS:          '0',
    MAX_ADMINS:             '0',
  },
};

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

// Sets env vars one at a time via Coolify's /envs endpoint.
// Coolify treats POST /envs as upsert — safe to call on re-provision or plan change.
async function setEnvVars(uuid, vars) {
  for (const [key, value] of Object.entries(vars)) {
    await api('POST', `/applications/${uuid}/envs`, { key, value, is_preview: false });
  }
}

async function provisionInstance({ customerId, subscriptionId, email, company, plan }) {
  const slug    = slugify(company || customerId);
  const appName = `keydog-${slug}`;
  const planCfg = PLAN_CONFIG[plan] || PLAN_CONFIG.starter;

  // 1. Create the application in Coolify — include fqdn at creation time since
  //    Coolify does not allow patching it afterward via the API.
  const customUrl = DOMAIN_TPL ? DOMAIN_TPL.replace('{slug}', slug) : null;

  const app = await api('POST', '/applications/public', {
    project_uuid:     PROJECT,
    server_uuid:      SERVER,
    environment_name: ENV_NAME,
    git_repository:   GIT_REPO,
    git_branch:       GIT_BRANCH,
    name:             appName,
    build_pack:       'nixpacks',
    ports_exposes:    '3000',
    ...(customUrl ? { domains: customUrl } : {}),
  });

  // 2. Set all environment variables (identity + plan feature flags + runtime config)
  const envVars = {
    NODE_ENV:               'production',
    NIXPACKS_NODE_VERSION:  '22',
    SESSION_SECRET:         crypto.randomBytes(32).toString('hex'),
    CUSTOMER_ID:            customerId,
    SUBSCRIPTION_ID:        subscriptionId,
    PLAN:                   plan,
    CUSTOMER_EMAIL:         email || '',
    CUSTOMER_SLUG:          slug,
    ...planCfg,
  };

  if (DB_URL) envVars.DATABASE_URL = DB_URL;

  await setEnvVars(app.uuid, envVars);

  // 3. Resolve the actual URL — prefer the custom domain, fall back to whatever
  //    Coolify auto-generated (sslip.io) if the domain wasn't accepted.
  let appUrl = customUrl || app.fqdn || null;

  // 3. Trigger the first deployment
  await api('GET', `/applications/${app.uuid}/start`);

  console.log(`[coolify] provisioned ${appName} plan=${plan} url=${appUrl ?? '(no domain)'}`);
  return { uuid: app.uuid, name: appName, url: appUrl };
}

// Updates plan-controlled env vars on an existing instance (Stripe subscription.updated).
async function updateInstancePlan({ customerId, subscriptionId, plan }) {
  const apps = await api('GET', '/applications');
  const target = findByCustomer(apps, customerId);

  if (!target) {
    console.warn(`[coolify] updateInstancePlan: no app found for customer ${customerId}`);
    return;
  }

  const planCfg = PLAN_CONFIG[plan] || PLAN_CONFIG.starter;
  const updateVars = { PLAN: plan, SUBSCRIPTION_ID: subscriptionId, ...planCfg };
  if (DB_URL) updateVars.DATABASE_URL = DB_URL;
  await setEnvVars(target.uuid, updateVars);

  // Redeploy so the app picks up the new vars
  await api('GET', `/applications/${target.uuid}/restart`);

  console.log(`[coolify] updated ${target.name} to plan=${plan}`);
}

async function teardownInstance({ customerId }) {
  const apps   = await api('GET', '/applications');
  const target = findByCustomer(apps, customerId);

  if (!target) {
    console.warn(`[coolify] teardownInstance: no app found for customer ${customerId}`);
    return;
  }

  await api('GET', `/applications/${target.uuid}/stop`).catch(() => {});
  await api('DELETE', `/applications/${target.uuid}`);

  console.log(`[coolify] torn down ${target.name} for customer ${customerId}`);
}

function findByCustomer(apps, customerId) {
  if (!Array.isArray(apps)) return null;
  return apps.find(a =>
    Array.isArray(a.environment_variables) &&
    a.environment_variables.some(e => e.key === 'CUSTOMER_ID' && e.value === customerId)
  ) ?? null;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

module.exports = { provisionInstance, updateInstancePlan, teardownInstance };
