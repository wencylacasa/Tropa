const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withForegroundService(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const app = androidManifest.manifest.application[0];

    // Check if the service already exists
    const serviceExists = app.service?.some(
      (s) => s.$['android:name'] === 'expo.modules.mymodule.TropaForegroundService'
    );

    if (!serviceExists) {
      if (!app.service) {
        app.service = [];
      }
      app.service.push({
        $: {
          'android:name': 'expo.modules.mymodule.TropaForegroundService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'microphone'
        }
      });
    }

    return config;
  });
};
