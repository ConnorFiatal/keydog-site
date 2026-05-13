require('dotenv').config();
const express = require('express');
const path = require('path');

const checkoutRoutes = require('./routes/checkout');
const webhookRoutes  = require('./routes/webhook');

const app  = express();
const PORT = process.env.PORT || 3100;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Stripe webhook requires raw body — must mount before any body parsers
app.use('/webhook', webhookRoutes);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/checkout', checkoutRoutes);

const PLANS = {
  starter:    { name: 'Starter',    price: '$49',   interval: 'mo' },
  campus:     { name: 'Campus',     price: '$149',  interval: 'mo' },
  enterprise: { name: 'Enterprise', price: 'Custom', interval: '' },
};

app.get('/', (_req, res) =>
  res.render('index', { title: 'KeyDog — Campus Key & Door Management' }));

app.get('/pricing', (_req, res) =>
  res.render('pricing', { title: 'Pricing — KeyDog', plans: PLANS }));

app.get('/signup', (req, res) => {
  const plan = PLANS[req.query.plan] ? req.query.plan : 'starter';
  if (plan === 'enterprise') return res.redirect('/contact');
  res.render('signup', { title: 'Get Started — KeyDog', plan, planData: PLANS[plan] });
});

app.get('/features', (_req, res) =>
  res.render('features', { title: 'Features — KeyDog' }));

app.get('/support', (_req, res) =>
  res.render('support', { title: 'Support — KeyDog' }));

app.get('/sales', (_req, res) =>
  res.render('sales', { title: 'Talk to Sales — KeyDog' }));

app.get('/contact', (_req, res) =>
  res.render('contact', { title: 'Contact Sales — KeyDog' }));

app.get('/success', (_req, res) =>
  res.render('success', { title: 'Welcome to KeyDog!' }));

app.get('/cancel', (_req, res) =>
  res.render('cancel', { title: 'Checkout Cancelled — KeyDog' }));

app.use((_req, res) => res.status(404).render('404', { title: 'Page Not Found — KeyDog' }));

app.listen(PORT, () => console.log(`KeyDog site → http://localhost:${PORT}`));
