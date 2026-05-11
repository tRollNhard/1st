#!/bin/bash

# Open Claude Cowork Setup Script
# This script helps you get started with Composio and configure the project

set -e

echo "Open Claude Cowork Setup"
echo "================================"
echo ""

# Check if Composio CLI is installed
if ! command -v composio &> /dev/null; then
    echo "Composio CLI not found. Installing..."
    echo ""
    curl -fsSL https://composio.dev/install | bash
    echo ""
    echo "Composio CLI installed successfully!"
    echo ""
    # Source the shell config to make composio available immediately
    if [ -f "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc"
    elif [ -f "$HOME/.zshrc" ]; then
        source "$HOME/.zshrc"
    fi
else
    echo "Composio CLI already installed"
    echo ""
fi

# Check if user is already logged in
if composio whoami &> /dev/null; then
    echo "Already logged in to Composio"
    echo ""
else
    echo "Please log in to Composio (or sign up if you don't have an account)"
    echo "This will open your browser to complete authentication"
    echo ""
    read -p "Press Enter to continue..."
    composio login
    echo ""
    echo "Successfully authenticated with Composio!"
    echo ""
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo ".env file created"
    echo ""
else
    echo ".env file already exists"
    echo ""
fi

# Prompt for Anthropic API key
echo "API Key Configuration"
echo "------------------------"
echo ""
echo "You'll need an Anthropic API key from: https://console.anthropic.com"
echo ""
read -p "Enter your Anthropic API key (or press Enter to skip): " anthropic_key

if [ ! -z "$anthropic_key" ]; then
    # Update .env file with Anthropic key
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$anthropic_key/" .env
    else
        sed -i "s/ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$anthropic_key/" .env
    fi
    echo "Anthropic API key saved to .env"
else
    echo "Skipped Anthropic API key. Please add it to .env manually."
fi
echo ""

# Get Composio API key and update .env
echo "Retrieving Composio API key..."
composio_key=$(composio whoami 2>&1 | grep -o "API Key: .*" | cut -d ' ' -f 3 || echo "")

if [ ! -z "$composio_key" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/COMPOSIO_API_KEY=.*/COMPOSIO_API_KEY=$composio_key/" .env
    else
        sed -i "s/COMPOSIO_API_KEY=.*/COMPOSIO_API_KEY=$composio_key/" .env
    fi
    echo "Composio API key saved to .env"
else
    echo "Could not retrieve Composio API key automatically."
    echo "Please add it to .env manually."
fi
echo ""

# Install dependencies
echo "Installing project dependencies..."
echo ""
npm install
cd server && npm install && cd ..

# Python deps for skill_crawler.py (folded-scalar parsing) + validate-skills.py.
# Non-fatal: skill matching still works without pyyaml (degraded — folded
# scalars in SKILL.md frontmatter get truncated), so we warn but don't abort.
if command -v python &> /dev/null; then
    PYTHON_CMD=python
elif command -v python3 &> /dev/null; then
    PYTHON_CMD=python3
else
    PYTHON_CMD=
fi

if [ -n "$PYTHON_CMD" ]; then
    echo ""
    echo "Installing Python dependencies..."
    # `pip install --user` is rejected inside a virtualenv (PEP 370). Only pass
    # --user when we're using a "real" interpreter — i.e. sys.prefix matches
    # sys.base_prefix. Inside a venv the venv itself handles isolation.
    if "$PYTHON_CMD" -c "import sys; sys.exit(0 if sys.prefix != sys.base_prefix else 1)" 2>/dev/null; then
        PIP_USER_FLAG=""  # in a venv — --user would error
    else
        PIP_USER_FLAG="--user"
    fi
    if "$PYTHON_CMD" -m pip install $PIP_USER_FLAG -r requirements.txt; then
        echo "Python dependencies installed"
    else
        echo "WARNING: Python dependency install failed."
        echo "  Skill matching will work but folded-scalar descriptions"
        echo "  in SKILL.md frontmatter will be truncated until pyyaml is"
        echo "  installed manually: $PYTHON_CMD -m pip install $PIP_USER_FLAG -r requirements.txt"
    fi
else
    echo ""
    echo "WARNING: Python not found. Install Python 3.10+ to enable skill matching."
fi
echo ""
echo "Dependencies installed"
echo ""

# Final instructions
echo "================================"
echo "Setup complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Make sure your .env file has both API keys configured"
echo "2. Start the backend server:"
echo "   cd server && npm start"
echo ""
echo "3. In a new terminal, start the Electron app:"
echo "   npm start"
echo ""
echo "For more info, check out:"
echo "   - Composio Dashboard: https://platform.composio.dev"
echo "   - Composio Docs: https://docs.composio.dev"
echo "   - Claude Agent SDK: https://docs.anthropic.com/en/docs/claude-agent-sdk"
echo ""
echo "Need help? Open an issue on GitHub!"
echo ""
