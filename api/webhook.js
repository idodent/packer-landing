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
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: err.message });
  }

  const subscription = event.data.object;

  try {
    // Get customer email from Stripe
    const customer = await stripe.customers.retrieve(subscription.customer);
    const email = customer.email;

    console.log('Webhook event:', event.type, 'email:', email);

    if (event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated') {
      const priceId = subscription.items.data[0].price.id;
      const tier = priceId === 'price_1TMEVABGRCcfNIrFLokhFRgt' ? 'pro' : 'explorer';
      
      const { error } = await supabase
        .from('profiles')
        .update({ subscription_tier: tier })
        .eq('id', (await supabase.auth.admin.getUserByEmail(email)).data.user.id);
      
      if (error) console.error('Supabase update error:', error);
      else console.log('Updated user', email, 'to', tier);
    }

    if (event.type === 'customer.subscription.deleted') {
      const { error } = await supabase
        .from('profiles')
        .update({ subscription_tier: 'free' })
        .eq('id', (await supabase.auth.admin.getUserByEmail(email)).data.user.id);
      
      if (error) console.error('Supabase update error:', error);
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }

  return res.status(200).json({ received: true });
}
