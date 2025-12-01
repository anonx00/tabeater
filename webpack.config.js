const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
require('dotenv').config();

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
        filename: '[name].js',
        clean: true,
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        alias: {
            '@': path.resolve(__dirname, 'extension/src'),
        },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
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
        new webpack.DefinePlugin({
            'process.env.DEV_MODE': JSON.stringify(process.env.DEV_MODE === 'true'),
            'process.env.API_BASE': JSON.stringify(process.env.API_BASE || 'https://api-5dab6ha67q-uc.a.run.app'),
        }),
    ],
    devtool: 'cheap-module-source-map',
};
