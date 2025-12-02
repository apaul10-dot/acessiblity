# Transfermarkt Stats - Accessible Web Interface

An accessible web interface for viewing football statistics with voice commands and text-to-speech support, designed for visually impaired users.

## Features

- 🎤 **Voice Commands**: Use natural language to search for player statistics (e.g., "Show me Ousmane Dembélé stats for PSG")
- 🔊 **Text-to-Speech**: Automatically reads statistics aloud for visually impaired users
- ♿ **Accessibility**: Full ARIA support, keyboard navigation, screen reader compatible
- 🎨 **Modern UI**: Beautiful purple-themed design that works on all MacBooks
- ⚡ **Fast**: Direct integration with Transfermarkt API

## Setup

### Prerequisites

- Python 3.9+
- A Groq API key (get one at https://console.groq.com/)

### Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set your Groq API key (optional, can be set in code):
```bash
export GROQ_API_KEY="your_groq_api_key_here"
```

Or edit `web_server.py` and update the `GROQ_API_KEY` variable.

### Running the Application

1. Start the backend proxy server:
```bash
python web_server.py
```

The server will start on `http://localhost:8001`

2. Open your browser and navigate to:
```
http://localhost:8001
```

## Usage

### Voice Commands

1. Click the "Start Voice Command" button (or press Enter/Space when focused)
2. Speak your command, for example:
   - "Show me Ousmane Dembélé stats for PSG"
   - "Find Kylian Mbappé statistics"
   - "Show Lionel Messi stats"

3. The system will:
   - Process your voice command using Groq API
   - Search for the player
   - Display statistics
   - Automatically read them aloud

### Manual Search

1. Enter a player name in the "Player Name" field
2. Optionally enter a club name to filter results
3. Click "Search Stats" or press Enter

### Text-to-Speech Controls

- **Read Aloud**: Reads the current statistics
- **Stop**: Stops the current reading

## Accessibility Features

- **ARIA Labels**: All interactive elements have proper ARIA labels
- **Keyboard Navigation**: Full keyboard support (Tab, Enter, Space)
- **Screen Reader Support**: Compatible with VoiceOver, NVDA, and JAWS
- **High Contrast**: Supports high contrast mode
- **Reduced Motion**: Respects prefers-reduced-motion settings
- **Focus Indicators**: Clear focus indicators for keyboard navigation

## Browser Compatibility

- Chrome/Edge (recommended for best voice recognition)
- Safari (voice recognition support)
- Firefox (voice recognition support)

Note: Voice recognition requires a browser that supports the Web Speech API.

## API Endpoints

The web interface uses the following Transfermarkt API endpoints:
- `/players/search/{player_name}` - Search for players
- `/players/{player_id}/stats` - Get player statistics
- `/players/{player_id}/profile` - Get player profile

## Troubleshooting

### Voice recognition not working
- Ensure you're using a supported browser (Chrome recommended)
- Check microphone permissions in your browser
- Try using HTTPS (some browsers require HTTPS for microphone access)

### API errors
- Check that the Transfermarkt API is accessible: https://transfermarkt-api.fly.dev/docs
- Verify your Groq API key is correct
- Check browser console for detailed error messages

### CORS errors
- The backend proxy server handles CORS automatically
- Ensure the proxy server is running on port 8001

## Project Structure

```
web/
  ├── index.html    # Main HTML file
  ├── styles.css    # Styling (purple theme, accessible)
  └── app.js        # JavaScript for voice commands and API calls

web_server.py       # Backend proxy server for Groq API
```

## License

This project is part of a school project and uses the Transfermarkt API.


