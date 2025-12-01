# Gemini Nano Troubleshooting Guide

## Current Status: Flags Enabled But Not Working

If you have both Chrome flags enabled but Gemini Nano still isn't working, follow these steps:

### 1. Verify Chrome Version & Channel

**Minimum Requirements:**
- Chrome 128+ (Dev/Canary channel) on most systems
- Chrome 131+ (Stable channel) - only on select hardware with sufficient RAM

**Check your version:**
1. Go to `chrome://version`
2. Look for version number and channel (e.g., "131.0.6778.86 (Official Build) canary")

**If you're on Stable < 131:** Switch to Chrome Dev or Canary

### 2. Verify Flags Are Correctly Set

Go to `chrome://flags` and confirm:

**Flag 1: `#optimization-guide-on-device-model`**
- Status: `Enabled BypassPerfRequirement`
- ✅ This bypasses hardware performance checks

**Flag 2: `#prompt-api-for-gemini-nano`**
- Status: `Enabled`
- ✅ This enables the Prompt API

**CRITICAL:** After enabling flags, you MUST:
1. Click "Relaunch" button (not just close and reopen)
2. Wait for Chrome to fully restart

### 3. Check Model Download Status

Even with flags enabled, the ~1.7GB Gemini Nano model must download first.

**Check download status:**
1. Open `chrome://components`
2. Find "Optimization Guide On Device Model"
3. Check the status and version

**Possible statuses:**
- ✅ **Has version number** (e.g., "2024.11.28.1953") = Downloaded
- ⏳ **"0.0.0.0"** or **blank** = Not downloaded yet
- 🔴 **Not in list** = Flags not enabled properly

**If status shows "0.0.0.0":**
1. Click "Check for update" button
2. Wait 5-10 minutes (download is 1.7GB)
3. Refresh the page to see progress
4. Relaunch Chrome after download completes

### 4. Test in TabEater Options

After model downloads:
1. Open TabEater extension
2. Go to Options (gear icon)
3. Find "Local AI" section
4. Click "Check" button

**Expected status messages:**

| Status | Meaning | Action |
|--------|---------|--------|
| **Ready** / **Active** (green) | ✅ Working! | You're good to go |
| **Downloading...** (yellow) | ⏳ Model downloading | Wait and check `chrome://components` |
| **Not Available** (red) | ❌ Not detected | Check steps 1-3 above |
| **Error** (red) | ❌ API call failed | See error message for details |

### 5. Common Issues & Fixes

**Issue: "Not Available" after enabling flags**
- **Fix:** Relaunch Chrome (not just restart)
- **Fix:** Wait 2-3 minutes after relaunch for API initialization

**Issue: Model stays at "0.0.0.0" in chrome://components**
- **Fix:** Manually click "Check for update"
- **Fix:** Ensure stable internet connection
- **Fix:** Free up disk space (need 2GB+ free)

**Issue: "Ready" in options but AI calls fail**
- **Fix:** Try opening `chrome://flags` and relaunching again
- **Fix:** Check if extension has required permissions

**Issue: Works in DevTools console but not in extension**
- **Fix:** Extension context may be different - check if running in service worker context

### 6. Verify API Access in DevTools

Test if Nano is accessible at all:

1. Open any webpage
2. Press F12 to open DevTools
3. Go to Console tab
4. Run this command:

```javascript
const ai = self.ai || globalThis.ai || chrome?.ai;
if (!ai?.languageModel) {
  console.log('❌ AI API not found');
} else {
  ai.languageModel.capabilities().then(cap =>
    console.log('Capabilities:', cap)
  );
}
```

**Expected output if working:**
```
Capabilities: {available: 'readily', defaultTemperature: 0.8, ...}
```

**If you see:** `available: 'after-download'` - Model is downloading
**If you see:** `available: 'no'` - Not available on this system

### 7. Hardware Requirements

Gemini Nano requires:
- **RAM:** 8GB+ (22GB+ recommended for consistent performance)
- **Disk:** 2GB+ free space for model
- **CPU:** Modern processor with AVX2 support

If you don't meet requirements, the API will return `available: 'no'` even with flags enabled.

### 8. Alternative: Use Cloud AI

If Nano doesn't work on your system:
1. Open TabEater Options
2. Go to "Cloud AI" section
3. Configure Gemini, OpenAI, or Anthropic
4. Add your API key
5. Cloud AI works on any system

**Free options:**
- Google Gemini 2.0 Flash (free tier available)
- Get key at: https://aistudio.google.com/app/apikey

---

## Quick Diagnostic

Run through this checklist:

- [ ] Chrome 128+ Dev/Canary (or 131+ Stable)
- [ ] Both flags enabled with correct settings
- [ ] Chrome relaunched (not just closed)
- [ ] Waited 2-3 minutes after relaunch
- [ ] `chrome://components` shows model with version number
- [ ] TabEater options shows "Ready" or "Active"

If all checked and still not working, your hardware may not support Nano. Use cloud AI instead.
