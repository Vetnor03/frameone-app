param(
  [Parameter(Mandatory=$true)]
  [string]$SdkZip
)

$ErrorActionPreference = "Stop"

$coreRoot = Join-Path $env:LOCALAPPDATA "Arduino15\packages\esp32\hardware\esp32\2.0.14"
$sdkRoot = Join-Path $coreRoot "tools\sdk"
$target = Join-Path $sdkRoot "esp32s3"

if (!(Test-Path $coreRoot)) {
  throw "Arduino-ESP32 2.0.14 was not found at: $coreRoot"
}
if (!(Test-Path $target)) {
  throw "Existing ESP32-S3 SDK was not found at: $target"
}
if (!(Test-Path $SdkZip)) {
  throw "SDK zip was not found: $SdkZip"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $sdkRoot "esp32s3.backup-$stamp"
$temp = Join-Path $env:TEMP "remind-pm-sdk-$stamp"

Write-Host "Backing up stock ESP32-S3 SDK..."
Copy-Item -Recurse -Force $target $backup

try {
  New-Item -ItemType Directory -Force -Path $temp | Out-Null
  Expand-Archive -Path $SdkZip -DestinationPath $temp -Force

  $replacement = Join-Path $temp "esp32s3"
  if (!(Test-Path $replacement)) {
    throw "The archive does not contain the expected esp32s3 folder."
  }

  $configHeader = Get-ChildItem -Path $replacement -Filter sdkconfig.h -Recurse | Select-Object -First 1
  if ($null -eq $configHeader) {
    throw "No sdkconfig.h was found in the replacement SDK."
  }

  $configText = Get-Content $configHeader.FullName -Raw
  if ($configText -notmatch '(?m)^#define CONFIG_PM_ENABLE 1$') {
    throw "Replacement SDK does not have CONFIG_PM_ENABLE=1."
  }
  if ($configText -notmatch '(?m)^#define CONFIG_FREERTOS_USE_TICKLESS_IDLE 1$') {
    throw "Replacement SDK does not have CONFIG_FREERTOS_USE_TICKLESS_IDLE=1."
  }

  Remove-Item -Recurse -Force $target
  Copy-Item -Recurse -Force $replacement $target

  Write-Host ""
  Write-Host "RE:MIND PM-enabled ESP32-S3 SDK installed successfully."
  Write-Host "Backup of the stock SDK: $backup"
  Write-Host "Restart Arduino IDE before compiling V2/V3."
}
catch {
  Write-Host "Install failed; restoring the original SDK..."
  if (Test-Path $target) {
    Remove-Item -Recurse -Force $target
  }
  Copy-Item -Recurse -Force $backup $target
  throw
}
finally {
  if (Test-Path $temp) {
    Remove-Item -Recurse -Force $temp
  }
}
