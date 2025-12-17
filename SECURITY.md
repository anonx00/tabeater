# Security & License Protection

## Overview

TabEater uses a multi-layer license protection system to prevent unauthorized usage while keeping the codebase open source.

## License System Architecture

### 1. Backend Validation (Primary Protection)

**Server-side enforcement at:** `https://api-5dab6ha67q-uc.a.run.app`

All license operations are validated server-side:
- `/register` - Creates new device/license registration
- `/status` - Returns current license status
- `/use` - Records AI usage and enforces limits
- `/checkout` - Generates Stripe payment links
- `/verify-payment` - Verifies Stripe payments
- `/verify-by-email` - Cross-device license activation

**This is the primary security layer.** Even if someone modifies the frontend code, the backend enforces all limits.

### 2. Build-Time Protection

**Environment Variables** (injected at build time via webpack):
- `DEV_MODE` - Development mode flag (default: false)
- `API_BASE` - Backend API endpoint

These are injected using webpack's `DefinePlugin` and become **hardcoded constants** in the built bundle.

**Files:**
- `webpack.config.js` - Defines environment variable injection
- `.env` - Local environment config (gitignored, never committed)
- `.env.example` - Template for environment variables

### 3. Source Code Protection

While the source is public, the following protections are in place:

**Cannot be bypassed without backend access:**
- Daily usage limits (20 queries for free tier)
- Pro feature access (Auto Pilot)
- Trial expiration (7 days)
- Device registration

**Can be bypassed locally (but useless without backend):**
- Frontend license checks
- UI state management
- Local storage

## For Open Source Contributors

### Running Locally for Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/anonx00/tabeater.git
   cd tabeater
   npm install
   ```

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

3. **Set DEV_MODE for local development:**
   Edit `.env`:
   ```
   DEV_MODE=true
   API_BASE=https://api-5dab6ha67q-uc.a.run.app
   ```

4. **Build and test:**
   ```bash
   npm run build
   ```

**Note:** DEV_MODE bypasses license checks **locally only**. This is for development purposes. You cannot distribute builds with DEV_MODE=true.

### What DEV_MODE Does

When `DEV_MODE=true`:
- ✅ Unlimited AI queries locally
- ✅ All Pro features unlocked
- ✅ No trial limits
- ❌ **Still requires backend for AI processing** (unless using Gemini Nano)
- ❌ **Cannot be used for production/distribution**

### Production Builds

**Official builds from Chrome Web Store:**
- Built with `DEV_MODE=false`
- Connected to production backend
- License enforcement active
- Distributed as signed extension

**Self-built versions:**
- If you build from source with `DEV_MODE=false`, license checks are active
- You'll go through normal trial → upgrade flow
- No different from Chrome Web Store version

## What Happens If Someone Tries to Bypass?

### Scenario 1: Change `DEV_MODE` in Source

**Action:** User changes `.env` to `DEV_MODE=true` and builds

**Result:**
- ✅ Frontend checks bypassed
- ✅ Unlimited local features (if using Gemini Nano)
- ❌ Cloud AI still requires valid API keys
- ❌ Backend still enforces limits for cloud AI
- ✅ **This is fine** - they're using their own hardware/API keys

**Impact:** None. This is expected for self-hosted/development use.

### Scenario 2: Modify License Service Code

**Action:** User comments out license checks in `license.ts`

**Result:**
- ✅ Frontend UI shows "Pro" status
- ❌ Backend still enforces limits
- ❌ Cloud AI requests fail at server
- ❌ Pro features return "Trial Expired" errors from backend

**Impact:** None. Backend validation prevents unauthorized access.

### Scenario 3: Reverse Engineer API

**Action:** User tries to call backend API directly

**Result:**
- ❌ Device ID validation fails
- ❌ License key validation fails
- ❌ Stripe payment verification required
- ❌ Cannot generate fake license keys (server-side UUID generation)

**Impact:** None. Backend enforces all security.

### Scenario 4: Build with Different Backend

**Action:** User deploys their own backend and changes `API_BASE`

**Result:**
- ✅ They can run their own instance
- ✅ They need to set up:
  - Google Cloud Run deployment
  - Firestore database
  - Stripe payment integration
  - Email delivery system
- ✅ **This is fine** - they're running their own infrastructure

**Impact:** None. This is open source - self-hosting is allowed.

## Why This Approach?

### Open Source + Paid = Sustainable

**Philosophy:**
1. **Code transparency** - Users can audit privacy/security
2. **Self-hosting allowed** - Advanced users can run their own backend
3. **Convenience tax** - Most users pay for hosted service
4. **Fair pricing** - $2 AUD/month subscription

### What You're Paying For

When you buy TabEater Pro:
- ✅ Hosted backend infrastructure (Google Cloud)
- ✅ Stripe payment processing
- ✅ License management
- ✅ Updates via Chrome Web Store
- ✅ Support and maintenance
- ✅ **Not** paying for closed-source code

### What's Actually Protected

**Not protected (intentionally):**
- Source code (open source)
- AI prompts and logic
- UI/UX implementation
- Extension architecture

**Protected (backend-enforced):**
- Usage limits (20/day free)
- Trial duration (7 days)
- Payment verification
- Cross-device licensing

## Self-Hosting Backend

If you want to run your own TabEater backend:

**Requirements:**
- Google Cloud account
- Firestore database
- Stripe account (if accepting payments)
- Cloud Run deployment

**Steps:**
1. Deploy backend from `/backend` folder (not included in extension repo)
2. Set up Firestore collections
3. Configure Stripe webhooks
4. Update `API_BASE` in `.env`
5. Build and distribute your own extension

**Cost:** ~$5-10/month for small user base (GCP + Stripe fees)

## Reporting Security Issues

If you find a security vulnerability that could:
- Bypass payment without backend access
- Steal license keys
- Access other users' data
- Exploit the backend API

Please report privately to: https://github.com/anonx00/tabeater/security/advisories

**Do not** publicly disclose security vulnerabilities.

## License

ISC License - See LICENSE file

**TL;DR:**
- ✅ Use the code
- ✅ Modify the code
- ✅ Distribute the code
- ✅ Self-host the backend
- ❌ Distribute modified builds claiming to be "official"
- ❌ Bypass backend for commercial use without payment
