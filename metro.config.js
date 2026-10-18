const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .wasm to asset extensions for expo-sqlite web support
config.resolver.assetExts.push('wasm');

// expo-sqlite on web uses SharedArrayBuffer, which browsers only allow on a
// cross-origin-isolated page. Without these headers the web preview has no
// database at all. Dev server only; native builds are unaffected.
config.server = config.server || {};
const enhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const base = enhance ? enhance(middleware, server) : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    return base(req, res, next);
  };
};

module.exports = config;
