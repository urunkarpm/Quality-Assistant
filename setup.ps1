# Quality Assistant — Windows Setup Script
# Run this once in PowerShell as Administrator:
#   powershell -ExecutionPolicy Bypass -File setup.ps1

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
}

Write-Host "`n=== Quality Assistant Setup ===" -ForegroundColor Cyan

# 1. Python
Write-Host "`n[1/4] Installing Python..." -ForegroundColor Yellow
winget install Python.Python.3 --silent --accept-package-agreements --accept-source-agreements
Refresh-Path

# 2. Visual C++ Build Tools (needed by better-sqlite3)
Write-Host "`n[2/4] Installing Visual C++ Build Tools (this may take a few minutes)..." -ForegroundColor Yellow
winget install Microsoft.VisualStudio.2022.BuildTools --silent --accept-package-agreements --accept-source-agreements `
  --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
Refresh-Path

# 3. npm install
Write-Host "`n[3/4] Installing npm packages..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nERROR: npm install failed. See output above." -ForegroundColor Red
    exit 1
}

# 4. Playwright browser
Write-Host "`n[4/4] Installing Playwright browser..." -ForegroundColor Yellow
npx playwright install chromium

Write-Host "`n=== Setup complete! ===" -ForegroundColor Green
Write-Host "Start the app with:  npm start" -ForegroundColor Cyan
Write-Host "Then open:           http://localhost:3000`n" -ForegroundColor Cyan
