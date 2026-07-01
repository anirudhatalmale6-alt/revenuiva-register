const { withProjectBuildGradle, withAppBuildGradle, withMainApplication } = require('expo/config-plugins');

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

    // Add dexOptions for large dual-SDK builds and enable multidex
    if (!appGradle.includes('javaMaxHeapSize')) {
      appGradle = appGradle.replace(
        /android\s*\{/,
        (match) => `${match}\n    dexOptions {\n        javaMaxHeapSize "4g"\n        preDexLibraries = false\n    }\n    defaultConfig {\n        multiDexEnabled true\n    }`
      );
    }

    config.modResults.contents = appGradle;
    return config;
  });

  // Inject Square SDK initialization into MainApplication.kt
  config = withMainApplication(config, (config) => {
    let mainApp = config.modResults.contents;

    if (!mainApp.includes('MobilePaymentsSdk')) {
      // Add import
      mainApp = mainApp.replace(
        /import android\.app\.Application/,
        `import android.app.Application\nimport com.squareup.sdk.mobilepayments.MobilePaymentsSdk`
      );

      // Add initialization in onCreate
      mainApp = mainApp.replace(
        /super\.onCreate\(\)/,
        `super.onCreate()\n    MobilePaymentsSdk.initialize(getString(R.string.square_application_id), this)`
      );
    }

    config.modResults.contents = mainApp;
    return config;
  });

  return config;
}

module.exports = withSquareMaven;
