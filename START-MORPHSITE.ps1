# MorphSite 启动脚本（Windows）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$backend = Join-Path $PSScriptRoot "integrations\hackathon-mvp\backend"
if (-not (Test-Path (Join-Path $backend ".venv\Scripts\python.exe"))) { throw "请先运行 INSTALL-WINDOWS.ps1。" }
if (-not (Test-Path ".env.local")) { throw "缺少 .env.local。请复制 .env.example 并填写配置。" }

$env:MARKETING_BACKEND_URL = "http://127.0.0.1:8002"
Write-Host "启动营销素材后端 ..." -ForegroundColor Cyan
Start-Process -FilePath (Join-Path $backend ".venv\Scripts\python.exe") -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8002" -WorkingDirectory $backend -WindowStyle Minimized

Start-Sleep -Seconds 3
Write-Host "启动 MorphSite 前端 ..." -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev" -WorkingDirectory $PSScriptRoot
Start-Sleep -Seconds 6
Start-Process "http://localhost:3000"
Write-Host "已打开 http://localhost:3000 。工作台：http://localhost:3000/studio" -ForegroundColor Green
Write-Host "关闭两个终端窗口即可停止服务。" -ForegroundColor Yellow
