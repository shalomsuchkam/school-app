import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// Local Android module (modules/exact-alarm): Android 14+ turns exact alarms off by default,
// which makes scheduled reminders arrive late. Other platforms always report "allowed".
type ExactAlarm = { canSchedule(): boolean; openSettings(): boolean };
const native = Platform.OS === 'android' ? requireOptionalNativeModule<ExactAlarm>('ExactAlarm') : null;

export function exactAlarmsAllowed(): boolean {
  try {
    return native ? native.canSchedule() : true;
  } catch {
    return true;
  }
}

export function openExactAlarmSettings(): boolean {
  try {
    return native ? native.openSettings() : false;
  } catch {
    return false;
  }
}
