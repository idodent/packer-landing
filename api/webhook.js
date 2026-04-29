export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const { createClient } = require('@supabase/supabase-js');

  const supabase = createClient(
    'https://pwsheschknqnrshiavvw.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const subscription = event.data.object;
  const email = subscription.customer_email;

  if (event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated') {
    const tier = subscription.items.data[0].price.id === 'price_1TMEVABGRCcfNIrFLokhFRgt' ? 'pro' : 'explorer';
    await supabase.from('profiles').update({ subscription_tier: tier }).eq('email', email);
  }

  if (event.type === 'customer.subscription.deleted') {
    await supabase.from('profiles').update({ subscription_tier: 'free' }).eq('email', email);
  }

  return res.status(200).json({ received: true });
}
