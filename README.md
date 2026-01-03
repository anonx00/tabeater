# TabEater

AI-powered tab manager for Chrome. Organize and manage browser tabs with local AI or cloud providers.

## Features

- **Smart Organize** - Group tabs by domain with one click
- **Duplicate Detection** - Find and close duplicate tabs
- **Tab Chat** - Ask questions about your open tabs using AI
- **Auto-Pilot Mode** - Automatically organize new tabs in the background
- **Side Panel** - Manage tabs without leaving your current page

## AI Providers

TabEater supports multiple AI providers:

### Local AI (Privacy First)

**SmolLM2 360M via WebLLM** - Runs 100% locally using WebGPU

**Requirements:**
- Chrome 113+ or Edge 113+ with WebGPU support
- ~200MB download (one-time, cached)
- Any modern GPU

**Setup:**
1. Open TabEater Settings → AI Provider
2. Click "ENABLE LOCAL AI"
3. Wait for model download (~200MB)
4. Done! AI runs entirely on your device

**Chrome Gemini Nano** - Chrome's built-in AI (experimental)

**Requirements:**
- Chrome 128+ (Dev/Canary) or Chrome 131+ (Stable with high-end hardware)
- 8GB+ RAM (22GB+ recommended)
- ~2GB disk space for the model

**Setup:**
1. Install [Chrome Canary](https://www.google.com/chrome/canary/) or [Chrome Dev](https://www.google.com/chrome/dev/)
2. Open `chrome://flags`
3. Enable:
   - `#optimization-guide-on-device-model` → **Enabled BypassPerfRequirement**
   - `#prompt-api-for-gemini-nano` → **Enabled**
4. Click **Relaunch**
5. Wait 2-3 minutes, then go to `chrome://components`
6. Find "Optimization Guide On Device Model" and click "Check for update"
7. Wait for the ~1.7GB model download to complete

See [NANO_TROUBLESHOOTING.md](NANO_TROUBLESHOOTING.md) if you have issues.

### Cloud AI

| Provider | Setup | Cost |
|----------|-------|------|
| Google Gemini | [Get API key](https://aistudio.google.com/app/apikey) | Free tier available |
| OpenAI | [Get API key](https://platform.openai.com/api-keys) | Pay as you go |
| Anthropic Claude | [Get API key](https://console.anthropic.com/settings/keys) | Pay as you go |

Configure in TabEater → Options → Cloud AI section.

## Install

### Chrome Web Store

[Install TabEater](https://chromewebstore.google.com/detail/tabeater/khehjgmppbfpmibjcjeffbndjcnbogfj)

### From Source

```bash
git clone https://github.com/anonx00/tabeater.git
cd tabeater
npm install
npm run build
```

Load the `dist/` folder as an unpacked extension in `chrome://extensions/`

## Development

```bash
npm run watch    # Build with file watching
npm run build    # Production build
npm run lint     # Run ESLint
```

## Project Structure

```
extension/
├── src/
│   ├── background/     # Service worker
│   ├── popup/          # Extension popup
│   ├── sidepanel/      # Side panel UI
│   ├── options/        # Settings page
│   └── services/       # AI and tab services
├── public/             # Static assets
└── manifest.json
```

## Privacy

- No data collection or tracking
- Local AI processes everything on your device
- Cloud API calls go directly to your chosen provider
- API keys are stored locally only

## License

[ISC](LICENSE)
