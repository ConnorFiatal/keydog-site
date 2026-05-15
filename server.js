require('dotenv').config();
const express = require('express');
const path = require('path');

const webhookRoutes  = require('./routes/webhook');
const { notifyInquiry } = require('./lib/notify');

const app  = express();
const PORT = process.env.PORT || 3100;
const BASE_URL = (process.env.BASE_URL || 'https://keydog.io').replace(/\/$/, '');

app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.baseUrl = BASE_URL;

// Stripe webhook requires raw body — must mount before any body parsers
app.use('/webhook', webhookRoutes);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PLANS = {
  starter:    { name: 'Starter',    price: '$49',   interval: 'mo' },
  campus:     { name: 'Campus',     price: '$149',  interval: 'mo' },
  enterprise: { name: 'Enterprise', price: 'Custom', interval: '' },
};

app.get('/', (_req, res) =>
  res.render('index', {
    title: 'KeyDog — Campus Key & Door Management',
    description: 'Replace spreadsheets with KeyDog — physical key tracking, door management, and access credential control for campus facilities teams. Get organised in 24 hours.',
    canonical: BASE_URL,
  }));

app.get('/features', (_req, res) =>
  res.render('features', {
    title: 'Key & Door Management Features — KeyDog',
    description: 'Physical key tracking, door records, fob profiles, tamper-evident audit trail, staff management, floor plans, and auto-generated key agreements — all in one platform.',
    canonical: `${BASE_URL}/features`,
  }));

app.get('/pricing', (_req, res) =>
  res.render('pricing', {
    title: 'Pricing from $49/mo — KeyDog',
    description: 'KeyDog plans start at $49/month. Starter, Campus, and Enterprise tiers for facilities teams of every size. 14-day free trial, account setup within 24 hours.',
    canonical: `${BASE_URL}/pricing`,
    plans: PLANS,
  }));

app.get('/signup', (_req, res) => res.redirect(301, '/contact'));

app.get('/support', (_req, res) =>
  res.render('support', {
    title: 'Support — KeyDog',
    description: 'Need help with KeyDog? Email support@keydog.app and our team will respond within one business day.',
    canonical: `${BASE_URL}/support`,
  }));

app.get('/sales', (_req, res) =>
  res.render('sales', {
    title: 'Talk to Sales — KeyDog',
    description: 'Talk to the KeyDog sales team about key and door management for your campus. We\'ll set up your account within 24 hours.',
    canonical: `${BASE_URL}/sales`,
  }));

app.post('/sales', async (req, res) => {
  const { name, email, org, size, message } = req.body;
  await notifyInquiry({ source: 'sales', name, email, org, size, message });
  res.redirect('/success');
});

app.get('/contact', (_req, res) =>
  res.render('contact', {
    title: 'Contact Sales — KeyDog',
    description: 'Contact the KeyDog sales team to start your free trial. Campus key and door management for education, healthcare, and government facilities.',
    canonical: `${BASE_URL}/contact`,
  }));

app.post('/contact', async (req, res) => {
  const { name, email, institution, buildings, message } = req.body;
  await notifyInquiry({ source: 'contact', name, email, institution, buildings, message });
  res.redirect('/success');
});

app.get('/success', (_req, res) =>
  res.render('success', {
    title: 'Request Received — KeyDog',
    description: 'Your request has been received. The KeyDog team will be in touch within 24 hours.',
    canonical: `${BASE_URL}/success`,
    noindex: true,
  }));

app.get('/cancel', (_req, res) => res.redirect(301, '/contact'));

app.get('/terms', (_req, res) =>
  res.render('terms', {
    title: 'Terms of Service — KeyDog',
    description: 'Read the KeyDog Terms of Service — the service agreement governing use of the KeyDog platform.',
    canonical: `${BASE_URL}/terms`,
  }));

app.get('/privacy', (_req, res) =>
  res.render('privacy', {
    title: 'Privacy Policy — KeyDog',
    description: 'KeyDog Privacy Policy — how we collect, store, and protect your data.',
    canonical: `${BASE_URL}/privacy`,
  }));

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain');
  res.send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /success',
    'Disallow: /webhook',
    '',
    `Sitemap: ${BASE_URL}/sitemap.xml`,
  ].join('\n'));
});

app.get('/sitemap.xml', (_req, res) => {
  const pages = [
    { path: '',          priority: '1.0', changefreq: 'weekly'  },
    { path: '/features', priority: '0.9', changefreq: 'monthly' },
    { path: '/pricing',  priority: '0.9', changefreq: 'monthly' },
    { path: '/contact',  priority: '0.7', changefreq: 'monthly' },
    { path: '/support',  priority: '0.5', changefreq: 'monthly' },
    { path: '/terms',    priority: '0.3', changefreq: 'yearly'  },
    { path: '/privacy',  priority: '0.3', changefreq: 'yearly'  },
  ];
  const today = new Date().toISOString().slice(0, 10);
  const urls = pages.map(p =>
    `  <url>\n    <loc>${BASE_URL}${p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  ).join('\n');
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});

app.use((_req, res) => res.status(404).render('404', {
  title: 'Page Not Found — KeyDog',
  description: 'The page you were looking for could not be found.',
  canonical: BASE_URL,
  noindex: true,
}));

app.listen(PORT, () => console.log(`KeyDog site → http://localhost:${PORT}`));
