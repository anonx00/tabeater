const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const publicDir = path.join(__dirname, '../extension/public');

async function generateIcons() {
    for (const size of sizes) {
        const svgPath = path.join(publicDir, `icon${size}.svg`);
        const pngPath = path.join(publicDir, `icon${size}.png`);

        if (fs.existsSync(svgPath)) {
            const svgBuffer = fs.readFileSync(svgPath);
            await sharp(svgBuffer)
                .resize(size, size)
                .png()
                .toFile(pngPath);
            console.log(`Generated ${pngPath}`);
        }
    }
}

generateIcons().catch(console.error);
