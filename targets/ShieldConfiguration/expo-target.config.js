// iOS screen-time extension "ShieldConfiguration" (react-native-device-activity 0.6.1). Used only when the iosScreenTime flag adds
// the library's config plugin (app.config.ts). The Swift files here are copies from the package (targets/ and
// ios/Shared.swift); refresh them when the package is updated. Deployment target = the app's (Expo default 16.4)
// instead of the library default 18.0, so schedules and shields also work on iOS 16-17.
const { createConfig } = require('react-native-device-activity/config-plugin/createExpoTargetConfig');

const base = createConfig('shield-configuration');

module.exports = (config) => ({ ...base(config), deploymentTarget: '16.4' });
