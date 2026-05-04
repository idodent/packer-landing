import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(
    'https://pwsheschknqnrshiavvw.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).json({ error: err.message });
  }

  const subscription = event.data.object;

  try {
    const customer = await stripe.customers.retrieve(subscription.customer);
    const email = customer.email;
    console.log('Event:', event.type, 'Customer:', email);

    if (event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated') {
      const priceId = subscription.items.data[0].price.id;
      const tier = priceId === 'price_1TMEVABGRCcfNIrFLokhFRgt' ? 'pro' : 'explorer';
      const { data } = await supabase.auth.admin.getUserByEmail(email);
      if (data?.user) {
        await supabase.from('profiles')
          .update({ subscription_tier: tier })
          .eq('id', data.user.id);
        console.log('Updated', email, 'to', tier);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const { data } = await supabase.auth.admin.getUserByEmail(email);
      if (data?.user) {
        await supabase.from('profiles')
          .update({ subscription_tier: 'free' })
          .eq('id', data.user.id);
      }
    }
  } catch (err) {
    console.error('Processing error:', err.message);
  }

  return res.status(200).json({ received: true });
}
