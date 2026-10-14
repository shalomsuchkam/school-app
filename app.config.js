// Static config lives in app.json. CI sets BUILD_NUMBER (the workflow run number) so every build
// gets a strictly newer android.versionCode / ios.buildNumber; locally it defaults to 1.
module.exports = ({ config }) => {
  const n = Number.parseInt(process.env.BUILD_NUMBER ?? '', 10);
  const build = Number.isInteger(n) && n > 0 ? n : 1;
  return {
    ...config,
    ios: { ...config.ios, buildNumber: String(build) },
    android: { ...config.android, versionCode: build },
  };
};
