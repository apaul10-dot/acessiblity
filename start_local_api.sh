#!/bin/bash

# Script to start the local Transfermarkt API

echo "Starting Transfermarkt API locally..."
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Set PYTHONPATH if not already set
export PYTHONPATH=$PYTHONPATH:$(pwd)

# Check if dependencies are installed
echo "Checking dependencies..."
python3 -c "import fastapi, uvicorn" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Installing required packages..."
    pip3 install -r requirements.txt
fi

echo ""
echo "Starting Transfermarkt API on http://localhost:8000"
echo "API documentation will be available at http://localhost:8000/docs"
echo "Press Ctrl+C to stop"
echo ""

# Start the API server
cd "$(dirname "$0")"
python3 app/main.py


