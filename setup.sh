#!/bin/bash

# Quality Assistant Setup Script for Linux/Mac

echo "======================================"
echo "  Quality Assistant Installer"
echo "======================================"
echo ""

# Check if Node.js is installed
echo "[1/5] Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "  ✓ Node.js is already installed: $NODE_VERSION"
else
    echo "  ✗ Node.js not found."
    echo "  Please install Node.js from https://nodejs.org/"
    echo "  Or use your package manager:"
    echo "    Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs"
    echo "    Fedora: sudo dnf install nodejs"
    echo "    Mac (with Homebrew): brew install node"
    exit 1
fi

# Check if Git is installed
echo "[2/5] Checking Git installation..."
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    echo "  ✓ Git is already installed: $GIT_VERSION"
else
    echo "  ! Git not found. Installing Git..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install git
        else
            echo "  ! Homebrew not found. Please install Git manually from https://git-scm.com/"
        fi
    else
        # Linux
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y git
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y git
        elif command -v yum &> /dev/null; then
            sudo yum install -y git
        else
            echo "  ! Could not detect package manager. Please install Git manually."
        fi
    fi
fi

# Clone repository if not already present
echo "[3/5] Setting up Quality Assistant..."
if [ -d "Quality-Assistant" ]; then
    echo "  ✓ Quality Assistant directory already exists"
    cd Quality-Assistant
else
    echo "  → Cloning repository..."
    git clone https://github.com/urunkarpm/Quality-Assistant.git
    cd Quality-Assistant
fi

# Install npm dependencies
echo "[4/5] Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "  ✗ Failed to install dependencies"
    exit 1
fi
echo "  ✓ Dependencies installed successfully"

# Install Playwright browsers
echo "[5/5] Installing Playwright browsers..."
npx playwright install chromium
if [ $? -ne 0 ]; then
    echo "  ! Playwright installation had issues, but you can install later with: npx playwright install"
fi

echo ""
echo "======================================"
echo "  Installation Complete!"
echo "======================================"
echo ""
echo "To start the server, run:"
echo "  npm start"
echo ""
echo "Then open your browser to:"
echo "  http://localhost:3000"
echo ""
