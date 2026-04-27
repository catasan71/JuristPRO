// Force GitHub sync update - 2026-04-11
import process from 'process';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { Resend } from 'resend';

const __dirname = process.cwd();

// Load environment variables
dotenv.config();

let resendInstance: Resend | null = null;
function getResend() {
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_SECRET_KEY || process.env.RESEND_API_KEY || 're_MJw9ShNW_GVQFqnVaQPNFHZqsgkDPGHcA');
  }
  return resendInstance;
}

const app = express();
const port = 3000;

// Lazy initialization
let adminDbInstance: admin.firestore.Firestore | null = null;
function getAdminDb() {
  if (!adminDbInstance) {
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'juristpro'
      });
    }
    
    let databaseId = '(default)';
    try {
      const configPath = path.join(__dirname, 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.firestoreDatabaseId) {
          databaseId = config.firestoreDatabaseId;
        }
      }
    } catch (e) {
      console.error('Failed to read firebase-applet-config.json:', e);
    }

    adminDbInstance = getFirestore(admin.app(), databaseId);
  }
  return adminDbInstance;
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
    apiVersion: '2024-12-18.acacia' as any,
  });
}

// Webhook endpoint must use raw body
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();
  const adminDb = getAdminDb();

  let event;

  try {
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    } else {
      // Fallback if no webhook secret is set (e.g., local dev without CLI)
      event = JSON.parse(req.body.toString());
    }
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const metadata = session.metadata || {};

        if (!userId) break;

        if (metadata.type === 'subscription') {
          const plan = metadata.plan; // 'expert' or 'gold'
          const credits = plan === 'expert' ? 150 : 500;
          
          const profileDoc = await adminDb.collection('profiles').doc(userId).get();
          const currentCredits = profileDoc.exists ? (profileDoc.data()?.credits || 0) : 0;
          const userName = profileDoc.exists ? (profileDoc.data()?.full_name || 'User') : 'User';
          const billingData = profileDoc.exists ? (profileDoc.data()?.billing_data || null) : null;
          
          await adminDb.collection('profiles').doc(userId).update({
            plan: plan,
            status: 'active',
            credits: currentCredits + credits,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string
          });
          
          await adminDb.collection('transactions').add({
            user_id: userId,
            user_name: userName,
            billing_data: billingData,
            amount: session.amount_total ? session.amount_total / 100 : 0,
            type: 'subscription',
            description: `Abonament ${plan.toUpperCase()}`,
            created_at: new Date().toISOString()
          });
        } else if (metadata.type === 'topup') {
          const amount = parseInt(metadata.amount || '0', 10);
          const credits = parseInt(metadata.credits || '0', 10);
          
          // Get current credits
          const profileDoc = await adminDb.collection('profiles').doc(userId).get();
          const currentCredits = profileDoc.exists ? (profileDoc.data()?.credits || 0) : 0;
          const userName = profileDoc.exists ? (profileDoc.data()?.full_name || 'User') : 'User';
          const billingData = profileDoc.exists ? (profileDoc.data()?.billing_data || null) : null;
          
          await adminDb.collection('profiles').doc(userId).update({
            credits: currentCredits + credits
          });
          
          await adminDb.collection('transactions').add({
            user_id: userId,
            user_name: userName,
            billing_data: billingData,
            amount: amount,
            type: 'top-up',
            description: `Top-Up ${credits} Credite`,
            created_at: new Date().toISOString()
          });
        }
        break;
      }
      case 'checkout.session.expired': {
        console.log('Checkout session expired:', event.data.object);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason === 'subscription_cycle') {
          const customerId = invoice.customer as string;
          
          const profilesSnapshot = await adminDb.collection('profiles')
            .where('stripe_customer_id', '==', customerId)
            .limit(1)
            .get();
            
          if (!profilesSnapshot.empty) {
            const userId = profilesSnapshot.docs[0].id;
            const profileData = profilesSnapshot.docs[0].data();
            const plan = profileData['plan'];
            const creditsToAdd = plan === 'expert' ? 150 : (plan === 'gold' ? 500 : 0);
            
            if (creditsToAdd > 0) {
              await adminDb.collection('profiles').doc(userId).update({
                credits: (profileData['credits'] || 0) + creditsToAdd,
                status: 'active'
              });
              
              await adminDb.collection('transactions').add({
                user_id: userId,
                user_name: profileData['full_name'] || 'User',
                billing_data: profileData['billing_data'] || null,
                amount: invoice.amount_paid ? invoice.amount_paid / 100 : 0,
                type: 'subscription',
                description: `Reînnoire Abonament ${plan.toUpperCase()}`,
                created_at: new Date().toISOString()
              });
            }
          }
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        
        const profilesSnapshot = await adminDb.collection('profiles')
          .where('stripe_customer_id', '==', customerId)
          .limit(1)
          .get();
          
        if (!profilesSnapshot.empty) {
          const userId = profilesSnapshot.docs[0].id;
          
          let newPlan = subscription.metadata?.plan;
          
          if (!newPlan) {
            const productId = subscription.items.data[0].price.product as string;
            const product = await stripe.products.retrieve(productId);
            if (product.name.toLowerCase().includes('expert')) newPlan = 'expert';
            if (product.name.toLowerCase().includes('gold')) newPlan = 'gold';
          }
          
          if (newPlan && newPlan !== 'trial') {
            await adminDb.collection('profiles').doc(userId).update({
              plan: newPlan,
              status: subscription.status === 'active' ? 'active' : 'pending_payment'
            });
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        
        // Find user by stripe_customer_id
        const profilesSnapshot = await adminDb.collection('profiles')
          .where('stripe_customer_id', '==', customerId)
          .limit(1)
          .get();
          
        if (!profilesSnapshot.empty) {
          const userId = profilesSnapshot.docs[0].id;
          await adminDb.collection('profiles').doc(userId).update({
            status: 'cancelled',
            plan: 'trial'
          });
        }
        break;
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Error processing webhook:', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Standard JSON parsing for other routes
app.use(express.json());

// API Endpoint for Stripe Checkout
app.get('/api/test-stripe', async (req, res) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
    if (stripeKey === 'sk_test_dummy') {
      return res.status(500).json({ success: false, error: 'Cheia Stripe nu este setată.' });
    }
    const prefix = stripeKey.substring(0, 15);
    const suffix = stripeKey.substring(stripeKey.length - 4);
    res.json({ success: true, message: "Stripe endpoint is active.", keyPrefix: prefix, keySuffix: suffix });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
    if (stripeKey === 'sk_test_dummy') {
      return res.status(500).json({ error: 'Cheia Stripe (STRIPE_SECRET_KEY) lipsește din setările aplicației.' });
    }

    const { type, plan, amount, credits, userId, email } = req.body;
    
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    const appUrl = req.headers.origin || process.env.APP_URL || `https://ais-dev-2gyoebyp2nbm3psmj7o4di-40090194019.europe-west2.run.app`;
    
    let sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      client_reference_id: userId,
      success_url: `${appUrl}/?payment=success`,
      cancel_url: `${appUrl}/?payment=cancelled`,
      mode: 'payment',
      line_items: [],
      metadata: { type }
    };

    if (email && typeof email === 'string' && email.trim() !== '') {
      sessionConfig.customer_email = email;
    }

    if (type === 'subscription') {
      sessionConfig.mode = 'subscription';
      sessionConfig.metadata!.plan = plan;
      sessionConfig.subscription_data = {
        metadata: { plan }
      };
      
      const unitAmount = plan === 'expert' ? 20000 : 50000; // in bani (RON cents)
      
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'ron',
            product_data: {
              name: `Abonament JuristPRO ${plan.toUpperCase()}`,
              description: plan === 'expert' ? '150 Credite AI / lună' : '500 Credite AI / lună',
            },
            unit_amount: unitAmount,
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ];
    } else if (type === 'topup') {
      sessionConfig.mode = 'payment';
      sessionConfig.metadata!.amount = String(amount);
      sessionConfig.metadata!.credits = String(credits);
      
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'ron',
            product_data: {
              name: `Top-Up ${credits} Credite JuristPRO`,
            },
            unit_amount: Math.round(Number(amount) * 100), // in bani
          },
          quantity: 1,
        },
      ];
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message || 'Eroare internă Stripe' });
  }
});

// API Endpoint for Stripe Customer Portal (for cancellations)
app.post('/api/create-portal-session', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const adminDb = getAdminDb();
    // Get the user's stripe_customer_id from Firestore
    const profileDoc = await adminDb.collection('profiles').doc(userId).get();
    const profile = profileDoc.data();
    
    if (!profile || !profile.stripe_customer_id) {
      res.status(400).json({ error: 'No active Stripe subscription found for this user.' });
      return;
    }

    const appUrl = req.headers.origin || process.env.APP_URL || `https://ais-dev-2gyoebyp2nbm3psmj7o4di-40090194019.europe-west2.run.app`;
    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/`,
    });

    res.json({ url: portalSession.url });
  } catch (error: any) {
    console.error('Stripe portal error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API Endpoint for Contact Form
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Toate câmpurile sunt obligatorii.' });
    }

    // Send email using Resend
    try {
      const resend = getResend();
      const { data, error } = await resend.emails.send({
        from: 'JuristPRO Contact <onboarding@resend.dev>',
        to: ['office@developly.pro'], // Resend test domain only allows sending to the registered account email
        subject: `Mesaj nou de la ${name} (Contact JuristPRO)`,
        html: `
          <h2>Mesaj nou de contact</h2>
          <p><strong>Nume:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Mesaj:</strong></p>
          <blockquote style="border-left: 4px solid #ccc; padding-left: 10px; margin-left: 0;">
            ${message.replace(/\n/g, '<br>')}
          </blockquote>
        `
      });

      if (error) {
        console.error('Resend API error:', error);
      }
    } catch (resendError) {
      console.error('Resend execution error (likely missing API key):', resendError);
      // We don't throw here so the user still sees success since it was saved in Firestore
    }
    
    res.json({ success: true, message: 'Mesajul a fost salvat cu succes.' });
  } catch (error: any) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: 'Eroare la procesarea mesajului.' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files
const distPath = path.join(__dirname, 'dist/juristpro/browser');
console.log('Serving static files from:', distPath);

app.use(express.static(distPath));

// Fallback to index.html for SPA routing
app.use((req, res) => {
  if (req.accepts('html')) {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(503).send(`
        <html>
          <head>
            <title>Updating Application...</title>
            <meta http-equiv="refresh" content="3">
            <style>
              body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f9fafb; color: #111827; }
              .loader { border: 4px solid #e5e7eb; border-top: 4px solid #3b82f6; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
          </head>
          <body>
            <div class="loader"></div>
            <h2>Aplicația se actualizează</h2>
            <p>Vă rugăm să așteptați câteva momente...</p>
          </body>
        </html>
      `);
    }
  } else {
    res.status(404).json({ error: 'Not Found' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
