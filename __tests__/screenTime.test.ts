import type { DeviceReport } from '@/lib/api';
import { countedUsage, filterApps, guardHealth, httpHost, remaining, sameSite, unlockActive, usageOf, validLink, withPkg } from '@/lib/screenTime';

const NOW = Date.parse('2026-10-22T12:00:00Z');
const device = (over: Partial<DeviceReport> = {}): DeviceReport => ({
  device_id: 'd1',
  apps: [{ pkg: 'com.tiktok', name: 'TikTok' }],
  usage: { date: '2026-10-22', total_min: 90, apps: { 'com.tiktok': 40, 'com.whatsapp': 20 } },
  guard: { usage_access: true, overlay: true, battery_ok: true, running: true },
  reported_at: '2026-10-22T11:50:00Z',
  approved: [],
  ...over,
});

describe('guardHealth', () => {
  it('has nothing to say before the first report', () => {
    expect(guardHealth(null, NOW)).toEqual({ kind: 'none' });
  });
  it('reports a fresh, complete guard as working', () => {
    expect(guardHealth(device(), NOW)).toEqual({ kind: 'ok', minutes: 10, battery_ok: true });
  });
  it('names the permissions that are off', () => {
    const h = guardHealth(device({ guard: { usage_access: true, overlay: false, battery_ok: true, running: false } }), NOW);
    expect(h).toEqual({ kind: 'off', missing: ['overlay', 'running'], hours: 0 });
  });
  it('calls a report older than 2 hours stale', () => {
    expect(guardHealth(device({ reported_at: '2026-10-22T07:30:00Z' }), NOW)).toEqual({ kind: 'stale', hours: 4 });
    expect(guardHealth(device({ reported_at: '2026-10-22T10:30:00Z' }), NOW).kind).toBe('ok');
  });
});

describe('usage', () => {
  it('ignores a report from another day', () => {
    expect(usageOf({ device: device(), today: '2026-10-23' })).toEqual({ total: 0, apps: {} });
    expect(usageOf({ device: device(), today: '2026-10-22' }).total).toBe(90);
  });
  it('counts usage without always-allowed apps and the minutes left', () => {
    const used = countedUsage(90, { 'com.whatsapp': 20 }, ['com.whatsapp']);
    expect(used).toBe(70);
    expect(remaining(60, used)).toBe(0);
    expect(remaining(120, used)).toBe(50);
    expect(remaining(null, used)).toBeNull();
  });
  it('knows whether a bonus unlock is running', () => {
    expect(unlockActive('2026-10-22T12:30:00Z', NOW)).toBe(true);
    expect(unlockActive('2026-10-22T11:30:00Z', NOW)).toBe(false);
    expect(unlockActive(null, NOW)).toBe(false);
  });
});

describe('app lists', () => {
  it('adds without duplicates and removes', () => {
    expect(withPkg(['a', 'b'], 'a', true)).toEqual(['b', 'a']);
    expect(withPkg(['a', 'b'], 'a', false)).toEqual(['b']);
  });
  it('searches by name or package, most used first, skipping excluded ones', () => {
    const apps = [
      { pkg: 'com.a', name: 'Alpha' },
      { pkg: 'com.tiktok', name: 'TikTok' },
      { pkg: 'com.game', name: 'Game' },
    ];
    expect(filterApps(apps, '', { 'com.game': 30, 'com.a': 5 }).map((a) => a.pkg)).toEqual(['com.game', 'com.a', 'com.tiktok']);
    expect(filterApps(apps, 'tik', {}).map((a) => a.pkg)).toEqual(['com.tiktok']);
    expect(filterApps(apps, '', {}, ['com.a']).map((a) => a.pkg)).toEqual(['com.game', 'com.tiktok']);
  });
});

describe('textbook viewer navigation', () => {
  const base = 'https://okulyk.kz/books/5';
  it('parses hosts and refuses other schemes and tricks', () => {
    expect(httpHost('https://User:pw@Okulyk.KZ:443/x')).toBe('okulyk.kz');
    expect(httpHost('javascript:alert(1)')).toBeNull();
    expect(httpHost('intent://scan#Intent;end')).toBeNull();
    expect(httpHost('https://evil.com\\@okulyk.kz/')).toBeNull();
  });
  it('stays on the same site, its www twin and subdomains', () => {
    expect(sameSite(base, 'https://okulyk.kz/books/6')).toBe(true);
    expect(sameSite(base, 'https://www.okulyk.kz/')).toBe(true);
    expect(sameSite(base, 'https://cdn.okulyk.kz/a.pdf')).toBe(true);
    expect(sameSite('https://www.okulyk.kz/', 'https://okulyk.kz/')).toBe(true);
    expect(sameSite(base, 'about:blank')).toBe(true);
  });
  it('blocks other hosts and non-http schemes', () => {
    expect(sameSite(base, 'https://youtube.com/')).toBe(false);
    expect(sameSite(base, 'https://okulyk.kz.evil.com/')).toBe(false);
    expect(sameSite(base, 'https://notokulyk.kz/')).toBe(false);
    expect(sameSite(base, 'mailto:a@b.c')).toBe(false);
    expect(sameSite(base, 'file:///etc/hosts')).toBe(false);
    expect(sameSite(base, 'https://evil.com@okulyk.kz/')).toBe(true); // userinfo: the host really is okulyk.kz
  });
  it('validates links the server accepts', () => {
    expect(validLink('https://okulyk.kz/x')).toBe(true);
    expect(validLink('ftp://okulyk.kz')).toBe(false);
    expect(validLink('https://')).toBe(false);
    expect(validLink(`https://a.kz/${'x'.repeat(500)}`)).toBe(false);
  });
});
