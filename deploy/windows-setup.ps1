param(
  [string]$AppRoot = "C:\questionnaire-demo",
  [int]$Port = 3000,
  [string]$RepoZipUrl = "https://github.com/ShonWal/questionnaire-demo/archive/refs/heads/main.zip"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Step($Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Please run PowerShell as Administrator."
  }
}

Assert-Admin

$ReleaseDir = Join-Path $AppRoot "app"
$DataDir = Join-Path $AppRoot "data"
$ToolsDir = Join-Path $AppRoot "tools"
$LogsDir = Join-Path $AppRoot "logs"
$TaskName = "QuestionnaireDemo"
$NodeDir = Join-Path $ToolsDir "node"
$NodeExe = Join-Path $NodeDir "node.exe"

Write-Step "Creating directories"
New-Item -ItemType Directory -Force -Path $AppRoot, $ReleaseDir, $DataDir, $ToolsDir, $LogsDir | Out-Null

Write-Step "Installing portable Node.js if needed"
if (-not (Test-Path $NodeExe)) {
  $nodeIndex = Invoke-RestMethod "https://nodejs.org/dist/index.json"
  $nodeVersion = ($nodeIndex | Where-Object { $_.version -like "v20.*" -and $_.lts } | Select-Object -First 1).version
  if (-not $nodeVersion) { throw "Could not resolve Node.js v20 LTS version." }

  $nodeZip = Join-Path $env:TEMP "node-$nodeVersion-win-x64.zip"
  $nodeUrl = "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip"
  Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip

  $extractDir = Join-Path $env:TEMP "node-$nodeVersion-win-x64"
  Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
  Expand-Archive -Path $nodeZip -DestinationPath $env:TEMP -Force
  Remove-Item -Recurse -Force $NodeDir -ErrorAction SilentlyContinue
  Move-Item -Path $extractDir -Destination $NodeDir
}

& $NodeExe --version

Write-Step "Downloading latest application from GitHub"
$zipPath = Join-Path $env:TEMP "questionnaire-demo-main.zip"
$extractRoot = Join-Path $env:TEMP "questionnaire-demo-main"
Remove-Item -Recurse -Force $zipPath, $extractRoot -ErrorAction SilentlyContinue
Invoke-WebRequest -Uri $RepoZipUrl -OutFile $zipPath
Expand-Archive -Path $zipPath -DestinationPath $extractRoot -Force
$sourceDir = Get-ChildItem -Path $extractRoot -Directory | Select-Object -First 1
if (-not $sourceDir) { throw "Could not find extracted application directory." }

Write-Step "Updating application files"
Get-ChildItem -Path $ReleaseDir -Force | Where-Object { $_.Name -ne "data" } | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $sourceDir.FullName "*") -Destination $ReleaseDir -Recurse -Force

Write-Step "Preparing database"
$dbFile = Join-Path $DataDir "db.json"
if (-not (Test-Path $dbFile)) {
  '{"surveys":[],"responses":[]}' | Set-Content -Path $dbFile -Encoding UTF8
}

Write-Step "Creating startup runner"
$startScript = Join-Path $AppRoot "start-questionnaire-demo.ps1"
@"
`$ErrorActionPreference = "Continue"
`$env:PORT = "$Port"
`$env:DB_FILE = "$dbFile"
Set-Location "$ReleaseDir"
while (`$true) {
  `$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  "Starting questionnaire demo at `$stamp" | Tee-Object -FilePath "$LogsDir\server.log" -Append
  & "$NodeExe" "$ReleaseDir\server.js" *>> "$LogsDir\server.log"
  "Process exited. Restarting in 5 seconds..." | Tee-Object -FilePath "$LogsDir\server.log" -Append
  Start-Sleep -Seconds 5
}
"@ | Set-Content -Path $startScript -Encoding UTF8

Write-Step "Opening Windows Firewall port $Port"
$ruleName = "Questionnaire Demo $Port"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existingRule) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
}

Write-Step "Registering Windows startup task"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -User "SYSTEM" -RunLevel Highest | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Step "Waiting for local service"
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
}

if (-not $ok) {
  Write-Warning "The service did not respond locally yet. Check logs: $LogsDir\server.log"
} else {
  Write-Host "`nDeployment finished." -ForegroundColor Green
  Write-Host "Local URL:  http://127.0.0.1:$Port"
  Write-Host "Public URL: http://47.108.189.6:$Port"
  Write-Host "If the public URL cannot open, add an Alibaba Cloud security group inbound rule: TCP $Port from 0.0.0.0/0."
}

