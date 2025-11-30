const { Firestore } = require('@google-cloud/firestore');
const Stripe = require('stripe');

const firestore = new Firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCT_PRICE = 999;
const FREE_TIER_LIMIT = 20;
const TRIAL_DAYS = 7;

const cors = (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-License-Key, X-Device-Id');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return true;
    }
    return false;
};

exports.api = async (req, res) => {
    if (cors(req, res)) return;

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
                res.status(404).json({ error: 'Not found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

async function handleRegister(req, res) {
    const { deviceId } = req.body;
    if (!deviceId) {
        return res.status(400).json({ error: 'Device ID required' });
    }

    const licenseKey = generateLicenseKey();
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    await firestore.collection('licenses').doc(licenseKey).set({
        deviceId,
        licenseKey,
        status: 'trial',
        usageCount: 0,
        usageResetDate: now.toISOString().split('T')[0],
        trialEndDate: trialEnd.toISOString(),
        createdAt: now.toISOString(),
        paid: false
    });

    res.json({
        licenseKey,
        status: 'trial',
        trialEndDate: trialEnd.toISOString(),
        usageRemaining: FREE_TIER_LIMIT
    });
}

async function handleStatus(req, res) {
    const licenseKey = req.headers['x-license-key'];
    if (!licenseKey) {
        return res.status(400).json({ error: 'License key required' });
    }

    const doc = await firestore.collection('licenses').doc(licenseKey).get();
    if (!doc.exists) {
        return res.status(404).json({ error: 'License not found' });
    }

    const data = doc.data();
    const today = new Date().toISOString().split('T')[0];

    if (data.usageResetDate !== today) {
        await doc.ref.update({
            usageCount: 0,
            usageResetDate: today
        });
        data.usageCount = 0;
    }

    const now = new Date();
    const trialEnd = new Date(data.trialEndDate);
    const trialExpired = now > trialEnd;

    let status = data.status;
    let usageRemaining = FREE_TIER_LIMIT - data.usageCount;

    if (data.paid) {
        status = 'pro';
        usageRemaining = -1;
    } else if (trialExpired) {
        status = 'expired';
        usageRemaining = 0;
    }

    res.json({
        status,
        paid: data.paid,
        usageRemaining,
        trialEndDate: data.trialEndDate,
        canUse: status === 'pro' || (status === 'trial' && usageRemaining > 0)
    });
}

async function handleUse(req, res) {
    const licenseKey = req.headers['x-license-key'];
    if (!licenseKey) {
        return res.status(400).json({ error: 'License key required' });
    }

    const doc = await firestore.collection('licenses').doc(licenseKey).get();
    if (!doc.exists) {
        return res.status(404).json({ error: 'License not found' });
    }

    const data = doc.data();

    if (data.paid) {
        return res.json({ allowed: true, remaining: -1 });
    }

    const now = new Date();
    const trialEnd = new Date(data.trialEndDate);
    if (now > trialEnd) {
        return res.json({ allowed: false, reason: 'trial_expired' });
    }

    const today = now.toISOString().split('T')[0];
    let usageCount = data.usageCount;

    if (data.usageResetDate !== today) {
        usageCount = 0;
    }

    if (usageCount >= FREE_TIER_LIMIT) {
        return res.json({ allowed: false, reason: 'limit_reached', remaining: 0 });
    }

    await doc.ref.update({
        usageCount: usageCount + 1,
        usageResetDate: today
    });

    res.json({
        allowed: true,
        remaining: FREE_TIER_LIMIT - usageCount - 1
    });
}

async function handleCheckout(req, res) {
    const licenseKey = req.headers['x-license-key'];
    if (!licenseKey) {
        return res.status(400).json({ error: 'License key required' });
    }

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
            price_data: {
                currency: 'usd',
                product_data: {
                    name: 'PHANTOM TABS Pro',
                    description: 'Lifetime access to all AI features'
                },
                unit_amount: PRODUCT_PRICE
            },
            quantity: 1
        }],
        mode: 'payment',
        success_url: `${req.headers.origin || 'https://phantom-tabs.web.app'}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin || 'https://phantom-tabs.web.app'}/cancel`,
        metadata: {
            licenseKey
        }
    });

    res.json({ url: session.url, sessionId: session.id });
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
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const licenseKey = session.metadata.licenseKey;

        if (licenseKey) {
            await firestore.collection('licenses').doc(licenseKey).update({
                paid: true,
                status: 'pro',
                paidAt: new Date().toISOString(),
                stripeSessionId: session.id,
                customerEmail: session.customer_details?.email
            });
        }
    }

    res.json({ received: true });
}

function generateLicenseKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = 'PT-';
    for (let i = 0; i < 4; i++) {
        if (i > 0) key += '-';
        for (let j = 0; j < 4; j++) {
            key += chars[Math.floor(Math.random() * chars.length)];
        }
    }
    return key;
}
