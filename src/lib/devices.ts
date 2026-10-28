import { Platform } from 'react-native';

import type { Member } from './api';

// A child may use several devices (phone + tablet): each joins with its own child invite and becomes a member row
// with the same child_id. Pure helpers (unit-tested) plus the two reads of this device's platform and model.

export type DevicePlatform = 'android' | 'ios' | 'web';
export type DeviceKind = 'android' | 'iphone' | 'ipad' | 'web' | 'unknown';

/** This device's platform as the server stores it (`x-platform` header, POST /join). */
export const devicePlatform = (): DevicePlatform => (Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web');

/** "Samsung SM-T220" from Build.BRAND / Build.MODEL; the brand is left out when the model already starts with it. */
export function modelName(brand: string | null | undefined, model: string | null | undefined): string {
  const b = (brand ?? '').trim();
  const m = (model ?? '').trim();
  if (!m) return b ? b[0].toUpperCase() + b.slice(1) : '';
  if (!b || m.toLowerCase().startsWith(b.toLowerCase())) return m.slice(0, 30);
  return `${b[0].toUpperCase()}${b.slice(1)} ${m}`.slice(0, 30);
}

/**
 * A default name for this device from its model, sent when the child joins without typing a name, so the parent can
 * tell the phone from the tablet. Cheap: React Native's own platform constants, no extra native module.
 */
export function deviceModel(): string {
  try {
    if (Platform.OS === 'android') {
      const c = Platform.constants as unknown as { Brand?: string; Manufacturer?: string; Model?: string };
      return modelName(c.Brand || c.Manufacturer, c.Model);
    }
    if (Platform.OS === 'ios') return (Platform as { isPad?: boolean }).isPad ? 'iPad' : 'iPhone';
  } catch {
    // constants unavailable: the server keeps the name empty
  }
  return '';
}

/** What kind of device a member is, for its icon and label («Android», «iPad», …). */
export function deviceKind(platform: string | null | undefined, name?: string | null): DeviceKind {
  if (platform === 'android') return 'android';
  if (platform === 'ios') return /ipad/i.test(name ?? '') ? 'ipad' : 'iphone';
  if (platform === 'web') return 'web';
  return 'unknown';
}

/** The devices of one child, oldest first. With a single child, rows from before children had ids belong to it. */
export function childDevices(members: Member[], childId: number, onlyChild: boolean): Member[] {
  return members.filter((m) => m.role === 'child' && (m.child_id === childId || (onlyChild && m.child_id == null)));
}
