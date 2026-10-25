# MorphSite 本机安装脚本（Windows）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "`n[1/4] 检查 Node.js ..." -ForegroundColor Cyan
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw "未找到 Node.js。请安装 Node.js 20.9 或更高版本后重试。" }
Write-Host ("Node " + (& node --version))

Write-Host "`n[2/4] 安装前端依赖 ..." -ForegroundColor Cyan
if (Test-Path package-lock.json) { & npm ci } else { & npm install }
if ($LASTEXITCODE -ne 0) { throw "前端依赖安装失败。" }

Write-Host "`n[3/4] 检查 Python 3.12 ..." -ForegroundColor Cyan
$py = Get-Command py -ErrorAction SilentlyContinue
if (-not $py) { throw "未找到 Python Launcher。请安装 Python 3.12 并勾选 py launcher。" }
& py -3.12 --version
if ($LASTEXITCODE -ne 0) { throw "未找到 Python 3.12。请安装后重试。" }

Write-Host "`n[4/4] 安装后端依赖 ..." -ForegroundColor Cyan
$backend = Join-Path $PSScriptRoot "integrations\hackathon-mvp\backend"
Push-Location $backend
if (-not (Test-Path .venv)) { & py -3.12 -m venv .venv }
& ".venv\Scripts\python.exe" -m pip install --upgrade pip
& ".venv\Scripts\python.exe" -m pip install -r requirements.txt
Pop-Location

if (-not (Test-Path ".env.local")) { Copy-Item ".env.example" ".env.local"; Write-Host "已创建 .env.local，请填入配置。" -ForegroundColor Yellow }
if (-not (Test-Path (Join-Path $backend ".env"))) { Copy-Item (Join-Path $backend ".env.example") (Join-Path $backend ".env"); Write-Host "已创建后端 .env，请填入配置。" -ForegroundColor Yellow }

Write-Host "`n安装完成。运行 START-MORPHSITE.ps1 启动。" -ForegroundColor Green
