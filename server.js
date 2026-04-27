"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"));
var import_path = __toESM(require("path"));
var import_fs = __toESM(require("fs"));
var import_stripe = __toESM(require("stripe"));
var import_dotenv = __toESM(require("dotenv"));
var import_firebase_admin = __toESM(require("firebase-admin"));
var import_firestore = require("firebase-admin/firestore");
var import_resend = require("resend");
var __dirname = process.cwd();
import_dotenv.default.config();
var resendInstance = null;
function getResend() {
  if (!resendInstance) {
    resendInstance = new import_resend.Resend(process.env.RESEND_SECRET_KEY || process.env.RESEND_API_KEY || "re_MJw9ShNW_GVQFqnVaQPNFHZqsgkDPGHcA");
  }
  return resendInstance;
}
var app = (0, import_express.default)();
var port = 3e3;
var adminDbInstance = null;
function getAdminDb() {
  if (!adminDbInstance) {
    if (!import_firebase_admin.default.apps.length) {
      import_firebase_admin.default.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || "juristpro"
      });
    }
    let databaseId = "(default)";
    try {
      const configPath = import_path.default.join(__dirname, "firebase-applet-config.json");
      if (import_fs.default.existsSync(configPath)) {
        const config = JSON.parse(import_fs.default.readFileSync(configPath, "utf8"));
        if (config.firestoreDatabaseId) {
          databaseId = config.firestoreDatabaseId;
        }
      }
    } catch (e) {
      console.error("Failed to read firebase-applet-config.json:", e);
    }
    adminDbInstance = (0, import_firestore.getFirestore)(import_firebase_admin.default.app(), databaseId);
  }
  return adminDbInstance;
}
function getStripe() {
  return new import_stripe.default(process.env.STRIPE_SECRET_KEY || "sk_test_dummy", {
    apiVersion: "2024-12-18.acacia"
  });
}
app.post("/api/webhook", import_express.default.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();
  const adminDb = getAdminDb();
  let event;
  try {
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const metadata = session.metadata || {};
        if (!userId) break;
        if (metadata.type === "subscription") {
          const plan = metadata.plan;
          const credits = plan === "expert" ? 150 : 500;
          const profileDoc = await adminDb.collection("profiles").doc(userId).get();
          const currentCredits = profileDoc.exists ? profileDoc.data()?.credits || 0 : 0;
          const userName = profileDoc.exists ? profileDoc.data()?.full_name || "User" : "User";
          const billingData = profileDoc.exists ? profileDoc.data()?.billing_data || null : null;
          await adminDb.collection("profiles").doc(userId).update({
            plan,
            status: "active",
            credits: currentCredits + credits,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription
          });
          await adminDb.collection("transactions").add({
            user_id: userId,
            user_name: userName,
            billing_data: billingData,
            amount: session.amount_total ? session.amount_total / 100 : 0,
            type: "subscription",
            description: `Abonament ${plan.toUpperCase()}`,
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        } else if (metadata.type === "topup") {
          const amount = parseInt(metadata.amount || "0", 10);
          const credits = parseInt(metadata.credits || "0", 10);
          const profileDoc = await adminDb.collection("profiles").doc(userId).get();
          const currentCredits = profileDoc.exists ? profileDoc.data()?.credits || 0 : 0;
          const userName = profileDoc.exists ? profileDoc.data()?.full_name || "User" : "User";
          const billingData = profileDoc.exists ? profileDoc.data()?.billing_data || null : null;
          await adminDb.collection("profiles").doc(userId).update({
            credits: currentCredits + credits
          });
          await adminDb.collection("transactions").add({
            user_id: userId,
            user_name: userName,
            billing_data: billingData,
            amount,
            type: "top-up",
            description: `Top-Up ${credits} Credite`,
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
        break;
      }
      case "checkout.session.expired": {
        console.log("Checkout session expired:", event.data.object);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        if (invoice.billing_reason === "subscription_cycle") {
          const customerId = invoice.customer;
          const profilesSnapshot = await adminDb.collection("profiles").where("stripe_customer_id", "==", customerId).limit(1).get();
          if (!profilesSnapshot.empty) {
            const userId = profilesSnapshot.docs[0].id;
            const profileData = profilesSnapshot.docs[0].data();
            const plan = profileData["plan"];
            const creditsToAdd = plan === "expert" ? 150 : plan === "gold" ? 500 : 0;
            if (creditsToAdd > 0) {
              await adminDb.collection("profiles").doc(userId).update({
                credits: (profileData["credits"] || 0) + creditsToAdd,
                status: "active"
              });
              await adminDb.collection("transactions").add({
                user_id: userId,
                user_name: profileData["full_name"] || "User",
                billing_data: profileData["billing_data"] || null,
                amount: invoice.amount_paid ? invoice.amount_paid / 100 : 0,
                type: "subscription",
                description: `Re\xEEnnoire Abonament ${plan.toUpperCase()}`,
                created_at: (/* @__PURE__ */ new Date()).toISOString()
              });
            }
          }
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const profilesSnapshot = await adminDb.collection("profiles").where("stripe_customer_id", "==", customerId).limit(1).get();
        if (!profilesSnapshot.empty) {
          const userId = profilesSnapshot.docs[0].id;
          let newPlan = subscription.metadata?.plan;
          if (!newPlan) {
            const productId = subscription.items.data[0].price.product;
            const product = await stripe.products.retrieve(productId);
            if (product.name.toLowerCase().includes("expert")) newPlan = "expert";
            if (product.name.toLowerCase().includes("gold")) newPlan = "gold";
          }
          if (newPlan && newPlan !== "trial") {
            await adminDb.collection("profiles").doc(userId).update({
              plan: newPlan,
              status: subscription.status === "active" ? "active" : "pending_payment"
            });
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const profilesSnapshot = await adminDb.collection("profiles").where("stripe_customer_id", "==", customerId).limit(1).get();
        if (!profilesSnapshot.empty) {
          const userId = profilesSnapshot.docs[0].id;
          await adminDb.collection("profiles").doc(userId).update({
            status: "cancelled",
            plan: "trial"
          });
        }
        break;
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error("Error processing webhook:", err);
    res.status(500).json({ error: "Webhook handler failed" });
  }
});
app.use(import_express.default.json());
app.get("/api/test-stripe", async (req, res) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
    if (stripeKey === "sk_test_dummy") {
      return res.status(500).json({ success: false, error: "Cheia Stripe nu este setat\u0103." });
    }
    const prefix = stripeKey.substring(0, 15);
    const suffix = stripeKey.substring(stripeKey.length - 4);
    res.json({ success: true, message: "Stripe endpoint is active.", keyPrefix: prefix, keySuffix: suffix });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
    if (stripeKey === "sk_test_dummy") {
      return res.status(500).json({ error: "Cheia Stripe (STRIPE_SECRET_KEY) lipse\u0219te din set\u0103rile aplica\u021Biei." });
    }
    const { type, plan, amount, credits, userId, email } = req.body;
    if (!userId) {
      res.status(400).json({ error: "User ID is required" });
      return;
    }
    const appUrl = req.headers.origin || process.env.APP_URL || `https://ais-dev-2gyoebyp2nbm3psmj7o4di-40090194019.europe-west2.run.app`;
    let sessionConfig = {
      payment_method_types: ["card"],
      client_reference_id: userId,
      success_url: `${appUrl}/?payment=success`,
      cancel_url: `${appUrl}/?payment=cancelled`,
      mode: "payment",
      line_items: [],
      metadata: { type }
    };
    if (email && typeof email === "string" && email.trim() !== "") {
      sessionConfig.customer_email = email;
    }
    if (type === "subscription") {
      sessionConfig.mode = "subscription";
      sessionConfig.metadata.plan = plan;
      sessionConfig.subscription_data = {
        metadata: { plan }
      };
      const unitAmount = plan === "expert" ? 2e4 : 5e4;
      sessionConfig.line_items = [
        {
          price_data: {
            currency: "ron",
            product_data: {
              name: `Abonament JuristPRO ${plan.toUpperCase()}`,
              description: plan === "expert" ? "150 Credite AI / lun\u0103" : "500 Credite AI / lun\u0103"
            },
            unit_amount: unitAmount,
            recurring: {
              interval: "month"
            }
          },
          quantity: 1
        }
      ];
    } else if (type === "topup") {
      sessionConfig.mode = "payment";
      sessionConfig.metadata.amount = String(amount);
      sessionConfig.metadata.credits = String(credits);
      sessionConfig.line_items = [
        {
          price_data: {
            currency: "ron",
            product_data: {
              name: `Top-Up ${credits} Credite JuristPRO`
            },
            unit_amount: Math.round(Number(amount) * 100)
            // in bani
          },
          quantity: 1
        }
      ];
    }
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).json({ error: error.message || "Eroare intern\u0103 Stripe" });
  }
});
app.post("/api/create-portal-session", async (req, res) => {
  try {
    const { userId } = req.body;
    const adminDb = getAdminDb();
    const profileDoc = await adminDb.collection("profiles").doc(userId).get();
    const profile = profileDoc.data();
    if (!profile || !profile.stripe_customer_id) {
      res.status(400).json({ error: "No active Stripe subscription found for this user." });
      return;
    }
    const appUrl = req.headers.origin || process.env.APP_URL || `https://ais-dev-2gyoebyp2nbm3psmj7o4di-40090194019.europe-west2.run.app`;
    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/`
    });
    res.json({ url: portalSession.url });
  } catch (error) {
    console.error("Stripe portal error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: "Toate c\xE2mpurile sunt obligatorii." });
    }
    try {
      const resend = getResend();
      const { data, error } = await resend.emails.send({
        from: "JuristPRO Contact <onboarding@resend.dev>",
        to: ["office@developly.pro"],
        // Resend test domain only allows sending to the registered account email
        subject: `Mesaj nou de la ${name} (Contact JuristPRO)`,
        html: `
          <h2>Mesaj nou de contact</h2>
          <p><strong>Nume:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Mesaj:</strong></p>
          <blockquote style="border-left: 4px solid #ccc; padding-left: 10px; margin-left: 0;">
            ${message.replace(/\n/g, "<br>")}
          </blockquote>
        `
      });
      if (error) {
        console.error("Resend API error:", error);
      }
    } catch (resendError) {
      console.error("Resend execution error (likely missing API key):", resendError);
    }
    res.json({ success: true, message: "Mesajul a fost salvat cu succes." });
  } catch (error) {
    console.error("Contact form error:", error);
    res.status(500).json({ error: "Eroare la procesarea mesajului." });
  }
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
var distPath = import_path.default.join(__dirname, "dist/juristpro/browser");
console.log("Serving static files from:", distPath);
app.use(import_express.default.static(distPath));
app.use((req, res) => {
  if (req.accepts("html")) {
    const indexPath = import_path.default.join(distPath, "index.html");
    if (import_fs.default.existsSync(indexPath)) {
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
            <h2>Aplica\u021Bia se actualizeaz\u0103</h2>
            <p>V\u0103 rug\u0103m s\u0103 a\u0219tepta\u021Bi c\xE2teva momente...</p>
          </body>
        </html>
      `);
    }
  } else {
    res.status(404).json({ error: "Not Found" });
  }
});
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
module.exports = app;
