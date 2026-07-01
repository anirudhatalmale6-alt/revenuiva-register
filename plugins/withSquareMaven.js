const { withProjectBuildGradle, withAppBuildGradle } = require('expo/config-plugins');

function withSquareMaven(config) {
  config = withProjectBuildGradle(config, (config) => {
    let buildGradle = config.modResults.contents;

    if (!buildGradle.includes('squareup.com')) {
      const squareRepo = `        maven { url "https://sdk.squareup.com/public/android/" }`;
      buildGradle = buildGradle.replace(
        /allprojects\s*\{[\s\S]*?repositories\s*\{/,
        (match) => `${match}\n${squareRepo}`
      );
    }

    // Force kotlin-stdlib to match the Kotlin compiler version
    if (!buildGradle.includes('kotlin-stdlib')) {
      const forceKotlinStdlib = `
    subprojects {
        configurations.all {
            resolutionStrategy {
                force "org.jetbrains.kotlin:kotlin-stdlib:\${rootProject.ext.has('kotlinVersion') ? rootProject.ext.get('kotlinVersion') : '2.2.21'}"
                force "org.jetbrains.kotlin:kotlin-stdlib-jdk7:\${rootProject.ext.has('kotlinVersion') ? rootProject.ext.get('kotlinVersion') : '2.2.21'}"
                force "org.jetbrains.kotlin:kotlin-stdlib-jdk8:\${rootProject.ext.has('kotlinVersion') ? rootProject.ext.get('kotlinVersion') : '2.2.21'}"
            }
        }
    }`;
      buildGradle = buildGradle + '\n' + forceKotlinStdlib + '\n';
    }

    config.modResults.contents = buildGradle;
    return config;
  });

  // Disable minification for Square SDK compatibility
  config = withAppBuildGradle(config, (config) => {
    let appGradle = config.modResults.contents;

    if (!appGradle.includes('// Square SDK: disable minification')) {
      appGradle = appGradle.replace(
        /buildTypes\s*\{[\s\S]*?release\s*\{/,
        (match) => `${match}\n            // Square SDK: disable minification\n            minifyEnabled false\n            shrinkResources false`
      );
    }

    config.modResults.contents = appGradle;
    return config;
  });

  return config;
}

module.exports = withSquareMaven;
