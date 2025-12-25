/**
 * Manual Testing Script for TabEater Extension
 * 
 * This script launches Chrome with the extension loaded and a test profile
 * that persists your Gemini API key configuration.
 * 
 * Usage: node scripts/manual-test.js
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const extensionPath = path.join(__dirname, '..', 'dist');
const testProfilePath = path.join(__dirname, '..', 'test-profile');

async function main() {
  console.log('\n🚀 TabEater Manual Testing Tool\n');
  console.log('━'.repeat(50));
  
  if (!GEMINI_API_KEY) {
    console.error('❌ Error: GEMINI_API_KEY not found in .env file');
    process.exit(1);
  }
  
  console.log('✓ Gemini API Key loaded');
  console.log(`✓ Extension path: ${extensionPath}`);
  console.log(`✓ Test profile: ${testProfilePath}`);
  
  // Create test profile directory if it doesn't exist
  if (!fs.existsSync(testProfilePath)) {
    fs.mkdirSync(testProfilePath, { recursive: true });
    console.log('✓ Created test profile directory');
  }
  
  console.log('\n📝 Instructions:');
  console.log('━'.repeat(50));
  console.log('1. Chrome will open with the extension installed');
  console.log('2. Click the extension icon (puzzle piece) in toolbar');
  console.log('3. If not configured, go to Options and set Gemini API key:');
  console.log(`   ${GEMINI_API_KEY}`);
  console.log('4. Open 5-10 tabs with different content:');
  console.log('   - News sites (BBC, CNN, etc.)');
  console.log('   - Dev sites (GitHub, Stack Overflow)');
  console.log('   - Social media (Reddit, Twitter)');
  console.log('   - Shopping (Amazon, eBay)');
  console.log('   - Videos (YouTube, Vimeo)');
  console.log('5. Click "Organize Tabs" in the extension popup');
  console.log('6. Watch as AI groups your tabs by category');
  console.log('7. Press Ctrl+C in this terminal when done');
  console.log('\n⚠️  API Usage: Each "Organize" click = 1 API call to Gemini');
  console.log('━'.repeat(50));
  console.log('\nLaunching Chrome in 3 seconds...\n');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Launch browser
  const context = await chromium.launchPersistentContext(testProfilePath, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--start-maximized',
    ],
  });
  
  console.log('✓ Chrome launched with extension');
  console.log('✓ Extension loaded and ready');
  console.log('\n📊 Monitoring session...');
  console.log('   Press Ctrl+C to close Chrome and end session\n');
  
  // Keep the browser open until user closes it
  await new Promise(() => {});
}

main().catch(console.error);
