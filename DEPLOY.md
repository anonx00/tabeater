# PHANTOM TABS - Deployment Guide

## Quick Start

```bash
git clone https://github.com/anonx00/tabeater && cd tabeater && ./deploy.sh
```

---

## Step 1: Test Locally (DEV Mode)

Before publishing, always test the extension locally first.

### Build

```bash
./deploy.sh
# Select: 1 (DEV mode)
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select the `dist/` folder

### Test Checklist

| Feature | How to Test | Expected |
|---------|-------------|----------|
| Popup | Click extension icon | Shows tab list |
| Organize | Click "Organize" button | Tabs grouped by domain |
| Duplicates | Click "Duplicates" | Shows duplicate tabs |
| AI Analysis | Click "Analyze" | AI insights appear |
| Options | Click "Config" | Settings page opens |
| Side Panel | Right-click icon → Open side panel | Panel opens |
| License | Check status in popup | Shows "PRO" in dev mode |

### Test AI (Required for Analysis)

**Option A: Gemini Nano (Local AI)**
1. Chrome 127+ required
2. Go to `chrome://flags/#optimization-guide-on-device-model`
3. Set to **Enabled BypassPerfRequirement**
4. Restart Chrome

**Option B: Cloud API**
1. Click "Config" in popup
2. Select provider (Gemini/OpenAI/Anthropic)
3. Enter API key
4. Save

### Check for Errors

1. Right-click popup → **Inspect**
2. Check Console tab for errors
3. Check `chrome://extensions` → click "Errors" link

---

## Step 2: Deploy Backend (PROD Mode)

After testing passes, deploy the production backend.

### Prerequisites

- GCP Project with billing enabled
- Stripe account: [dashboard.stripe.com](https://dashboard.stripe.com)

### Deploy

```bash
./deploy.sh
# Select: 2 (PROD mode)
# Enter GCP Project ID
# Enter Stripe Secret Key (sk_test_xxx or sk_live_xxx)
# Enter Stripe Publishable Key (pk_test_xxx or pk_live_xxx)
```

### Configure Stripe Webhook

After deploy, configure the webhook:

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Paste Webhook URL from deploy output
4. Select event: `checkout.session.completed`
5. Copy signing secret, then run:

```bash
cd terraform && terraform apply \
  -var="project_id=YOUR_PROJECT" \
  -var="stripe_secret_key=sk_xxx" \
  -var="stripe_webhook_secret=whsec_xxx"
```

---

## Step 3: Test Production Build

Test with real backend before publishing.

### Rebuild

```bash
npm run build
cd dist && zip -r ../phantom-tabs.zip . && cd ..
```

### Test Checklist (PROD)

| Feature | Expected |
|---------|----------|
| License status | Shows "Trial" (not PRO) |
| Usage counter | Shows "X/20 per day" |
| Upgrade button | Visible in popup |
| Pay Now | Opens Stripe checkout |
| After payment | Status changes to PRO |
| Refresh Status | Updates license |

---

## Step 4: Publish to Chrome Web Store

### Package

```bash
cd dist && zip -r ../phantom-tabs.zip . && cd ..
cloudshell download phantom-tabs.zip
```

### Submit

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click **New Item** → Upload `phantom-tabs.zip`
3. Fill store listing:

**Category:** Productivity
**Language:** English

**Description:**
```
PHANTOM TABS - Tactical Tab Intelligence System

Take control of your browser tabs with AI-powered intelligence.

• Smart Organization - Group tabs by domain automatically
• Duplicate Detection - Find and close duplicates instantly
• AI Analysis - Get insights on your browsing patterns
• Quick Search - Find any tab across windows

FREE: 7-day trial, 20 AI queries/day
PRO: $9.99 one-time for unlimited access

Privacy-focused: Data stays on your device.
```

### Graphics

Generate: `node scripts/generate-store-assets.js`

| Asset | Size | Location |
|-------|------|----------|
| Store icon | 128x128 | `dist/icon128.png` |
| Screenshots | 1280x800 | `store/screenshot-*.png` |
| Small promo | 440x280 | `store/small-promo.png` |
| Marquee | 1400x560 | `store/marquee-promo.png` |

---

## Troubleshooting

### Service worker error
```
Error: Cannot read properties of undefined
```
- Check for Chrome APIs not declared in manifest
- Verify all permissions in `manifest.json`

### API calls fail
```bash
# Check logs
gcloud functions logs read api --region=us-central1

# Test endpoint
curl https://YOUR_FUNCTION_URL/status
```

### Terraform error
```bash
# Re-authenticate
gcloud auth application-default login

# Check APIs enabled
gcloud services list --enabled
```

### Stripe webhook fails
- Verify webhook secret matches
- Check Stripe Dashboard → Webhooks → Events

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Chrome Ext     │────▶│  Cloud Function │
│  (popup/panel)  │     │  (Node.js)      │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼─────┐           ┌───────▼───────┐
              │ Firestore │           │    Stripe     │
              │ (licenses)│           │  (payments)   │
              └───────────┘           └───────────────┘
```

---

## Costs

| Service | Free Tier | After |
|---------|-----------|-------|
| Cloud Functions | 2M/month | $0.40/M |
| Firestore | 50K reads/day | $0.06/100K |
| Cloud Run | 2M/month | $0.40/M |

**Typical:** $0-5/month for <1000 users
