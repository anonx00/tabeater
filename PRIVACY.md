# Privacy Policy for PHANTOM TABS

**Last Updated:** November 30, 2025

## 1. Data Collection & Usage
PHANTOM TABS is designed with privacy as a core tenet.

- **Local Processing**: Whenever possible, tab analysis (categorization, prioritization) is performed locally on your device using Chrome's built-in Gemini Nano model. No data leaves your machine in this mode.
- **Cloud Fallback**: If local AI is unavailable, tab titles and URLs may be sent to our secure cloud proxy (hosted on Google Cloud Platform) to be processed by Groq's LLM API.
- **No Retention**: We do not store your browsing history, tab data, or analysis results on our servers. Data is processed in-memory and immediately discarded after the response is generated.

## 2. Permissions
The extension requires the following permissions to function:
- `tabs`: To read tab titles and URLs for analysis.
- `storage`: To save your preferences and cached analysis results locally.
- `sidePanel`: To display the tactical dashboard.

## 3. Third-Party Services
- **Google Cloud Platform**: Hosts the serverless backend.
- **Groq**: Provides the fallback LLM inference.

## 4. Contact
For questions regarding privacy, please open an issue in the GitHub repository.
