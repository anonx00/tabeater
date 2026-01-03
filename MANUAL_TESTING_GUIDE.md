# TabEater Manual Testing Guide

## Real-World Testing with Gemini API

This guide will help you test the tab grouping functionality with actual tabs while being mindful of API usage.

### Setup (Already Done ✓)

- ✅ Gemini API key configured in `.env`
- ✅ Extension built and ready
- ✅ Test profile created

### API Usage Tracking

**Important:** Each time you click "Organize Tabs", it makes **1 API call** to Gemini.

Gemini Free Tier Limits:
- **15 requests per minute (RPM)**
- **1 million tokens per day**
- **1,500 requests per day (RPD)**

For this test session, we recommend:
- **Maximum 5-10 organize clicks** to stay well within limits
- **Wait 5-10 seconds between tests** to avoid rate limiting

### Testing Steps

#### 1. Configure Extension (First Time Only)

When Chrome opens:
1. Click the extension icon (puzzle piece in toolbar)
2. Click "Options" or settings gear icon
3. Select "Gemini" as your AI provider
4. Enter API key: `YOUR_GEMINI_API_KEY` (get one from https://aistudio.google.com/apikey)
5. Click "Save"

#### 2. Open Real-World Tabs

Open 5-10 tabs with diverse content:

**News & Media:**
- https://www.bbc.com
- https://www.cnn.com
- https://news.ycombinator.com

**Development:**
- https://github.com
- https://stackoverflow.com
- https://www.npmjs.com

**Social Media:**
- https://www.reddit.com
- https://twitter.com

**Shopping:**
- https://www.amazon.com
- https://www.ebay.com

**Videos:**
- https://www.youtube.com
- https://vimeo.com

**Reference:**
- https://www.wikipedia.org
- https://developer.mozilla.org

#### 3. Test Tab Grouping

1. Click the extension icon in toolbar
2. You should see all your open tabs listed
3. Click **"Organize Tabs"** button
4. Watch as AI analyzes and groups your tabs
5. Tabs should be grouped by category (News, Dev, Social, Shopping, etc.)

#### 4. Verify Results

Check that:
- ✅ Tabs are grouped logically by content type
- ✅ Group names make sense (e.g., "Development", "News", "Shopping")
- ✅ No tabs are lost or closed unexpectedly
- ✅ Groups have appropriate colors

#### 5. Test Edge Cases (Optional)

If you want to test more scenarios (1 API call each):

**Test A: Many tabs of same type**
- Open 8 GitHub repositories
- Click "Organize"
- Should create 1 group called "Development" or "Code"

**Test B: Mixed content**
- Open 3 news sites + 3 dev sites + 3 shopping sites
- Click "Organize"
- Should create 3 separate groups

**Test C: Duplicate tabs**
- Open same URL in 3 different tabs
- Click "Find Duplicates" (different feature, no API call)
- Should identify and offer to close duplicates

### What to Look For

#### Success Indicators:
✅ Groups created within 5-10 seconds
✅ Logical categorization (News together, Dev together, etc.)
✅ Appropriate group names
✅ No errors in console (F12 → Console tab)

#### Issues to Report:
❌ Tabs grouped incorrectly
❌ Groups named poorly
❌ Timeout or error messages
❌ Excessive API calls (check console for multiple requests)
❌ Extension crashes or freezes

### Monitoring API Usage

To check how many API calls you've made:

1. Open Chrome DevTools (F12)
2. Go to "Network" tab
3. Filter by "generativelanguage.googleapis.com"
4. Each request = 1 API call
5. Check response for any errors (rate limiting shows as 429)

### After Testing

When done testing:
1. Press **Ctrl+C** in the terminal to close Chrome
2. Review your findings
3. API key remains configured for future tests

### Expected Results

For a typical test with 9 tabs (3 news, 3 dev, 3 shopping):
- **API Calls:** 1
- **Time:** 5-10 seconds
- **Groups Created:** 3 groups
- **Accuracy:** 90%+ correct categorization

### Cost Estimation

Gemini API Pricing (Free tier - $0):
- First 1,500 requests/day: FREE
- After that: $0.00015 per 1K tokens

For this test session (5-10 organizes):
- **Cost:** $0.00 (within free tier)
- **Tokens Used:** ~5,000-10,000 tokens
- **Time Saved:** Hours of manual tab organization!

---

## Troubleshooting

**Extension doesn't load:**
- Check that `dist/` folder exists and has files
- Rebuild: `npm run build`

**"API key invalid" error:**
- Verify your API key is correctly entered in Options
- Check if key has Gemini API enabled in Google Cloud Console

**Rate limiting (429 error):**
- Wait 60 seconds before next test
- You're within 15 RPM limit if spacing tests by 5+ seconds

**Groups not created:**
- Check browser console (F12) for errors
- Verify tabs have actual content (not blank pages)
- Try with simpler URLs first (news sites work best)

---

Happy Testing! 🎉
