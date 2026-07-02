const { withProjectBuildGradle, withAppBuildGradle, withMainApplication, withStringsXml } = require('expo/config-plugins');

const SQUARE_APP_ID = process.env.SQUARE_APPLICATION_ID || 'sandbox-sq0idb-Y0gLjxyl21M1KHbqtgxr7w';

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

  config = withAppBuildGradle(config, (config) => {
    let appGradle = config.modResults.contents;

    // Disable minification for Square SDK compatibility
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

    // Add Square SDK as direct app dependency so MainApplication can import it
    if (!appGradle.includes('mobile-payments-sdk')) {
      appGradle = appGradle.replace(
        /dependencies\s*\{/,
        (match) => `${match}\n    implementation "com.squareup.sdk:mobile-payments-sdk:2.5.0"`
      );
    }

    config.modResults.contents = appGradle;
    return config;
  });

  // Add Square application ID as Android string resource
  config = withStringsXml(config, (config) => {
    const strings = config.modResults.resources.string || [];
    if (!strings.find(s => s.$.name === 'square_application_id')) {
      strings.push({
        $: { name: 'square_application_id' },
        _: SQUARE_APP_ID,
      });
      config.modResults.resources.string = strings;
    }
    return config;
  });

  // Inject Square SDK initialization into MainApplication.kt
  config = withMainApplication(config, (config) => {
    let mainApp = config.modResults.contents;

    if (!mainApp.includes('MobilePaymentsSdk')) {
      mainApp = mainApp.replace(
        /import android\.app\.Application/,
        `import android.app.Application\nimport android.util.Log\nimport com.squareup.sdk.mobilepayments.MobilePaymentsSdk`
      );

      mainApp = mainApp.replace(
        /super\.onCreate\(\)/,
        `super.onCreate()\n    try {\n      MobilePaymentsSdk.initialize(getString(R.string.square_application_id), this)\n    } catch (e: Exception) {\n      Log.e("RevenuivaAI", "Square SDK init deferred: " + e.message)\n    }`
      );
    }

    config.modResults.contents = mainApp;
    return config;
  });

  return config;
}

module.exports = withSquareMaven;
