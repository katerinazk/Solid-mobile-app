const { getDefaultConfig } = require('expo/metro-config');
const nodeLibs = require('node-libs-react-native');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 1. Διορθώνουμε τη jose
  if (moduleName.startsWith('jose')) {
    return context.resolveRequest({
      ...context,
      unstable_conditionNames: ['browser', 'require', 'default'],
    }, moduleName, platform);
  }

  // 2. Μπλοκάρουμε ΜΟΝΟ τους 3 ταραχοποιούς που κρασάρουν το σύστημα
  if (['stream/web', 'undici', 'async_hooks'].includes(moduleName)) {
    return context.resolveRequest(context, 'node-libs-react-native/mock/empty', platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

// 3. Δίνουμε ΤΑ ΠΡΑΓΜΑΤΙΚΑ polyfills (αντίγραφα) της node-libs-react-native
config.resolver.extraNodeModules = {
  ...nodeLibs,
  net: require.resolve('node-libs-react-native/mock/empty'),
  tls: require.resolve('node-libs-react-native/mock/empty'),
  fs: require.resolve('node-libs-react-native/mock/empty'),
  dgram: require.resolve('node-libs-react-native/mock/empty'),
};

module.exports = config;