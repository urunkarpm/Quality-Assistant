# Quality Assistant Setup Script for Windows
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Quality Assistant Installer" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
Write-Host "[1/5] Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "  ✓ Node.js is already installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js not found. Please install from https://nodejs.org/" -ForegroundColor Red
    Write-Host "  After installing Node.js, run this script again." -ForegroundColor Yellow
    exit 1
}

# Check if Git is installed
Write-Host "[2/5] Checking Git installation..." -ForegroundColor Yellow
try {
    $gitVersion = git --version
    Write-Host "  ✓ Git is already installed: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "  ! Git not found. Installing Git..." -ForegroundColor Yellow
    winget install --id Git.Git -e --source winget
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ! Automatic installation failed. Please install Git manually from https://git-scm.com/" -ForegroundColor Yellow
    }
}

# Clone repository if not already present
Write-Host "[3/5] Setting up Quality Assistant..." -ForegroundColor Yellow
if (Test-Path ".\Quality-Assistant") {
    Write-Host "  ✓ Quality Assistant directory already exists" -ForegroundColor Green
    Set-Location .\Quality-Assistant
} else {
    Write-Host "  → Cloning repository..." -ForegroundColor Cyan
    git clone https://github.com/urunkarpm/Quality-Assistant.git
    Set-Location .\Quality-Assistant
}

# Install npm dependencies
Write-Host "[4/5] Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Dependencies installed successfully" -ForegroundColor Green

# Install Playwright browsers
Write-Host "[5/5] Installing Playwright browsers..." -ForegroundColor Yellow
npx playwright install chromium
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ! Playwright installation had issues, but you can install later with: npx playwright install" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "To start the server, run:" -ForegroundColor Cyan
Write-Host "  npm start" -ForegroundColor White
Write-Host ""
Write-Host "Then open your browser to:" -ForegroundColor Cyan
Write-Host "  http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
