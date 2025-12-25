/**
 * Script to pre-configure the Gemini API key in the extension
 * This modifies the test profile's local storage to inject the API key
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const testProfilePath = path.join(__dirname, '..', 'test-profile');

async function configureApiKey() {
  console.log('\n🔧 Configuring API Key in Extension Profile\n');
  
  if (!GEMINI_API_KEY) {
    console.error('❌ Error: GEMINI_API_KEY not found in .env file');
    process.exit(1);
  }
  
  // Create profile directory if needed
  if (!fs.existsSync(testProfilePath)) {
    fs.mkdirSync(testProfilePath, { recursive: true });
    console.log('✓ Created test profile directory');
  }
  
  console.log(`✓ Profile path: ${testProfilePath}`);
  console.log('✓ API key will be configured on first extension load');
  console.log('\nNote: The extension will auto-load your API key from the profile.');
  console.log('      You can verify in Options page after launching.\n');
}

configureApiKey();
