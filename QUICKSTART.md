# Quick Start Guide

## 🚀 Getting Started in 3 Steps

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Set Your Groq API Key (Optional)
The API key is already set in `web_server.py`, but you can override it:
```bash
export GROQ_API_KEY="your_actual_groq_api_key"
```

**Note**: If your API key has a URL appended (like the one provided), the code will automatically clean it.

### 3. Start the Server
```bash
# Option 1: Use the startup script
./start_web.sh

# Option 2: Run directly
python web_server.py
```

### 4. Open in Browser
Navigate to: **http://localhost:8001**

## 🎤 Using Voice Commands

1. Click "Start Voice Command" button
2. Say: **"Show me Ousmane Dembélé stats for PSG"**
3. Wait for results - they'll be read aloud automatically!

## ⌨️ Using Manual Search

1. Enter player name (e.g., "Kylian Mbappé")
2. Optionally enter club name (e.g., "PSG")
3. Click "Search Stats"

## 🔊 Text-to-Speech

- Click "Read Aloud" to hear the statistics
- Click "Stop" to stop reading

## 🎨 Features

✅ Voice commands with natural language processing  
✅ Automatic text-to-speech for accessibility  
✅ Full keyboard navigation support  
✅ Screen reader compatible (ARIA labels)  
✅ Beautiful purple-themed modern UI  
✅ Works on all MacBooks  

## 🐛 Troubleshooting

**Voice not working?**
- Use Chrome browser (best support)
- Allow microphone permissions
- Check browser console for errors

**API errors?**
- Verify Transfermarkt API is accessible: https://transfermarkt-api.fly.dev/docs
- Check your Groq API key is correct
- Look at server logs for details

**Port already in use?**
- Change port in `web_server.py` (line 201): `port=8001` → `port=8002`

## 📝 Example Commands

- "Show me Ousmane Dembélé stats for PSG"
- "Find Kylian Mbappé statistics"
- "Show Lionel Messi stats"
- "Get Cristiano Ronaldo stats for Al Nassr"

Enjoy! ⚽

