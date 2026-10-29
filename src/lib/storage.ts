import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore on phones; localStorage only for the web preview build.
const web = Platform.OS === 'web';
// Background location tasks need the credential after the phone has been unlocked
// once since boot, including while its screen is locked (iOS Keychain).
const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
export const storage = {
  get: async (k: string) => (web ? globalThis.localStorage?.getItem(k) ?? null : SecureStore.getItemAsync(k)),
  set: async (k: string, v: string) => (web ? globalThis.localStorage?.setItem(k, v) : SecureStore.setItemAsync(k, v, options)),
  del: async (k: string) => (web ? globalThis.localStorage?.removeItem(k) : SecureStore.deleteItemAsync(k)),
};
