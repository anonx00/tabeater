# Privacy Policy for PHANTOM TABS

Last Updated: November 2024

## Overview

PHANTOM TABS ("the Extension") is committed to protecting your privacy. This privacy policy explains how the Extension handles your data.

## Data Collection

**PHANTOM TABS does not collect, store, or transmit any personal data to external servers.**

### Local Data Only

All data processed by the Extension remains on your device:

- **Tab Information**: The Extension reads your open tabs (titles, URLs) to provide its features. This information is processed locally and never sent to external servers.

- **Page Content**: When using AI analysis features, the Extension may extract text content from web pages. This content is processed locally using Chrome's built-in AI or sent to your configured cloud AI provider only.

- **Settings**: Your preferences and API configurations are stored locally using Chrome's storage API.

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
| host_permissions | Read page content | Page content for AI |

## Data Storage

- Settings stored locally via `chrome.storage.local`
- No cookies used
- No external databases
- No user accounts or authentication

## Third-Party Services

The Extension does not integrate with third-party analytics, advertising, or tracking services.

If you configure a cloud AI provider, that is your choice and governed by that provider's terms.

## Children's Privacy

The Extension does not knowingly collect information from children under 13.

## Changes to This Policy

We may update this privacy policy. Changes will be reflected in the "Last Updated" date.

## Contact

For privacy concerns, please open an issue on our GitHub repository.

## Your Rights

You can:
- Disable or uninstall the Extension at any time
- Clear local storage via Chrome settings
- Choose not to configure cloud AI services

## Summary

- No data collection
- No tracking
- No external servers (unless you configure cloud AI)
- All processing is local by default
- You control your data
