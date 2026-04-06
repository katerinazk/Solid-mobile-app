const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Επεμβαίνουμε στον τρόπο που το Expo φορτώνει τις βιβλιοθήκες
config.resolver.resolveRequest = (context, moduleName, platform) => {
  
  // Αν η βιβλιοθήκη που πάει να φορτώσει είναι η 'jose'
  if (moduleName.startsWith('jose')) {
    // Την αναγκάζουμε να χρησιμοποιήσει την ελαφριά έκδοση για Browser ('browser')
    // αντί για την έκδοση του Server που ψάχνει το 'crypto'
    return context.resolveRequest({
      ...context,
      unstable_conditionNames: ['browser', 'require', 'default'],
    }, moduleName, platform);
  }
  
  // Για όλες τις άλλες βιβλιοθήκες, δούλεψε κανονικά
  return context.resolveRequest(context, moduleName, platform);
};

// Κρατάμε και αυτά τα "άδεια" αρχεία για παν ενδεχόμενο
config.resolver.extraNodeModules = {
  net: require.resolve('node-libs-react-native/mock/empty'),
  tls: require.resolve('node-libs-react-native/mock/empty'),
};

module.exports = config;