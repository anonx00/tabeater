# Deployment Guide

Complete step-by-step guide to deploy PHANTOM TABS with payment system.

## Prerequisites

- Google Cloud Platform account with billing enabled
- Stripe account (free to create)
- SendGrid account (free tier: 100 emails/day)
- Node.js 20+ installed locally

## Step 1: Create GCP Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click "Select a project" → "New Project"
3. Name it `phantom-tabs` (or your choice)
4. Note your **Project ID** (e.g., `phantom-tabs-12345`)

## Step 2: Enable Required APIs

In Google Cloud Console, go to "APIs & Services" → "Enable APIs":

1. **Cloud Functions API** - Enable
2. **Cloud Firestore API** - Enable
3. **Cloud Build API** - Enable

## Step 3: Create Firestore Database

1. Go to "Firestore" in the console
2. Click "Create Database"
3. Select "Native mode"
4. Choose region: `us-central1` (or your preference)
5. Click "Create"

## Step 4: Install Google Cloud CLI

```bash
# macOS
brew install google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash

# Restart terminal, then:
gcloud init
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

## Step 5: Set Up Stripe

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Create account if needed
3. Go to "Developers" → "API keys"
4. Copy your **Secret key** (starts with `sk_test_` for testing, `sk_live_` for production)

### Configure Webhook (do after deploying function)

1. In Stripe, go to "Developers" → "Webhooks"
2. Click "Add endpoint"
3. URL: `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api/webhook`
4. Select events: `checkout.session.completed`
5. Click "Add endpoint"
6. Copy the **Signing secret** (starts with `whsec_`)

## Step 6: Set Up SendGrid

1. Go to [SendGrid](https://sendgrid.com) and create free account
2. Go to "Settings" → "API Keys"
3. Click "Create API Key"
4. Name it "phantom-tabs", select "Full Access"
5. Copy the API key (starts with `SG.`)

### Verify Sender (Required)

1. Go to "Settings" → "Sender Authentication"
2. Either:
   - **Single Sender Verification** (easiest): Add your email, verify it
   - **Domain Authentication** (better): Add DNS records for your domain

## Step 7: Update Extension Code

Edit `extension/src/services/license.ts` line 1:

```typescript
const API_BASE = 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api';
```

Replace `YOUR_PROJECT_ID` with your actual GCP project ID.

## Step 8: Deploy Cloud Function

```bash
cd backend/functions
npm install

# Set environment variables and deploy
export STRIPE_SECRET_KEY="sk_live_xxxxx"
export STRIPE_WEBHOOK_SECRET="whsec_xxxxx"
export SENDGRID_API_KEY="SG.xxxxx"
export FROM_EMAIL="noreply@yourdomain.com"

gcloud functions deploy api \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region=us-central1 \
  --set-env-vars="STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET,SENDGRID_API_KEY=$SENDGRID_API_KEY,FROM_EMAIL=$FROM_EMAIL"
```

After deployment, you'll see the function URL. It should be:
```
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api
```

## Step 9: Configure Stripe Webhook

Now that your function is deployed:

1. Go to Stripe Dashboard → "Developers" → "Webhooks"
2. Add endpoint URL: `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api/webhook`
3. Select event: `checkout.session.completed`
4. Copy the signing secret
5. Update your function with the webhook secret if needed

## Step 10: Build Extension

```bash
cd ../..  # back to project root
npm run build
```

The `dist/` folder now contains your extension.

## Step 11: Test Locally

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder
5. Test the extension!

### Test Payment Flow

1. Click extension → Upgrade
2. Enter email
3. Use Stripe test card: `4242 4242 4242 4242`
4. Any future date, any CVC
5. Check your email for activation code
6. Enter code in Config page

## Step 12: Publish to Chrome Web Store

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay one-time $5 registration fee
3. Click "New Item"
4. Upload `dist/` folder as ZIP:
   ```bash
   cd dist && zip -r ../phantom-tabs.zip . && cd ..
   ```
5. Fill in listing details
6. Submit for review

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Extension     │────▶│  Cloud Function  │────▶│  Firestore  │
│   (Browser)     │     │   (API Server)   │     │ (Database)  │
└─────────────────┘     └──────────────────┘     └─────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     Stripe      │
                    │  (Payments)     │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │    SendGrid     │
                    │    (Emails)     │
                    └─────────────────┘
```

## Payment Flow

1. User clicks "Upgrade" in extension
2. User enters email
3. Extension calls `/checkout` endpoint
4. Backend creates Stripe Checkout session
5. User pays on Stripe's secure page (supports Google Pay, Apple Pay, Cards)
6. Stripe webhook calls `/webhook`
7. Backend generates activation code
8. SendGrid emails code to user
9. User enters code in extension Config
10. Extension calls `/activate` → permanent Pro status

## Cost Breakdown (Monthly)

| Service | Free Tier | Paid |
|---------|-----------|------|
| Cloud Functions | 2M invocations/month | $0.40/million |
| Firestore | 50K reads, 20K writes/day | $0.06/100K reads |
| Stripe | 2.9% + $0.30 per transaction | - |
| SendGrid | 100 emails/day | $15/mo for 50K |

**Estimated cost for 1,000 users**: ~$5-10/month

## Troubleshooting

### Function not deploying
```bash
gcloud functions logs read api --region=us-central1
```

### Emails not sending
- Check SendGrid activity log
- Verify sender is authenticated
- Check FROM_EMAIL matches verified sender

### Webhook not working
- Verify webhook URL is correct
- Check Stripe webhook logs
- Ensure STRIPE_WEBHOOK_SECRET is set

### CORS errors
The function includes CORS headers. If issues persist, check browser console.

## Security Notes

1. Never commit API keys to git
2. Use environment variables for secrets
3. Stripe handles all payment data
4. License keys are unique per device
5. Activation codes are one-time use

## Going Live Checklist

- [ ] Switch to Stripe live keys (`sk_live_`, `pk_live_`)
- [ ] Verify sender domain in SendGrid
- [ ] Test full payment flow with real card
- [ ] Update privacy policy with payment info
- [ ] Submit to Chrome Web Store
