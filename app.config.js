// Dynamic config for build variants.
// Reads the static app.json (passed in as `config`) and, when APP_VARIANT=beta,
// switches to the beta bundle identifier + name so it becomes a separate app for
// TestFlight testing (e.g. validating Tap to Pay before shipping to live practices).
module.exports = ({ config }) => {
  const isBeta = process.env.APP_VARIANT === 'beta';

  if (!isBeta) {
    return config;
  }

  return {
    ...config,
    name: 'RevenuivaAI Beta',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.revenuivaai.register.beta',
    },
    android: {
      ...config.android,
      package: 'com.revenuivaai.register.beta',
    },
  };
};
