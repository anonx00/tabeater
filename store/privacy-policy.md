# Privacy Policy for TabEater

Last Updated: December 1, 2025

## Overview

TabEater ("the Extension") is committed to protecting your privacy. This privacy policy explains how the Extension handles your data.

## Data Collection

### Local Data

Most data processed by the Extension remains on your device:

- **Tab Information**: The Extension reads your open tabs (titles, URLs) to provide its features. This information is processed locally.

- **Page Content**: When using AI analysis features, the Extension may extract text content from web pages. This content is processed locally using Chrome's built-in AI or sent to your configured cloud AI provider.

- **Settings**: Your preferences and API configurations are stored locally using Chrome's storage API.

### License System

To manage free trials and Pro upgrades:

- **Device ID**: A random identifier is generated and stored locally to identify your installation
- **License Key**: A unique key is generated for usage tracking
- **Usage Counts**: Daily AI query counts are tracked to enforce free tier limits

This data is stored securely in Google Cloud Firestore and is not linked to any personal information unless you make a purchase.

### Purchase Data

If you choose to upgrade to Pro:

- **Email Address**: Collected at checkout to send your activation code
- **Payment Information**: Processed entirely by Stripe - we never see or store your card details

## AI Processing

### Local AI (Gemini Nano)

When using Chrome's built-in Gemini Nano AI:
- All processing happens on your device
- No data is sent to external servers
- Your browsing data remains completely private

### Cloud AI (Optional)

If you configure a cloud AI provider:
- Tab titles and page summaries may be sent to your configured API endpoint
- You provide and control the API endpoint and credentials
- We do not operate or have access to these external services
- Review your chosen provider's privacy policy

## Permissions Explained

| Permission | Purpose | Data Access |
|------------|---------|-------------|
| tabs | List and manage tabs | Tab titles, URLs |
| tabGroups | Group tabs | Tab group data |
| storage | Save settings | Local preferences |
| sidePanel | Show side panel | None |
| scripting | Extract page content | Page text (local only) |
| activeTab | Access current tab | Current tab info |
| system.memory | Monitor memory usage | Tab memory usage |
| host_permissions | Read page content | Page content for AI analysis (optional) |

## Third-Party Services

### Payment Processing (Stripe)

Payments are processed by Stripe. When you purchase:
- You are redirected to Stripe's secure checkout page
- Stripe handles all payment data according to PCI compliance standards
- We only receive confirmation of successful payment
- Review [Stripe's Privacy Policy](https://stripe.com/privacy)

### Cloud Infrastructure (Google Cloud)

Backend services run on Google Cloud Platform:
- Data is stored in Firestore (US region)
- Review [Google Cloud Privacy](https://cloud.google.com/privacy)

## Data Storage

- Settings stored locally via `chrome.storage.local`
- License data stored in Google Cloud Firestore
- No cookies used by the Extension
- Payment data handled exclusively by Stripe

## Data Retention

- Local data: Until you uninstall or clear extension data
- License records: Retained to validate your purchase
- Email addresses: Retained only for purchase records

## Children's Privacy

The Extension does not knowingly collect information from children under 13.

## Changes to This Policy

We may update this privacy policy. Changes will be reflected in the "Last Updated" date.

## Contact

For privacy concerns, please open an issue on our GitHub repository at https://github.com/anonx00/tabeater

## Your Rights

You can:
- Disable or uninstall the Extension at any time
- Clear local storage via Chrome settings
- Request deletion of your license data by contacting us
- Choose not to configure cloud AI services

## Summary

- Minimal data collection
- No tracking or analytics
- Payments handled securely by Stripe
- Local AI processing by default
- You control your data
- No browsing history retention
- No data sold to third parties
