const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .wasm to asset extensions for expo-sqlite web support
config.resolver.assetExts.push('wasm');

module.exports = config;