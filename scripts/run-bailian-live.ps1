param(
  [int]$VideoPollSeconds = 15,
  [int]$VideoMaxPolls = 40
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repo "integrations\hackathon-mvp\backend\.venv312\Scripts\python.exe"
$probe = Join-Path $repo "scripts\probe-bailian-live.py"
$resultDir = Join-Path $repo "test-results\bailian-live"
$log = Join-Path $resultDir ("run-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

New-Item -ItemType Directory -Force -Path $resultDir | Out-Null

if (-not (Test-Path -LiteralPath $python)) {
  throw "Backend Python environment is missing: $python"
}

function Invoke-OneProbe {
  param([Parameter(Mandatory = $true)][string]$Capability)

  Write-Host "`n=== $Capability ===" -ForegroundColor Cyan
  $raw = (& $python $probe $Capability 2>&1 | Out-String).Trim()
  $exitCode = $LASTEXITCODE
  $raw | Add-Content -LiteralPath $log -Encoding UTF8
  Write-Host $raw

  $data = $null
  try {
    $data = $raw | ConvertFrom-Json
  } catch {
    Write-Warning "Probe returned non-JSON output. See $log"
  }
  return [PSCustomObject]@{ ExitCode = $exitCode; Data = $data }
}

Write-Host "MorphSite Bailian live verification" -ForegroundColor Green
Write-Host "This performs one text, one image, one short TTS, and at most one video task creation."
Write-Host "Video status polling reuses the saved task_id and never creates a second paid task."

$text = Invoke-OneProbe -Capability "text"
if ($text.ExitCode -ne 0) {
  throw "Text authentication/model probe failed. Media calls were not started."
}

$image = Invoke-OneProbe -Capability "image"
$tts = Invoke-OneProbe -Capability "tts"

$video = Invoke-OneProbe -Capability "video"
if ($video.ExitCode -ne 0) {
  throw "Video task creation/query failed. Image and TTS results remain available."
}

for ($poll = 1; $poll -le $VideoMaxPolls; $poll++) {
  $status = [string]$video.Data.status
  if ($status -eq "SUCCEEDED") {
    Write-Host "`nVideo completed and was saved locally." -ForegroundColor Green
    Write-Host "Log: $log"
    exit 0
  }
  if ($status -in @("FAILED", "CANCELED", "UNKNOWN")) {
    throw "Video task ended with status: $status"
  }
  if ($poll -eq $VideoMaxPolls) {
    Write-Warning "Video is still $status after the bounded polling window. Run this script again to continue querying the same task_id."
    Write-Host "Log: $log"
    exit 2
  }

  Write-Host "Video stage: $status. Waiting $VideoPollSeconds seconds before querying the same task..."
  Start-Sleep -Seconds $VideoPollSeconds
  $video = Invoke-OneProbe -Capability "video"
  if ($video.ExitCode -ne 0) {
    throw "Video status query failed. No replacement task was created."
  }
}
