import type { Member } from '@/lib/api';
import { childDevices, deviceKind, modelName } from '@/lib/devices';

const member = (over: Partial<Member>): Member => ({ id: 'x', role: 'child', name: null, telegram: false, me: false, child_id: 1, ...over });

describe('child devices', () => {
  it('names a device after its model', () => {
    expect(modelName('samsung', 'SM-T220')).toBe('Samsung SM-T220');
    expect(modelName('google', 'Pixel 7')).toBe('Google Pixel 7');
    expect(modelName('Xiaomi', 'Xiaomi 13')).toBe('Xiaomi 13');
    expect(modelName('', 'Redmi Note 8')).toBe('Redmi Note 8');
    expect(modelName('HONOR', '')).toBe('HONOR');
    expect(modelName(undefined, undefined)).toBe('');
    expect(modelName('a', 'b'.repeat(40)).length).toBe(30);
  });
  it('tells Android, iPhone, iPad and the web apart', () => {
    expect(deviceKind('android', 'Samsung SM-T220')).toBe('android');
    expect(deviceKind('ios', 'iPad')).toBe('ipad');
    expect(deviceKind('ios', 'iPhone')).toBe('iphone');
    expect(deviceKind('ios', null)).toBe('iphone');
    expect(deviceKind('web')).toBe('web');
    expect(deviceKind(null, 'Планшет')).toBe('unknown');
  });
  it('lists the devices of one child only', () => {
    const ms = [
      member({ id: 'p', role: 'parent', child_id: null }),
      member({ id: 'phone', child_id: 1 }),
      member({ id: 'tablet', child_id: 1, platform: 'android' }),
      member({ id: 'sister', child_id: 2 }),
      member({ id: 'legacy', child_id: null }),
      member({ id: 'tutor', role: 'viewer', child_id: null }),
    ];
    expect(childDevices(ms, 1, false).map((m) => m.id)).toEqual(['phone', 'tablet']);
    expect(childDevices(ms, 2, false).map((m) => m.id)).toEqual(['sister']);
    expect(childDevices(ms, 1, true).map((m) => m.id)).toEqual(['phone', 'tablet', 'legacy']);
  });
});
