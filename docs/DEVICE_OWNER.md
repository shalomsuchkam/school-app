# Android Device Owner: USB pilot

This optional mode protects `kz.uroki.app` against ordinary uninstall after a parent
explicitly provisions it as Device Owner. It is not enabled by installing/updating
the app, joining a family, or tapping a normal device-admin permission dialog.
iOS is unaffected. Existing Usage access/overlay/location setup remains necessary.

## Scope and limits

- Only our package is passed to `setUninstallBlocked`. Actual OS state is read back.
- The child sees the management/protection status even when screen-time rules are off.
- No factory reset, account deletion, lock task, password policy, camera restriction,
  hidden monitoring, disabling USB debugging or automatic permission grants are added.
- This is an assisted USB pilot, not an approved Android Enterprise EMM or QR/zero-touch
  enrollment product. Modern managed provisioning can require DPC approval/allowlisting.
- Device Owner is normally provisioned during initial device setup; Android can reject
  ADB provisioning on a configured device, especially with accounts/another owner/users.
  Never erase an existing child's phone or remove accounts automatically to work around it.
- Device Owner does not guarantee that the child cannot stop using/power off/reset the
  phone by every possible means. Do not market it as impossible to bypass.

## Parent-assisted setup

Use a dedicated Android phone with the parent's consent, a backup and authorized USB
debugging. Install the new APK, confirm the device's serial with `adb devices`, then run
these commands from the repository on the parent's computer (replace `SERIAL`):

```powershell
./scripts/device-owner.ps1 -Serial SERIAL -Action status
./scripts/device-owner.ps1 -Serial SERIAL -Action enable
```

The helper targets one explicit serial and primary user0. Android's `dpm set-device-owner`
performs eligibility checks. If it refuses, stop and preserve its error; do not reset,
delete accounts or replace another administrator. If it succeeds, the helper applies
and reads back our uninstall policy. Open the child app and verify the protection card.
Keep access to the authorized parent computer; the child must not control its ADB keys.
USB debugging is privileged maintenance access, not an anti-tamper boundary.

## Parent-assisted removal without an automatic wipe

```powershell
./scripts/device-owner.ps1 -Serial SERIAL -Action release
./scripts/device-owner.ps1 -Serial SERIAL -Action status
```

The maintenance receiver requires Android's platform `android.permission.DUMP`, held
by ADB shell/system, and has no implicit intent filter. The device-admin receiver instead
requires `BIND_DEVICE_ADMIN`. No JS method/deep link/ordinary app can call release.
Release removes our uninstall policy before calling `clearDeviceOwnerApp`, then reads
back ownership. This Android API is deprecated and intended for testing; it is used
only by this assisted USB pilot. Removing ownership is not reversible without eligible
reprovisioning. Android warns that policy cleanup is best effort; our pilot sets only
the explicit uninstall policy and clears it first. Do not promise this recovery works
on every OEM/version. If release fails, it reports failure and does not wipe data.
Do not enroll a real child's phone until setup, blocked uninstall and release have
all been verified on a disposable device with the same OS/OEM.

References:
- https://developer.android.com/work/dpc/build-dpc
- https://developer.android.com/reference/android/app/admin/DevicePolicyManager#setUninstallBlocked(android.content.ComponentName,java.lang.String,boolean)
- https://developer.android.com/reference/android/app/admin/DevicePolicyManager#clearDeviceOwnerApp(java.lang.String)

## Verification

Unit tests cover non-owner isolation, reading back failed policy application, release
ordering and failed release. Native build and disposable-device policy verification
must be recorded separately; unit tests alone do not prove OS enforcement.
