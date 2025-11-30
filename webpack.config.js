const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'production',
    entry: {
        background: './extension/src/background/service-worker.ts',
        popup: './extension/src/popup/index.tsx',
        sidepanel: './extension/src/sidepanel/index.tsx',
        options: './extension/src/options/index.tsx',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
            alias: {
                '@': path.resolve(__dirname, 'extension/src'),
            },
        },
        plugins: [
            new CopyPlugin({
                patterns: [
                    {
                        from: 'extension/manifest.json',
                        to: 'manifest.json'
                    },
                    {
                        from: 'extension/public',
                        to: '.',
                        noErrorOnMissing: true
                    },
                ],
            }),
        ],
        devtool: 'cheap-module-source-map',
    };
