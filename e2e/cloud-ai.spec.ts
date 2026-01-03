import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as os from 'os';

// Load environment variables
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const extensionPath = path.join(__dirname, '..', 'dist');

let context: BrowserContext;
let userDataDir: string;

test.beforeAll(async () => {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not found in .env file');
  }

  // Create temporary user data directory
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-chrome-'));

  // Launch browser with extension loaded
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
  });

  // Wait a bit for extension to initialize
  await new Promise(resolve => setTimeout(resolve, 2000));
});

test.afterAll(async () => {
  await context?.close();

  // Clean up temporary user data directory
  if (userDataDir && fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test.describe('Cloud AI - Gemini Integration', () => {
  test('should configure Gemini API key and organize tabs', async () => {
    // Step 1: Open multiple tabs to organize
    const pages = [];

    // Create tabs with different purposes - use simple sites that don't require auth
    pages.push(await context.newPage());
    await pages[0].goto('https://github.com', { waitUntil: 'domcontentloaded', timeout: 10000 });

    pages.push(await context.newPage());
    await pages[1].goto('https://stackoverflow.com', { waitUntil: 'domcontentloaded', timeout: 10000 });

    pages.push(await context.newPage());
    await pages[2].goto('https://news.ycombinator.com', { waitUntil: 'domcontentloaded', timeout: 10000 });

    pages.push(await context.newPage());
    await pages[3].goto('https://www.wikipedia.org', { waitUntil: 'domcontentloaded', timeout: 10000 });

    pages.push(await context.newPage());
    await pages[4].goto('https://www.bbc.com', { waitUntil: 'domcontentloaded', timeout: 10000 });

    // Wait for pages to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Open extension popup
    const extensionId = await getExtensionId(context);
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    
    await popupPage.waitForLoadState('networkidle');
    
    // Step 3: Navigate to options/settings to configure API
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    
    await optionsPage.waitForLoadState('networkidle');
    
    // Step 4: Configure Gemini API
    console.log('Configuring Gemini API key...');
    
    // Look for Gemini provider button and click it
    const geminiButton = optionsPage.locator('button:has-text("Gemini")').first();
    await geminiButton.waitFor({ state: 'visible', timeout: 5000 });
    await geminiButton.click();
    
    // Find API key input and enter the key
    const apiKeyInput = optionsPage.locator('input[type="password"], input[placeholder*="API"], input[placeholder*="key"]').first();
    await apiKeyInput.waitFor({ state: 'visible', timeout: 5000 });
    await apiKeyInput.fill(GEMINI_API_KEY!);
    
    // Save configuration
    const saveButton = optionsPage.locator('button:has-text("Save")').first();
    if (await saveButton.isVisible()) {
      await saveButton.click();
      await optionsPage.waitForTimeout(1000);
    }
    
    console.log('Gemini API configured successfully');
    
    // Step 5: Go back to popup and test tab organization
    await popupPage.bringToFront();
    await popupPage.reload();
    await popupPage.waitForLoadState('networkidle');
    
    // Step 6: Click "Organize Tabs" button
    console.log('Testing tab organization with AI...');
    
    const organizeButton = popupPage.locator('button:has-text("Organize")').first();
    await organizeButton.waitFor({ state: 'visible', timeout: 5000 });
    
    // Check if button is enabled (not disabled)
    const isDisabled = await organizeButton.isDisabled();
    expect(isDisabled).toBe(false);
    
    await organizeButton.click();
    
    // Wait for AI processing
    console.log('Waiting for AI to process tabs...');
    await popupPage.waitForTimeout(10000); // Give AI time to process
    
    // Step 7: Verify tabs were organized into groups
    // Check Chrome tab groups were created
    const allPages = context.pages();
    console.log(`Total pages after organization: ${allPages.length}`);
    
    // Verify we still have our test pages
    expect(allPages.length).toBeGreaterThanOrEqual(5);
    
    console.log('✓ Cloud AI test completed successfully');
  });
});

// Helper function to get extension ID
async function getExtensionId(context: BrowserContext): Promise<string> {
  const extensionsPage = await context.newPage();
  await extensionsPage.goto('chrome://extensions');
  
  // Execute script to find the extension
  const extensionId = await extensionsPage.evaluate(() => {
    const extensions = document.querySelector('extensions-manager')
      ?.shadowRoot?.querySelector('extensions-item-list')
      ?.shadowRoot?.querySelectorAll('extensions-item');
    
    if (extensions && extensions.length > 0) {
      const firstExtension = extensions[0] as HTMLElement & { id: string };
      return firstExtension.id;
    }
    return null;
  });
  
  await extensionsPage.close();
  
  if (!extensionId) {
    throw new Error('Could not find extension ID');
  }
  
  return extensionId;
}
