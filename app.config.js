const fs = require('fs');

// Static config lives in app.json. CI sets BUILD_NUMBER (the workflow run number) so every build
// gets a strictly newer android.versionCode / ios.buildNumber; locally it defaults to 1.
// Push notifications switch on when CI provides EAS_PROJECT_ID (Expo push service) and, for Android,
// google-services.json (Firebase Cloud Messaging) written from a repository secret.
module.exports = ({ config }) => {
  const n = Number.parseInt(process.env.BUILD_NUMBER ?? '', 10);
  const build = Number.isInteger(n) && n > 0 ? n : 1;
  const projectId = process.env.EAS_PROJECT_ID || undefined;
  const fcm = './google-services.json';
  return {
    ...config,
    ios: { ...config.ios, buildNumber: String(build) },
    android: { ...config.android, versionCode: build, ...(fs.existsSync(fcm) ? { googleServicesFile: fcm } : {}) },
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
  };
};
