param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9:._-]+$')][string]$Serial,
  [ValidateSet('status','enable','release')][string]$Action='status',
  [string]$Adb='adb'
)
$ErrorActionPreference='Stop'
$package='kz.uroki.app'
$admin="$package/expo.modules.screenguard.DeviceOwnerReceiver"
$maintenance="$package/expo.modules.screenguard.OwnerMaintenanceReceiver"
function Invoke-Adb([string[]]$Arguments) {
  $output=& $Adb -s $Serial @Arguments 2>&1
  if($LASTEXITCODE -ne 0) {throw ($output -join "`n")}
  return ($output -join "`n")
}
if((Invoke-Adb @('get-state')).Trim() -ne 'device') {throw 'Authorize this USB computer on the child device first.'}
if((Invoke-Adb @('shell','am','get-current-user')).Trim() -ne '0') {throw 'This setup supports the primary Android user only.'}
if((Invoke-Adb @('shell','pm','path',$package)) -notmatch 'package:') {throw 'Install the Device Owner-capable Kontrol DZ APK first.'}
if($Action -eq 'enable') {
  # Android enforces eligibility. Never reset the device, delete accounts or replace another owner here.
  $result=Invoke-Adb @('shell','dpm','set-device-owner','--user','0',$admin)
  if($result -notmatch 'Success:') {throw "Android did not approve Device Owner. No data was deleted. $result"}
}
$suffix=switch($Action){'enable'{'APPLY'} 'release'{'RELEASE'} default{'STATUS'}}
$result=Invoke-Adb @('shell','am','broadcast','--user','0','--include-stopped-packages','-n',$maintenance,'-a',"$package.DEVICE_OWNER_$suffix")
if($result -notmatch 'result=-1') {throw "Operation was not confirmed. $result"}
$match=[regex]::Match($result,'data="(\{.*\})"')
if(-not $match.Success) {throw 'No policy status returned; do not assume protection is active.'}
$state=$match.Groups[1].Value.Replace('\"','"') | ConvertFrom-Json
if($Action -eq 'enable' -and (-not $state.device_owner -or -not $state.uninstall_blocked)) {throw 'Device Owner protection was not verified. Inspect Android device policy before disconnecting.'}
if($Action -eq 'release' -and ($state.device_owner -or $state.uninstall_blocked)) {throw 'Android did not release ownership. Do not uninstall or assume deprovisioning succeeded.'}
$state | ConvertTo-Json -Compress
