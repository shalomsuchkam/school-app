/// <reference types="node" />
import type { ConfigContext, ExpoConfig } from 'expo/config';
import fs from 'node:fs';

// Static config lives in app.json; this file only adds what depends on the environment.
// - BUILD_NUMBER (CI sets the workflow run number) gives every build a strictly newer android.versionCode /
//   ios.buildNumber; locally it defaults to 1.
// - Push turns on when CI provides EAS_PROJECT_ID (Expo push service) and, for Android, google-services.json
//   (Firebase Cloud Messaging) written from a repository secret.
// - APPLE_TEAM_ID (CI secret for the signed TestFlight build) sets ios.appleTeamId, i.e. DEVELOPMENT_TEAM of the app
//   and of the screen-time extensions.
// - iOS screen time (docs/SCREEN_TIME.md, "iOS"): `expo.extra.iosScreenTime` in app.json or EXPO_PUBLIC_IOS_SCREEN_TIME=1
//   adds the react-native-device-activity config plugin (Family Controls entitlement, App Group, three app
//   extensions from ./targets). Off by default: Apple must first approve the Family Controls (Distribution)
//   entitlement for the app and every extension, otherwise a signed build cannot be exported. With the flag off the
//   config is exactly what app.json says.

export const IOS_APP_GROUP = 'group.kz.uroki.app';

export default ({ config }: ConfigContext): ExpoConfig => {
  const n = Number.parseInt(process.env.BUILD_NUMBER ?? '', 10);
  const build = Number.isInteger(n) && n > 0 ? n : 1;
  const projectId = process.env.EAS_PROJECT_ID || undefined;
  const teamId = process.env.APPLE_TEAM_ID || undefined;
  const fcm = './google-services.json';
  const iosScreenTime = config.extra?.iosScreenTime === true || process.env.EXPO_PUBLIC_IOS_SCREEN_TIME === '1';
  return {
    ...config,
    ios: { ...config.ios, buildNumber: String(build), ...(teamId ? { appleTeamId: teamId } : {}) },
    android: { ...config.android, versionCode: build, ...(fs.existsSync(fcm) ? { googleServicesFile: fcm } : {}) },
    extra: { ...config.extra, ...(iosScreenTime ? { iosScreenTime: true } : {}), ...(projectId ? { eas: { projectId } } : {}) },
    ...(iosScreenTime
      ? {
          plugins: [
            ...(config.plugins ?? []),
            // The plugin finds its own entry by this exact name. copyToTargetFolder:false: the extensions' sources
            // are committed in ./targets (copied from the package, with the iOS deployment target set to the app's).
            ['react-native-device-activity', { appGroup: IOS_APP_GROUP, copyToTargetFolder: false }],
          ],
        }
      : {}),
  } as ExpoConfig;
};
