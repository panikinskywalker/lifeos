/**
 * LifeOS device config plugin: Health Connect needs the app to show why it
 * reads health data. Android 13 and below open an activity with
 * ACTION_SHOW_PERMISSIONS_RATIONALE; Android 14+ an alias with
 * VIEW_PERMISSION_USAGE + HEALTH_PERMISSIONS. Both land on the main activity.
 * (Permissions, the SMS receiver and the notification listener come from the
 * module's own AndroidManifest.)
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

module.exports = function withLifeosDevice(config) {
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
