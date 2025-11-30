# PHANTOM TABS - One-Click Deploy

## Quick Start (Google Cloud Shell)

Open [Google Cloud Shell](https://shell.cloud.google.com) and run:

```bash
git clone https://github.com/anonx00/tabeater && cd tabeater && ./deploy.sh
```

The script will:
- Auto-detect your GCP project
- Ask for DEV or PROD mode
- Handle all setup automatically

## Deployment Modes

### DEV Mode (Local Testing)
- No GCP or Stripe required
- Unlimited AI queries
- PRO status always active
- Perfect for development

### PROD Mode (Full Deployment)
- Deploys to GCP with Terraform
- Stripe payment integration
- License management via Firestore
- Production-ready

## Prerequisites

### For DEV Mode
- Node.js 18+

### For PROD Mode
- GCP Project with billing enabled
- Stripe account (get keys from [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys))

## What Gets Deployed (PROD)

| Resource | Purpose | Cost |
|----------|---------|------|
| Cloud Function (Gen2) | API server | Free tier: 2M calls/month |
| Firestore | License storage | Free tier: 50K reads/day |
| Service Account | Minimal permissions | Free |

**Estimated: $0-5/month** for small user base.

## After PROD Deployment

### Configure Stripe Webhook

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Paste the Webhook URL from deploy output
4. Select event: `checkout.session.completed`
5. Copy signing secret and update:

```bash
cd terraform && terraform apply \
  -var="project_id=YOUR_PROJECT" \
  -var="stripe_secret_key=sk_xxx" \
  -var="stripe_webhook_secret=whsec_xxx"
```

## Load Extension

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

## Publish to Chrome Web Store

```bash
cd dist && zip -r ../phantom-tabs.zip .
```

Upload `phantom-tabs.zip` to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Troubleshooting

**Deploy fails with permission error:**
```bash
gcloud auth application-default login
```

**View function logs:**
```bash
gcloud functions logs read api --region=us-central1
```

**Test Stripe webhook locally:**
```bash
stripe trigger checkout.session.completed
```
