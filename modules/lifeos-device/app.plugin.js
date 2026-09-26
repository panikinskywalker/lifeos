/**
 * LifeOS device config plugin: Health Connect needs the app to show why it
 * reads health data. Android 13 and below open an activity with
 * ACTION_SHOW_PERMISSIONS_RATIONALE; Android 14+ an alias with
 * VIEW_PERMISSION_USAGE + HEALTH_PERMISSIONS. Both land on the main activity.
 * (Permissions, the SMS receiver and the notification listener come from the
 * module's own AndroidManifest.)
 */
const { withAndroidManifest, withAppBuildGradle, AndroidConfig } = require('@expo/config-plugins');

/** JavaMail's two jars (Gmail over IMAP) both carry the same licence files; keep one. */
function withMailPackaging(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('lifeos-mail-packaging')) {
      cfg.modResults.contents += `
// lifeos-mail-packaging
android {
    packagingOptions {
        resources {
            pickFirsts += ['META-INF/LICENSE.md', 'META-INF/NOTICE.md', 'META-INF/LICENSE.txt', 'META-INF/NOTICE.txt', 'META-INF/mimetypes.default', 'META-INF/mailcap.default', 'META-INF/javamail.providers', 'META-INF/javamail.default.providers', 'META-INF/javamail.default.address.map', 'META-INF/javamail.charset.map']
        }
    }
}
`;
    }
    return cfg;
  });
}

module.exports = function withLifeosDevice(config) {
  config = withMailPackaging(config);
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    main['intent-filter'] = main['intent-filter'] ?? [];
    const has = (action) => main['intent-filter'].some((f) => (f.action ?? []).some((a) => a.$['android:name'] === action));
    if (!has('androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE')) {
      main['intent-filter'].push({ action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }] });
    }
    app['activity-alias'] = app['activity-alias'] ?? [];
    if (!app['activity-alias'].some((a) => a.$['android:name'] === 'ViewPermissionUsageActivity')) {
      app['activity-alias'].push({
        $: {
          'android:name': 'ViewPermissionUsageActivity',
          'android:exported': 'true',
          'android:targetActivity': '.MainActivity',
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
            category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
          },
        ],
      });
    }
    return cfg;
  });
};
