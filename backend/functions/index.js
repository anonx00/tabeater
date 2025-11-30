const { Firestore } = require('@google-cloud/firestore');
const Stripe = require('stripe');
const functions = require('@google-cloud/functions-framework');

const db = new Firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_CENTS = 600; // 6.00 AUD
const TRIAL_DAYS = 7;
const FREE_DAILY_LIMIT = 20;

functions.http('api', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-License-Key, X-Device-Id');

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
            case 'verify-payment':
                return await handleVerifyPayment(req, res);
            case 'success':
                return handleSuccess(req, res);
            case 'cancel':
                return handleCancel(req, res);
            case 'health':
                return res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
    const deviceId = req.headers['x-device-id'];

    if (!licenseKey) {
        return res.status(400).json({ error: 'License key required' });
    }

    const doc = await db.collection('devices').doc(licenseKey).get();

    if (!doc.exists) {
        return res.status(404).json({ error: 'License not found' });
    }

    const data = doc.data();

    if (data.deviceId !== deviceId) {
        return res.status(403).json({ error: 'Device mismatch' });
    }

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
    const deviceId = req.headers['x-device-id'];

    if (!licenseKey) {
        return res.status(400).json({ error: 'License key required' });
    }

    const doc = await db.collection('devices').doc(licenseKey).get();

    if (!doc.exists) {
        return res.status(404).json({ error: 'License not found' });
    }

    const data = doc.data();

    if (data.deviceId !== deviceId) {
        return res.status(403).json({ error: 'Device mismatch' });
    }

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
    const deviceId = req.headers['x-device-id'];

    if (!licenseKey) {
        return res.status(400).json({ error: 'License key required' });
    }

    const doc = await db.collection('devices').doc(licenseKey).get();

    if (!doc.exists) {
        return res.status(404).json({ error: 'License not found' });
    }

    const data = doc.data();

    if (data.deviceId !== deviceId) {
        return res.status(403).json({ error: 'Device mismatch' });
    }

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
            price_data: {
                currency: 'aud',
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
            licenseKey,
            deviceId
        },
        success_url: `https://${req.headers.host}/success`,
        cancel_url: `https://${req.headers.host}/cancel`
    });

    return res.json({ url: session.url });
}

/**
 * Verify payment by checking Stripe for completed checkout sessions
 * This serves as a fallback when webhooks fail
 * Called by the extension when user clicks "Refresh Status" after payment
 */
async function handleVerifyPayment(req, res) {
    const licenseKey = req.headers['x-license-key'];
    const deviceId = req.headers['x-device-id'];

    if (!licenseKey) {
        return res.status(400).json({ error: 'License key required' });
    }

    const doc = await db.collection('devices').doc(licenseKey).get();

    if (!doc.exists) {
        return res.status(404).json({ error: 'License not found' });
    }

    const data = doc.data();

    // If already paid, no need to verify
    if (data.paid) {
        return res.json({ verified: true, status: 'already_pro' });
    }

    // Validate device ownership
    if (data.deviceId !== deviceId) {
        return res.status(403).json({ error: 'Device mismatch' });
    }

    try {
        // Search for completed checkout sessions with this license key in metadata
        // Search last 100 sessions to catch older payments if webhook failed
        const sessions = await stripe.checkout.sessions.list({
            limit: 100,
            expand: ['data.payment_intent']
        });

        // Find a completed session for this license
        const matchingSession = sessions.data.find(session =>
            session.metadata?.licenseKey === licenseKey &&
            session.payment_status === 'paid' &&
            session.status === 'complete'
        );

        if (matchingSession) {
            // Payment found! Activate the license
            await db.collection('devices').doc(licenseKey).update({
                paid: true,
                paidAt: new Date().toISOString(),
                stripeSessionId: matchingSession.id,
                stripePaymentIntent: matchingSession.payment_intent?.id || matchingSession.payment_intent,
                customerEmail: matchingSession.customer_details?.email || null,
                activatedVia: 'verify-payment' // Track that this was activated via fallback
            });

            console.log(`License ${licenseKey} activated via verify-payment fallback`);
            return res.json({ verified: true, status: 'activated', sessionId: matchingSession.id });
        }

        // No matching payment found
        return res.json({ verified: false, status: 'no_payment_found' });
    } catch (err) {
        console.error('Error verifying payment:', err);
        return res.status(500).json({ error: 'Failed to verify payment' });
    }
}

async function handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // Log incoming webhook for debugging
    console.log('Webhook received:', {
        hasSignature: !!sig,
        hasWebhookSecret: !!webhookSecret,
        hasRawBody: !!req.rawBody,
        contentType: req.headers['content-type']
    });

    // Ensure webhook secret is configured
    if (!webhookSecret) {
        console.error('STRIPE_WEBHOOK_SECRET is not configured');
        return res.status(500).send('Webhook secret not configured');
    }

    let event;
    try {
        // Use rawBody if available, otherwise use body for signature verification
        const payload = req.rawBody || req.body;

        // If body is already parsed as object, we need to stringify it
        // This handles cases where Cloud Functions parses JSON before we get it
        const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

        event = stripe.webhooks.constructEvent(
            req.rawBody || payloadString,
            sig,
            webhookSecret
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', {
            error: err.message,
            hasRawBody: !!req.rawBody,
            bodyType: typeof req.body
        });
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('Webhook event verified:', event.type);

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const { licenseKey, deviceId } = session.metadata || {};

        console.log('Processing checkout completion:', {
            sessionId: session.id,
            licenseKey,
            deviceId,
            paymentStatus: session.payment_status
        });

        if (!licenseKey) {
            console.error('No licenseKey in session metadata');
            return res.json({ received: true, warning: 'No licenseKey in metadata' });
        }

        try {
            const doc = await db.collection('devices').doc(licenseKey).get();

            if (!doc.exists) {
                console.error(`License ${licenseKey} not found in database`);
                return res.json({ received: true, warning: 'License not found' });
            }

            const data = doc.data();

            if (data.deviceId !== deviceId) {
                console.error(`Device mismatch for license ${licenseKey}:`, {
                    expected: data.deviceId,
                    received: deviceId
                });
                // Still upgrade if payment was successful - user paid!
                console.log('Upgrading despite device mismatch since payment was successful');
            }

            await db.collection('devices').doc(licenseKey).update({
                paid: true,
                paidAt: new Date().toISOString(),
                stripeSessionId: session.id,
                stripePaymentIntent: session.payment_intent,
                customerEmail: session.customer_details?.email || null
            });

            console.log(`License ${licenseKey} successfully upgraded to Pro`);
        } catch (dbError) {
            console.error('Database error while upgrading license:', dbError);
            return res.status(500).json({ error: 'Database error' });
        }
    }

    return res.json({ received: true });
}

function handleSuccess(req, res) {
    res.set('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Payment Successful - PHANTOM TABS</title>
    <style>
        body { font-family: system-ui; background: #0a0a0a; color: #e0e0e0; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background: #111; border: 1px solid #00ff88; border-radius: 12px; padding: 40px; text-align: center; max-width: 400px; }
        h1 { color: #00ff88; margin: 0 0 16px; }
        p { color: #888; margin: 16px 0; }
        .icon { font-size: 64px; margin-bottom: 16px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">✓</div>
        <h1>Payment Successful!</h1>
        <p>Your PHANTOM TABS Pro license is now active.</p>
        <p>Return to the extension and click "Refresh Status" to activate.</p>
    </div>
</body>
</html>`);
}

function handleCancel(req, res) {
    res.set('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Payment Cancelled - PHANTOM TABS</title>
    <style>
        body { font-family: system-ui; background: #0a0a0a; color: #e0e0e0; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background: #111; border: 1px solid #ff4444; border-radius: 12px; padding: 40px; text-align: center; max-width: 400px; }
        h1 { color: #ff4444; margin: 0 0 16px; }
        p { color: #888; margin: 16px 0; }
        .icon { font-size: 64px; margin-bottom: 16px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">✕</div>
        <h1>Payment Cancelled</h1>
        <p>No charges were made.</p>
        <p>You can try again anytime from the extension.</p>
    </div>
</body>
</html>`);
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
