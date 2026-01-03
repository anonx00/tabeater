const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const storeDir = path.join(__dirname, '../store');
if (!fs.existsSync(storeDir)) fs.mkdirSync(storeDir, { recursive: true });

async function createScreenshot1() {
    const svg = `<svg width="1280" height="800" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#0a0a0a"/>
        <rect x="440" y="100" width="400" height="600" rx="12" fill="#111" stroke="#222" stroke-width="1"/>
        <text x="640" y="145" text-anchor="middle" fill="#00ff88" font-family="system-ui" font-size="18" font-weight="600">PHANTOM TABS</text>
        <text x="640" y="170" text-anchor="middle" fill="#666" font-family="system-ui" font-size="12">12 tabs | AI: nano | PRO</text>
        <rect x="460" y="190" width="80" height="32" rx="4" fill="#1a1a1a" stroke="#333"/>
        <text x="500" y="211" text-anchor="middle" fill="#ccc" font-family="system-ui" font-size="11">Organize</text>
        <rect x="550" y="190" width="80" height="32" rx="4" fill="#1a1a1a" stroke="#333"/>
        <text x="590" y="211" text-anchor="middle" fill="#ccc" font-family="system-ui" font-size="11">Duplicates</text>
        <rect x="640" y="190" width="80" height="32" rx="4" fill="#1a1a1a" stroke="#333"/>
        <text x="680" y="211" text-anchor="middle" fill="#ccc" font-family="system-ui" font-size="11">Analyze</text>
        <rect x="730" y="190" width="80" height="32" rx="4" fill="#1a1a1a" stroke="#333"/>
        <text x="770" y="211" text-anchor="middle" fill="#ccc" font-family="system-ui" font-size="11">Config</text>
        <rect x="460" y="240" width="360" height="36" rx="4" fill="#111" stroke="#333"/>
        <text x="480" y="263" fill="#666" font-family="system-ui" font-size="13">Search tabs...</text>
        ${[0,1,2,3,4,5,6].map(i => `
            <rect x="460" y="${295 + i*50}" width="360" height="44" rx="4" fill="#0f0f0f"/>
            <circle cx="480" cy="${317 + i*50}" r="8" fill="#333"/>
            <text x="500" y="${313 + i*50}" fill="#e0e0e0" font-family="system-ui" font-size="13">${['GitHub - Repository', 'Stack Overflow - Question', 'Google Docs - Document', 'YouTube - Video', 'Twitter - Timeline', 'Gmail - Inbox', 'Notion - Workspace'][i]}</text>
            <text x="500" y="${328 + i*50}" fill="#666" font-family="system-ui" font-size="11">${['github.com', 'stackoverflow.com', 'docs.google.com', 'youtube.com', 'twitter.com', 'mail.google.com', 'notion.so'][i]}</text>
        `).join('')}
        <text x="640" y="750" text-anchor="middle" fill="#00ff88" font-family="system-ui" font-size="24" font-weight="600">Smart Tab Management</text>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(storeDir, 'screenshot-1.png'));
}

async function createScreenshot2() {
    const svg = `<svg width="1280" height="800" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#0a0a0a"/>
        <rect x="440" y="100" width="400" height="600" rx="12" fill="#111" stroke="#222" stroke-width="1"/>
        <text x="640" y="145" text-anchor="middle" fill="#00ff88" font-family="system-ui" font-size="18" font-weight="600">PHANTOM TABS</text>
        <text x="640" y="180" text-anchor="middle" fill="#00ff88" font-family="system-ui" font-size="14">AI Analysis</text>
        <rect x="460" y="200" width="360" height="400" rx="8" fill="#0f0f0f"/>
        <text x="480" y="230" fill="#e0e0e0" font-family="system-ui" font-size="13">Tab Analysis Results:</text>
        <text x="480" y="260" fill="#888" font-family="system-ui" font-size="12">• 3 duplicate tabs detected</text>
        <text x="480" y="285" fill="#888" font-family="system-ui" font-size="12">• 5 tabs inactive for 2+ hours</text>
        <text x="480" y="310" fill="#888" font-family="system-ui" font-size="12">• Suggest grouping: 4 GitHub tabs</text>
        <text x="480" y="335" fill="#888" font-family="system-ui" font-size="12">• Suggest grouping: 3 Google tabs</text>
        <text x="480" y="370" fill="#e0e0e0" font-family="system-ui" font-size="13">Recommendations:</text>
        <text x="480" y="400" fill="#00ff88" font-family="system-ui" font-size="12">✓ Close duplicates to save memory</text>
        <text x="480" y="425" fill="#00ff88" font-family="system-ui" font-size="12">✓ Group related tabs for focus</text>
        <text x="480" y="450" fill="#00ff88" font-family="system-ui" font-size="12">✓ Consider bookmarking old tabs</text>
        <rect x="460" y="620" width="360" height="36" rx="4" fill="#222" stroke="#333"/>
        <text x="640" y="643" text-anchor="middle" fill="#ccc" font-family="system-ui" font-size="13">Back to Tabs</text>
        <text x="640" y="750" text-anchor="middle" fill="#00ff88" font-family="system-ui" font-size="24" font-weight="600">AI-Powered Insights</text>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(storeDir, 'screenshot-2.png'));
}

async function createScreenshot3() {
    const svg = `<svg width="1280" height="800" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#0a0a0a"/>
        <rect x="440" y="100" width="400" height="600" rx="12" fill="#111" stroke="#222" stroke-width="1"/>
        <text x="640" y="145" text-anchor="middle" fill="#00ff88" font-family="system-ui" font-size="18" font-weight="600">PHANTOM TABS</text>
        <text x="500" y="180" fill="#00ff88" font-family="system-ui" font-size="14">Duplicates: 3 groups</text>
        <rect x="760" y="162" width="70" height="24" rx="4" fill="#ff4444"/>
        <text x="795" y="179" text-anchor="middle" fill="#fff" font-family="system-ui" font-size="11">Close All</text>
        ${[0,1,2].map(i => `
            <rect x="460" y="${200 + i*80}" width="360" height="65" rx="8" fill="#1a1a1a"/>
            <text x="480" y="${225 + i*80}" fill="#e0e0e0" font-family="system-ui" font-size="13">${['GitHub - Pull Request #142', 'Stack Overflow - React hooks', 'Google Docs - Meeting notes'][i]}</text>
            <text x="480" y="${248 + i*80}" fill="#ff8800" font-family="system-ui" font-size="12">${['3 tabs', '2 tabs', '2 tabs'][i]}</text>
        `).join('')}
        <rect x="460" y="460" width="360" height="100" rx="8" fill="#0f0f0f" stroke="#00ff88" stroke-dasharray="4"/>
        <text x="640" y="500" text-anchor="middle" fill="#666" font-family="system-ui" font-size="14">7 duplicate tabs found</text>
        <text x="640" y="525" text-anchor="middle" fill="#00ff88" font-family="system-ui" font-size="12">Save ~280MB of memory</text>
        <rect x="460" y="580" width="360" height="36" rx="4" fill="#222" stroke="#333"/>
        <text x="640" y="603" text-anchor="middle" fill="#ccc" font-family="system-ui" font-size="13">Back to Tabs</text>
        <text x="640" y="750" text-anchor="middle" fill="#00ff88" font-family="system-ui" font-size="24" font-weight="600">Find &amp; Close Duplicates</text>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(storeDir, 'screenshot-3.png'));
}

async function createSmallPromo() {
    const svg = `<svg width="440" height="280" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#0a0a0a"/>
                <stop offset="100%" style="stop-color:#1a1a2e"/>
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <text x="220" y="80" text-anchor="middle" fill="#00ff88" font-family="system-ui" font-size="32" font-weight="700">PHANTOM</text>
        <text x="220" y="120" text-anchor="middle" fill="#00ff88" font-family="system-ui" font-size="32" font-weight="700">TABS</text>
        <text x="220" y="160" text-anchor="middle" fill="#666" font-family="system-ui" font-size="14">Tactical Tab Intelligence</text>
        <rect x="120" y="190" width="200" height="40" rx="8" fill="#111" stroke="#00ff88"/>
        <text x="220" y="216" text-anchor="middle" fill="#00ff88" font-family="system-ui" font-size="14">AI-Powered</text>
        <text x="220" y="260" text-anchor="middle" fill="#444" font-family="system-ui" font-size="11">Organize • Analyze • Optimize</text>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(storeDir, 'small-promo.png'));
}

async function createMarqueePromo() {
    const svg = `<svg width="1400" height="560" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#0a0a0a"/>
                <stop offset="50%" style="stop-color:#111"/>
                <stop offset="100%" style="stop-color:#1a1a2e"/>
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg2)"/>
        <text x="700" y="180" text-anchor="middle" fill="#00ff88" font-family="system-ui" font-size="72" font-weight="700">PHANTOM TABS</text>
        <text x="700" y="240" text-anchor="middle" fill="#888" font-family="system-ui" font-size="24">Tactical Tab Intelligence System</text>
        <text x="350" y="340" text-anchor="middle" fill="#e0e0e0" font-family="system-ui" font-size="18">Smart Organization</text>
        <text x="350" y="370" text-anchor="middle" fill="#666" font-family="system-ui" font-size="14">Auto-group by domain</text>
        <text x="700" y="340" text-anchor="middle" fill="#e0e0e0" font-family="system-ui" font-size="18">AI Analysis</text>
        <text x="700" y="370" text-anchor="middle" fill="#666" font-family="system-ui" font-size="14">Powered by Gemini Nano</text>
        <text x="1050" y="340" text-anchor="middle" fill="#e0e0e0" font-family="system-ui" font-size="18">Duplicate Detection</text>
        <text x="1050" y="370" text-anchor="middle" fill="#666" font-family="system-ui" font-size="14">One-click cleanup</text>
        <rect x="550" y="420" width="300" height="50" rx="8" fill="#00ff88"/>
        <text x="700" y="453" text-anchor="middle" fill="#0a0a0a" font-family="system-ui" font-size="18" font-weight="600">Add to Chrome - Free</text>
        <text x="700" y="510" text-anchor="middle" fill="#444" font-family="system-ui" font-size="14">Privacy-focused • Works offline • Pro upgrade available</text>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(storeDir, 'marquee-promo.png'));
}

async function main() {
    console.log('Generating store assets...');
    await Promise.all([
        createScreenshot1(),
        createScreenshot2(),
        createScreenshot3(),
        createSmallPromo(),
        createMarqueePromo()
    ]);
    console.log('Done! Assets saved to store/');
    console.log('  - screenshot-1.png (1280x800)');
    console.log('  - screenshot-2.png (1280x800)');
    console.log('  - screenshot-3.png (1280x800)');
    console.log('  - small-promo.png (440x280)');
    console.log('  - marquee-promo.png (1400x560)');
}

main().catch(console.error);
