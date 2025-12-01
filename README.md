# TabEater

AI-powered tab intelligence system for Chrome. Organize, analyze, and manage browser tabs with local AI or cloud fallback.

## Features

- **Smart Organize** - Auto-group tabs by domain
- **Duplicate Detection** - Find and close duplicate tabs
- **AI Analysis** - Get insights about your browsing session
- **Tab Chat** - Ask questions about open tabs
- **Side Panel** - Tactical command center view

## AI Providers

TabEater supports multiple AI providers with automatic fallback:

### Local AI (Recommended - Privacy First)

**Chrome Gemini Nano** - Runs entirely on your device, completely private

**Requirements:**
- Chrome 128+ (Dev/Canary channel) OR Chrome 131+ (Stable, high-end hardware only)
- 8GB+ RAM (22GB+ recommended)
- 2GB+ free disk space for model

**Setup:**
1. Install [Chrome Canary](https://www.google.com/chrome/canary/) or [Chrome Dev](https://www.google.com/chrome/dev/)
2. Open `chrome://flags` in the new Chrome
3. Enable these two flags:
   - `#optimization-guide-on-device-model` → **Enabled BypassPerfRequirement**
   - `#prompt-api-for-gemini-nano` → **Enabled**
4. Click **Relaunch** button (bottom of page)
5. Wait 2-3 minutes after relaunch
6. Go to `chrome://components`
7. Find "Optimization Guide On Device Model"
8. Click "Check for update" (downloads ~1.7GB model)
9. Wait for download to complete
10. Install TabEater extension and enjoy local AI!

**Troubleshooting:** See [NANO_TROUBLESHOOTING.md](NANO_TROUBLESHOOTING.md) if Nano isn't working

### Cloud AI (Works on Any Chrome Version)

| Provider | Setup | Cost |
|----------|-------|------|
| Google Gemini | [Get API key](https://aistudio.google.com/app/apikey) | Free tier available |
| OpenAI | [Get API key](https://platform.openai.com/api-keys) | Pay as you go |
| Anthropic Claude | [Get API key](https://console.anthropic.com/settings/keys) | Pay as you go |

Configure in TabEater → Options → Cloud AI section

## Install

### From Source
```bash
git clone https://github.com/anonx00/tabeater.git
cd tabeater
npm install
npm run build
```

Load `dist/` folder as unpacked extension in `chrome://extensions/`

### From Chrome Web Store
Coming soon

## Development

```bash
npm run watch    # Build with hot reload
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

- No data collection
- Local AI preferred (Chrome Nano)
- Cloud API calls go directly to provider
- Your API keys stored locally only

## License

ISC
