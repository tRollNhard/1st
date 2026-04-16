@echo off
echo === Spotify MCP Setup ===
echo.

if not exist .env (
    copy .env.example .env
    echo Created .env file.
    echo.
    echo NEXT STEPS:
    echo 1. Go to https://developer.spotify.com/dashboard
    echo 2. Create an app (set redirect URI to http://localhost:8901/callback)
    echo 3. Copy Client ID and Client Secret into spotify-mcp\.env
    echo 4. Run this script again
    echo.
    pause
    exit /b
)

echo Checking for Spotify credentials...
findstr /C:"your_client_id_here" .env >nul 2>&1
if %errorlevel%==0 (
    echo ERROR: You still have placeholder values in .env
    echo Edit spotify-mcp\.env with your real Spotify app credentials.
    pause
    exit /b
)

echo Starting Spotify login...
node auth.js
echo.
echo Done! The Spotify MCP server is now registered.
echo Restart Claude Code to connect.
pause
