# Privacy Policy for TabEater

**Last Updated:** December 1, 2025

## 1. Data Collection & Usage
TabEater is designed with privacy as a core tenet.

- **Local Processing**: Whenever possible, tab analysis (categorization, prioritization) is performed locally on your device using Chrome's built-in Gemini Nano model. No data leaves your machine in this mode.
- **Cloud Fallback**: If local AI is unavailable and you configure a cloud AI provider (Gemini, OpenAI, or Anthropic), tab titles and URLs may be sent to your configured provider's API using your own API key.
- **No Retention**: We do not store your browsing history, tab data, or analysis results on our servers. Data is processed in-memory and immediately discarded after the response is generated.

## 2. Permissions
The extension requires the following permissions to function:
- `tabs`: To read tab titles and URLs for analysis.
- `tabGroups`: To organize tabs into groups.
- `storage`: To save your preferences and cached analysis results locally.
- `sidePanel`: To display the tactical dashboard.
- `scripting`: To extract page content for AI analysis (optional).
- `activeTab`: To access current tab information.
- `system.memory`: To monitor memory usage per tab.
- `host_permissions`: To allow AI to analyze page content (optional feature).

## 3. Third-Party Services
- **Google Cloud Platform**: Hosts the serverless backend for license management.
- **Stripe**: Processes Pro upgrade payments securely (PCI compliant).
- **AI Providers**: Only if you configure them - Gemini, OpenAI, or Anthropic. You provide your own API keys and control all data sent to these services.

## 4. License Management
- **Device ID**: A random, anonymous identifier stored locally to track your installation.
- **License Key**: Generated for usage tracking and Pro feature access.
- **Usage Counts**: Daily AI query counts tracked to enforce free tier limits.
- **Email**: Only collected if you purchase Pro, used solely for sending activation codes.

## 5. Contact
For questions regarding privacy, please open an issue at https://github.com/anonx00/tabeater
