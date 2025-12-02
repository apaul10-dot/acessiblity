#!/bin/bash

# Startup script for the Transfermarkt Web Interface

echo "Starting Transfermarkt Web Interface..."
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Check if required packages are installed
echo "Checking dependencies..."
python3 -c "import fastapi, httpx" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Installing required packages..."
    pip3 install -r requirements.txt
fi

# Set Groq API key if provided as environment variable
if [ -z "$GROQ_API_KEY" ]; then
    echo "Note: GROQ_API_KEY not set. Using default from web_server.py"
    echo "To set it: export GROQ_API_KEY='your_key_here'"
fi

echo ""
echo "Starting server on http://localhost:8001"
echo "Press Ctrl+C to stop"
echo ""

# Start the server
python3 web_server.py

