const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Η "Μαύρη Λίστα": Όλα τα βαριά εργαλεία του Node.js που κρασάρουν το κινητό
const serverModules = [
  'async_hooks', 'undici', 'stream/web', 'crypto', 'net', 'tls', 'fs', 'dgram',
  'http', 'https', 'http2', 'zlib', 'os', 'path', 'child_process', 'worker_threads',
  'cluster', 'dns', 'perf_hooks', 'readline', 'repl', 'tty', 'vm', 'v8', 'module'
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 1. Λύση για τα κλειδιά της jose (της λέμε ότι είμαστε σε Browser)
  if (moduleName.startsWith('jose')) {
    return context.resolveRequest({
      ...context,
      unstable_conditionNames: ['browser', 'require', 'default'],
    }, moduleName, platform);
  }

  // 2. Η Απόλυτη Ασπίδα: Αν η βιβλιοθήκη είναι στη μαύρη λίστα, την κάνουμε MOCK αμέσως!
  if (serverModules.includes(moduleName) || moduleName.startsWith('node:')) {
    return context.resolveRequest(context, 'node-libs-react-native/mock/empty', platform);
  }

  // 3. Για όλα τα υπόλοιπα, προχωράμε κανονικά
  return context.resolveRequest(context, moduleName, platform);
};

// Φορτώνουμε τα βασικά, ασφαλή polyfills για όσα χρειαζόμαστε
config.resolver.extraNodeModules = require('node-libs-react-native');

module.exports = config;