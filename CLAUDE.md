# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TabEater** is an AI-powered Chrome extension for intelligent tab management. It combines local AI (WebLLM with SmolLM2, Chrome Gemini Nano) and cloud AI providers (Gemini, OpenAI, Anthropic) with a Stripe-powered licensing backend deployed on Google Cloud Platform.

## Development Commands

### Extension Development
```bash
npm install              # Install dependencies
npm run build            # Production build → dist/
npm run watch            # Development build with file watching
npm run lint             # Run ESLint
npm run test             # Run Jest tests
npm run icons            # Generate icons (auto-run during build)
npm run package          # Build and create ZIP for distribution
```

### Backend Development
```bash
cd backend/functions
npm install
npm start                # Run Cloud Function locally with functions-framework
npm run deploy           # Deploy to GCP (use ./deploy.sh instead)
```

### Deployment
```bash
./deploy.sh              # Interactive deployment script
                         # Choose: DEV (local testing, DEV_MODE=true)
                         #     or: PROD (full GCP deployment with Stripe)
```

### Infrastructure
```bash
cd terraform
terraform init
terraform plan -var="project_id=YOUR_ID" -var="stripe_secret_key=sk_..." -var="stripe_webhook_secret=whsec_..."
terraform apply          # Deploy Cloud Functions, Firestore, Secret Manager
```

### Testing
```bash
npm test                                          # Run all tests
npm test -- extension/src/ai/gemini-nano.test.ts # Run specific test file
npm test -- --watch                               # Watch mode
```

## Architecture

### Extension Structure (Chrome MV3)

**Entry Points** (webpack builds these):
- `background/service-worker.ts` - Service worker, message routing, offscreen document management
- `popup/index.tsx` - Main popup UI (React)
- `sidepanel/index.tsx` - Side panel UI (React)
- `options/index.tsx` - Settings page (React)
- `offscreen/index.ts` - Offscreen document for WebLLM (WebGPU processing)

**Services** (`extension/src/services/`):
- `ai.ts` - AI orchestration layer, provider selection (WebLLM/Nano/Cloud), rate limiting
- `autopilot.ts` - Auto-Pilot modes: manual/auto-cleanup/fly-mode, tab analysis
- `license.ts` - License management, Stripe integration, DEV_MODE toggle
- `tabs.ts` - Tab operations (organize, dedupe, group creation)
- `memory.service.ts` - Memory monitoring, performance tracking

**AI Providers** (`extension/src/ai/`):
- `webllm.ts` - WebLLM integration (SmolLM2 360M), runs in offscreen document
- `gemini-nano.ts` - Chrome Gemini Nano built-in AI
- `cloud-fallback.ts` - Cloud API fallback logic
- `prompts.ts` - System prompts for tab analysis

**Key Patterns**:
1. **Offscreen Document for WebLLM**: Service worker cannot use WebGPU directly. The offscreen document (`offscreen/index.ts`) hosts the WebLLM engine. Service worker communicates via `chrome.runtime.sendMessage` with health checks.

2. **Message Routing**: Service worker (`background/service-worker.ts`) routes messages between popup/sidepanel/offscreen. All messages have `action` field and optional `payload`.

3. **AI Provider Fallback Chain**:
   - User preference: WebLLM → Nano → Cloud (Gemini/OpenAI/Anthropic)
   - License check for cloud APIs (free tier: 20 calls/day, PRO: unlimited)

4. **DEV_MODE Toggle**: `extension/src/services/license.ts` has `const DEV_MODE = false/true`. When true, all license checks are bypassed, AI limits disabled. The `./deploy.sh` script toggles this.

### Backend Architecture (GCP)

**Cloud Function** (`backend/functions/index.js`):
- Single Node.js Cloud Function (Gen2) with multiple routes
- Routes: `/register`, `/status`, `/use`, `/checkout`, `/webhook`, `/verify-payment`
- Uses Firestore for license storage, Stripe for payments

**Data Model** (Firestore):
- Collection: `licenses`
- Document ID: license key (UUID)
- Fields: `email`, `stripeCustomerId`, `subscriptionId`, `status`, `devices[]`, `created`, `updated`

**Terraform** (`terraform/main.tf`):
- Provisions: Cloud Function, Firestore, Secret Manager (Stripe keys), IAM roles
- Outputs: `function_url`, `webhook_url`, `service_account_email`

### Configuration Files

**Webpack** (`webpack.config.js`):
- Path alias: `@/` → `extension/src/`
- Defines `process.env.DEV_MODE` and `process.env.API_BASE`
- Copies `manifest.json` and `public/` to `dist/`

**TypeScript** (`tsconfig.json`):
- Strict mode enabled
- Path alias: `@/*` → `extension/src/*`

**Tailwind** (`tailwind.config.js`, `postcss.config.js`):
- Scans `extension/src/**/*.{tsx,jsx,html}`
- Uses Tailwind v4 with PostCSS

## Important Implementation Notes

### AI Provider Selection Logic

The AI service (`services/ai.ts`) selects providers in this order:
1. Check user preference (`preferWebLLM` flag)
2. If WebLLM preferred and available → use WebLLM
3. Else check Nano availability → use Nano
4. Else check cloud API key → use cloud provider
5. Otherwise fail with "No AI provider available"

Cloud API calls are rate-limited and require license verification for unlimited use.

### Offscreen Document Lifecycle

- Service worker creates offscreen document on first WebLLM use
- Health checks (`pingOffscreen()`) verify responsiveness
- If unhealthy, service worker recreates the offscreen document
- Offscreen sends heartbeat messages to prevent service worker from sleeping

### License System

- Free tier: 20 AI calls/day on cloud APIs, unlimited local AI
- PRO tier ($2 AUD/month): Unlimited AI calls, up to 5 devices per license
- DEV_MODE bypasses all license checks
- License keys stored in `chrome.storage.local`, verified against backend

### Auto-Pilot Modes

1. **Manual**: User clicks "Organize" or "Find Duplicates"
2. **Auto-Cleanup**: Automatically closes stale tabs and duplicates based on thresholds
3. **Fly-Mode**: Full automation, uses AI to analyze and organize tabs in background

Fly-mode requires PRO license due to AI usage volume.

## Testing Guidelines

- Unit tests use Jest with jsdom environment
- Mock Chrome APIs in tests (`chrome.storage`, `chrome.tabs`, etc.)
- Test setup in `extension/src/setupTests.ts`
- AI provider tests mock `chrome.runtime.sendMessage` and `window.ai`

## Environment Variables

**Extension** (set via webpack DefinePlugin):
- `process.env.DEV_MODE` - Enable/disable dev mode
- `process.env.API_BASE` - Backend API URL

**Backend** (Cloud Function env vars):
- `STRIPE_SECRET_KEY` - Stored in Secret Manager
- `STRIPE_WEBHOOK_SECRET` - Stored in Secret Manager

## Deployment Modes

**DEV Mode**:
- Sets `DEV_MODE = true` in `license.ts`
- No backend required
- Unlimited AI, PRO status always active
- For local development and testing

**PROD Mode**:
- Sets `DEV_MODE = false`
- Deploys backend to GCP
- Requires Stripe API keys
- Enforces license checks and rate limits

## Common Debugging

**WebLLM not working**:
- Check offscreen document created: Chrome DevTools → Service Workers → Inspect offscreen
- Check WebGPU support: `chrome://gpu/`
- Verify model download: Network tab for `*.wasm` files from HuggingFace CDN

**Nano not available**:
- Check `chrome://flags/#optimization-guide-on-device-model`
- Check `chrome://components` for "Optimization Guide On Device Model"
- Requires Chrome 128+ (Dev/Canary) or 131+ (Stable with high-end hardware)

**License issues**:
- Check `chrome.storage.local` for `licenseKey` and `licenseStatus`
- Verify backend URL matches deployed function
- Check backend logs: `gcloud functions logs read api --region=us-central1`

**Build errors**:
- Clear `dist/` and rebuild
- Check Node.js version (requires 20+)
- Verify all dependencies installed (`npm install` in root and `backend/functions`)
