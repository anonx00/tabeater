# Deployment Guide

Simple step-by-step guide to deploy PHANTOM TABS.

## How It Works

```
User clicks "Pay Now" → Stripe Checkout → Payment completes
                                              ↓
         Webhook auto-activates license → User clicks "Refresh" → PRO!
```

No email, no codes, no accounts. Just pay and go.

## Step 1: Create GCP Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project named `phantom-tabs`
3. Note your **Project ID**

## Step 2: Enable APIs

In GCP Console → "APIs & Services" → "Enable APIs":

- Cloud Functions API
- Cloud Firestore API
- Cloud Build API

## Step 3: Create Firestore Database

1. Go to "Firestore" in console
2. Click "Create Database"
3. Select "Native mode"
4. Choose region: `us-central1`

## Step 4: Set Up Stripe

1. Create account at [stripe.com](https://stripe.com)
2. Go to Developers → API keys
3. Copy your **Secret key** (`sk_test_...` or `sk_live_...`)

## Step 5: Install gcloud CLI

```bash
# macOS
brew install google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash

# Then login
gcloud init
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

## Step 6: Deploy Backend

```bash
cd backend/functions
npm install

# Deploy with your Stripe key
gcloud functions deploy api \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region=us-central1 \
  --set-env-vars="STRIPE_SECRET_KEY=sk_live_xxxxx,STRIPE_WEBHOOK_SECRET=whsec_xxxxx"
```

Your function URL: `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api`

## Step 7: Configure Stripe Webhook

1. In Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api/webhook`
3. Select event: `checkout.session.completed`
4. Copy the signing secret (`whsec_...`)
5. Update your function with the webhook secret

## Step 8: Update Extension

Edit `extension/src/services/license.ts` line 1:

```typescript
const API_BASE = 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api';
```

## Step 9: Build & Test

```bash
npm run build
```

Load `dist/` folder in Chrome → Test payment flow.

## Step 10: Publish

```bash
cd dist && zip -r ../phantom-tabs.zip .
```

Upload to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Cost Estimate

| Service | Free Tier |
|---------|-----------|
| Cloud Functions | 2M invocations/month |
| Firestore | 50K reads/day, 20K writes/day |
| Stripe | 2.9% + $0.30 per transaction |

**~$0-5/month** for small user base.

## Troubleshooting

**Webhook not firing?**
- Check Stripe webhook logs
- Verify URL is correct
- Check function logs: `gcloud functions logs read api`

**Payment not activating?**
- User should click "Refresh Status" after payment
- Check Firestore for the license document
