/**
 * The build's fingerprint (its runtime version) leaves out app.json's version,
 * so a new LifeOS version that changes no native code reaches the installed
 * app as an update instead of needing a new APK.
 * @type {import('expo/fingerprint').Config}
 */
module.exports = { sourceSkips: ['ExpoConfigVersions'] };
