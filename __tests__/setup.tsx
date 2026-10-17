// Native-backed libraries replaced with their official jest mocks; the window size comes from helpers.applyEnv.
// gesture-handler's own jest setup (the Sheet's drag-to-dismiss uses GestureDetector inside its Modal)
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('react-native-reanimated/mock');
  // reduced motion: entering/layout animations are skipped, as on a device with "Remove animations"
  return { ...mock, useReducedMotion: () => true };
});
jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => jest.requireActual('./helpers').currentWindow(),
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
// expo-audio's native module: a silent player / recorder with the hook shapes the app uses.
jest.mock('expo-audio', () => {
  const player = { play: jest.fn(), pause: jest.fn(), replace: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), remove: jest.fn() };
  const recorder = { record: jest.fn(), stop: jest.fn(() => Promise.resolve()), prepareToRecordAsync: jest.fn(() => Promise.resolve()), getStatus: () => ({ isRecording: false, durationMillis: 0 }), uri: null };
  return {
    RecordingPresets: { HIGH_QUALITY: { extension: '.m4a', sampleRate: 44100, numberOfChannels: 2, bitRate: 128000 } },
    useAudioPlayer: () => player,
    useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0, isLoaded: false, didJustFinish: false }),
    useAudioRecorder: () => recorder,
    useAudioRecorderState: () => ({ canRecord: true, isRecording: false, durationMillis: 0, mediaServicesDidReset: false, url: null }),
    requestRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, canAskAgain: true })),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
  };
});
