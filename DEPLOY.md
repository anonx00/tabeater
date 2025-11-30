# Deployment Guide

One-click deployment using Terraform.

## Prerequisites

1. **GCP Account** with billing enabled
2. **Stripe Account** (free) - get keys from dashboard.stripe.com

Install required tools:

```bash
# macOS
brew install google-cloud-sdk terraform

# Linux
# gcloud: https://cloud.google.com/sdk/docs/install
# terraform: https://developer.hashicorp.com/terraform/downloads
```

## Quick Deploy (One Command)

```bash
./deploy.sh YOUR_PROJECT_ID sk_test_xxxxx
```

That's it! The script will:
- Enable required GCP APIs
- Create Firestore database
- Create service account with minimal permissions
- Deploy Cloud Function
- Update extension config

## What Gets Created

| Resource | Purpose | Cost |
|----------|---------|------|
| Cloud Function (Gen2) | API server | Free tier: 2M invocations/month |
| Firestore | License storage | Free tier: 50K reads/day |
| Service Account | Single SA for everything | Free |
| Cloud Storage | Function source | ~$0.01/month |

**Estimated cost: $0-5/month** for small user base.

## After Deployment

### 1. Configure Stripe Webhook

The deploy script outputs your webhook URL. Go to Stripe Dashboard:

1. Developers → Webhooks → Add endpoint
2. URL: `https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/api/webhook`
3. Events: Select `checkout.session.completed`
4. Copy the signing secret (`whsec_xxx`)

### 2. Update Webhook Secret

```bash
cd terraform
terraform apply \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="stripe_secret_key=sk_test_xxx" \
  -var="stripe_webhook_secret=whsec_xxx"
```

### 3. Disable Dev Mode

Edit `extension/src/services/license.ts`:

```typescript
const DEV_MODE = false;  // Change from true to false
```

### 4. Build & Test

```bash
npm run build
```

Load `dist/` in Chrome as unpacked extension.

### 5. Publish

```bash
cd dist && zip -r ../phantom-tabs.zip .
```

Upload to Chrome Web Store.

## Manual Deployment (Without Terraform)

If you prefer manual setup:

```bash
# 1. Set project
gcloud config set project YOUR_PROJECT_ID

# 2. Enable APIs
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  run.googleapis.com

# 3. Create Firestore
gcloud firestore databases create --region=us-central1

# 4. Deploy function
cd backend/functions
gcloud functions deploy api \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region=us-central1 \
  --set-env-vars="STRIPE_SECRET_KEY=sk_xxx,STRIPE_WEBHOOK_SECRET=whsec_xxx"
```

## Troubleshooting

**Deploy fails with permission error:**
```bash
gcloud auth application-default login
```

**Function not responding:**
```bash
gcloud functions logs read api --region=us-central1
```

**Webhook not working:**
- Check Stripe webhook logs in dashboard
- Verify webhook secret is set correctly
- Test with Stripe CLI: `stripe trigger checkout.session.completed`

## Security

- Single service account with minimal permissions (Firestore + Logging only)
- No secrets in code - all via environment variables
- License bound to device ID - can't share keys
- Stripe handles all payment data

## Updating

To update the function after code changes:

```bash
cd terraform
terraform apply -var="project_id=xxx" -var="stripe_secret_key=xxx" -var="stripe_webhook_secret=xxx"
```

Or rebuild extension only:

```bash
npm run build
```
