# PHANTOM TABS

AI-powered tab intelligence system for Chrome. Organize, analyze, and manage browser tabs with local AI or cloud fallback.

## Features

- **Smart Organize** - Auto-group tabs by domain
- **Duplicate Detection** - Find and close duplicate tabs
- **AI Analysis** - Get insights about your browsing session
- **Tab Chat** - Ask questions about open tabs
- **Side Panel** - Tactical command center view

## AI Providers

| Priority | Provider | Setup |
|----------|----------|-------|
| 1 | Chrome Nano | Enable in `chrome://flags` (local, free) |
| 2 | Google Gemini | [Get API key](https://aistudio.google.com/app/apikey) (free tier) |
| 2 | OpenAI | [Get API key](https://platform.openai.com/api-keys) |
| 2 | Anthropic | [Get API key](https://console.anthropic.com/settings/keys) |

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
