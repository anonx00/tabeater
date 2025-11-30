const { Firestore } = require('@google-cloud/firestore');
const Stripe = require('stripe');
const functions = require('@google-cloud/functions-framework');

const db = new Firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_CENTS = 999;
const TRIAL_DAYS = 7;
const FREE_DAILY_LIMIT = 20;

functions.http('api', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-License-Key');

    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }

    const path = req.path.replace(/^\/+/, '');

    try {
        switch (path) {
            case 'register':
                return await handleRegister(req, res);
            case 'status':
                return await handleStatus(req, res);
            case 'use':
                return await handleUse(req, res);
            case 'checkout':
                return await handleCheckout(req, res);
            case 'webhook':
                return await handleWebhook(req, res);
            default:
                return res.status(404).json({ error: 'Not found' });
        }
    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
});

async function handleRegister(req, res) {
    const { deviceId } = req.body;

    if (!deviceId) {
        return res.status(400).json({ error: 'deviceId required' });
    }

    const existingQuery = await db.collection('devices')
        .where('deviceId', '==', deviceId)
        .limit(1)
        .get();

    if (!existingQuery.empty) {
        const doc = existingQuery.docs[0];
        return res.json({ licenseKey: doc.id });
    }

    const licenseKey = generateLicenseKey();
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    await db.collection('devices').doc(licenseKey).set({
        deviceId,
        licenseKey,
        createdAt: now.toISOString(),
        trialEndDate: trialEnd.toISOString(),
        paid: false
    });

    return res.json({ licenseKey });
}

async function handleStatus(req, res) {
    const licenseKey = req.headers['x-license-key'];

    if (!licenseKey) {
        return res.status(400).json({ error: 'License key required' });
    }

    const doc = await db.collection('devices').doc(licenseKey).get();

    if (!doc.exists) {
        return res.status(404).json({ error: 'License not found' });
    }

    const data = doc.data();
    const now = new Date();
    const trialEnd = new Date(data.trialEndDate);
    const trialExpired = now > trialEnd;

    const todayKey = now.toISOString().split('T')[0];
    const usageDoc = await db.collection('usage').doc(`${licenseKey}_${todayKey}`).get();
    const todayUsage = usageDoc.exists ? usageDoc.data().count : 0;

    let status, canUse;

    if (data.paid) {
        status = 'pro';
        canUse = true;
    } else if (trialExpired) {
        status = 'expired';
        canUse = false;
    } else {
        status = 'trial';
        canUse = todayUsage < FREE_DAILY_LIMIT;
    }

    return res.json({
        status,
        paid: data.paid,
        usageRemaining: data.paid ? 999 : Math.max(0, FREE_DAILY_LIMIT - todayUsage),
        trialEndDate: data.trialEndDate,
        canUse
    });
}

async function handleUse(req, res) {
    const licenseKey = req.headers['x-license-key'];

    if (!licenseKey) {
        return res.status(400).json({ error: 'License key required' });
    }

    const doc = await db.collection('devices').doc(licenseKey).get();

    if (!doc.exists) {
        return res.status(404).json({ error: 'License not found' });
    }

    const data = doc.data();

    if (data.paid) {
        return res.json({ allowed: true, remaining: 999 });
    }

    const now = new Date();
    const trialEnd = new Date(data.trialEndDate);

    if (now > trialEnd) {
        return res.json({ allowed: false, remaining: 0, reason: 'trial_expired' });
    }

    const todayKey = now.toISOString().split('T')[0];
    const usageRef = db.collection('usage').doc(`${licenseKey}_${todayKey}`);
    const usageDoc = await usageRef.get();
    const currentCount = usageDoc.exists ? usageDoc.data().count : 0;

    if (currentCount >= FREE_DAILY_LIMIT) {
        return res.json({ allowed: false, remaining: 0, reason: 'limit_reached' });
    }

    await usageRef.set({ count: currentCount + 1, date: todayKey }, { merge: true });

    return res.json({
        allowed: true,
        remaining: FREE_DAILY_LIMIT - currentCount - 1
    });
}

async function handleCheckout(req, res) {
    const licenseKey = req.headers['x-license-key'];

    if (!licenseKey) {
        return res.status(400).json({ error: 'License key required' });
    }

    const doc = await db.collection('devices').doc(licenseKey).get();

    if (!doc.exists) {
        return res.status(404).json({ error: 'License not found' });
    }

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
            price_data: {
                currency: 'usd',
                product_data: {
                    name: 'PHANTOM TABS Pro',
                    description: 'Lifetime access - One-time payment'
                },
                unit_amount: PRICE_CENTS
            },
            quantity: 1
        }],
        mode: 'payment',
        metadata: {
            licenseKey
        },
        success_url: 'https://phantom-tabs.web.app/success',
        cancel_url: 'https://phantom-tabs.web.app/cancel'
    });

    return res.json({ url: session.url });
}

async function handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];

    let event;
    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const { licenseKey } = session.metadata;

        if (licenseKey) {
            await db.collection('devices').doc(licenseKey).update({
                paid: true,
                paidAt: new Date().toISOString(),
                stripeSessionId: session.id
            });

            console.log(`License ${licenseKey} upgraded to Pro`);
        }
    }

    return res.json({ received: true });
}

function generateLicenseKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const segments = [];
    for (let s = 0; s < 4; s++) {
        let segment = '';
        for (let i = 0; i < 4; i++) {
            segment += chars[Math.floor(Math.random() * chars.length)];
        }
        segments.push(segment);
    }
    return segments.join('-');
}
