"""
Backend proxy server for handling Groq API calls, CORS, and user authentication
"""
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import httpx
import os
import socket
import json
import hashlib
from datetime import datetime
from typing import Optional, List

app = FastAPI(title="Transfermarkt Web Interface")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Groq API configuration
raw_key = os.getenv("GROQ_API_KEY", "gsk_fygRt64IQ240T8cP8suIWGdyb3FYZv1H9TgVy2Baga28ghttps://transfermarkt-api.fly.dev/docs")
if "https://" in raw_key:
    GROQ_API_KEY = raw_key.split("https://")[0].rstrip()
else:
    GROQ_API_KEY = raw_key
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# Mount static files (CSS, JS)
if os.path.exists("web"):
    app.mount("/static", StaticFiles(directory="web"), name="static")

# Simple file-based user storage (in production, use a database)
USERS_FILE = "users.json"
FAVORITES_FILE = "favorites.json"

def load_users():
    """Load users from file"""
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_users(users):
    """Save users to file"""
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)

def load_favorites():
    """Load favorites from file"""
    if os.path.exists(FAVORITES_FILE):
        with open(FAVORITES_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_favorites(favorites):
    """Save favorites to file"""
    with open(FAVORITES_FILE, 'w') as f:
        json.dump(favorites, f, indent=2)

# Initialize files
if not os.path.exists(USERS_FILE):
    save_users({})
if not os.path.exists(FAVORITES_FILE):
    save_favorites({})

security = HTTPBearer()

class UserRegister(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class CommandRequest(BaseModel):
    command: str

class FavoriteRequest(BaseModel):
    player_id: str
    player_name: str

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user from token"""
    token = credentials.credentials
    users = load_users()
    for username, user_data in users.items():
        if user_data.get('token') == token:
            return username
    raise HTTPException(status_code=401, detail="Invalid token")

def hash_password(password: str) -> str:
    """Simple password hashing (use bcrypt in production)"""
    return hashlib.sha256(password.encode()).hexdigest()

def generate_token(username: str) -> str:
    """Generate a simple token (use JWT in production)"""
    return hashlib.sha256(f"{username}{datetime.now().isoformat()}".encode()).hexdigest()

# Transfermarkt API base URL
DEFAULT_API_URL = os.getenv("TRANSFERMARKT_API_URL", "http://localhost:8000")

def check_local_api():
    """Check if local API is running on port 8000"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.5)
        result = sock.connect_ex(('localhost', 8000))
        sock.close()
        return result == 0
    except:
        return False

def get_transfermarkt_api_url():
    """Get the Transfermarkt API URL, preferring local if available"""
    if DEFAULT_API_URL.startswith("http://localhost") or DEFAULT_API_URL.startswith("localhost"):
        if check_local_api():
            return "http://localhost:8000"
        else:
            return "https://transfermarkt-api.fly.dev"
    return DEFAULT_API_URL

# Authentication endpoints
@app.post("/api/auth/register")
async def register(user_data: UserRegister):
    """Register a new user"""
    users = load_users()
    if user_data.username in users:
        raise HTTPException(status_code=400, detail="Username already exists")
    if any(u.get('email') == user_data.email for u in users.values()):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    users[user_data.username] = {
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "token": generate_token(user_data.username),
        "created_at": datetime.now().isoformat()
    }
    save_users(users)
    return {"token": users[user_data.username]["token"], "username": user_data.username}

@app.post("/api/auth/login")
async def login(credentials: UserLogin):
    """Login user"""
    users = load_users()
    if credentials.username not in users:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    user = users[credentials.username]
    if user["password_hash"] != hash_password(credentials.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Generate new token
    user["token"] = generate_token(credentials.username)
    save_users(users)
    return {"token": user["token"], "username": credentials.username}

@app.get("/api/auth/me")
async def get_current_user_info(current_user: str = Depends(get_current_user)):
    """Get current user info"""
    users = load_users()
    user = users.get(current_user, {})
    return {"username": current_user, "email": user.get("email")}

# Favorites endpoints
@app.post("/api/favorites")
async def add_favorite(favorite: FavoriteRequest, current_user: str = Depends(get_current_user)):
    """Add a player to favorites"""
    favorites = load_favorites()
    if current_user not in favorites:
        favorites[current_user] = []
    
    # Check if already favorited
    if any(f.get('player_id') == favorite.player_id for f in favorites[current_user]):
        raise HTTPException(status_code=400, detail="Player already in favorites")
    
    favorites[current_user].append({
        "player_id": favorite.player_id,
        "player_name": favorite.player_name,
        "added_at": datetime.now().isoformat()
    })
    save_favorites(favorites)
    return {"message": "Player added to favorites"}

@app.get("/api/favorites")
async def get_favorites(current_user: str = Depends(get_current_user)):
    """Get user's favorite players"""
    favorites = load_favorites()
    return {"favorites": favorites.get(current_user, [])}

@app.delete("/api/favorites/{player_id}")
async def remove_favorite(player_id: str, current_user: str = Depends(get_current_user)):
    """Remove a player from favorites"""
    favorites = load_favorites()
    if current_user not in favorites:
        raise HTTPException(status_code=404, detail="Favorite not found")
    
    favorites[current_user] = [f for f in favorites[current_user] if f.get('player_id') != player_id]
    save_favorites(favorites)
    return {"message": "Player removed from favorites"}

# Groq API for voice commands
def extract_player_and_club(command: str) -> dict:
    """Extract player name and club from voice command using Groq API"""
    prompt = f"""Extract information from this football statistics request: "{command}"

Return a JSON object with:
- "action": one of "search_player", "compare_players", "club_achievements", "show_favorites" (required)
- "playerName": player name if mentioned (optional)
- "playerName2": second player name for comparison (optional)
- "clubName": club name if mentioned (optional)

Examples:
- "show me ousmane dembele stats for psg" -> {{"action": "search_player", "playerName": "Ousmane Dembélé", "clubName": "PSG"}}
- "compare messi and ronaldo" -> {{"action": "compare_players", "playerName": "Lionel Messi", "playerName2": "Cristiano Ronaldo"}}
- "show psg achievements" -> {{"action": "club_achievements", "clubName": "PSG"}}
- "show my favorites" -> {{"action": "show_favorites"}}

Only return valid JSON, no other text."""

    import json as json_module
    
    try:
        response = httpx.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a helpful assistant that extracts information from football statistics requests. Always return valid JSON only."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": 0.3,
                "max_tokens": 200,
            },
            timeout=10.0,
        )

        if response.status_code != 200:
            # Fall back to simple extraction instead of erroring
            print(f"Groq API returned status {response.status_code}, using fallback parser")
            return simple_extract(command)

        result = response.json()
        content = result["choices"][0]["message"]["content"].strip()

        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()

        parsed = json_module.loads(content)
        return parsed

    except (json_module.JSONDecodeError, ValueError) as json_error:
        print(f"JSON decode error, using fallback: {json_error}")
        return simple_extract(command)
    except Exception as e:
        print(f"Error calling Groq API: {e}, using fallback parser")
        return simple_extract(command)

def simple_extract(command: str) -> dict:
    """Simple fallback extraction without AI - handles common voice commands"""
    command_lower = command.lower().strip()
    
    # Check for comparison
    if "compare" in command_lower or " vs " in command_lower or " versus " in command_lower:
        cleaned = command_lower.replace("compare", "").replace("versus", " ").replace(" vs ", " ")
        parts = cleaned.split(" and ")
        if len(parts) >= 2:
            player1 = parts[0].strip().replace("stats", "").replace("statistics", "").strip()
            player2 = parts[1].strip().replace("stats", "").replace("statistics", "").strip()
            return {
                "action": "compare_players",
                "playerName": player1.title(),
                "playerName2": player2.title()
            }
    
    # Check for favorites
    if "favorite" in command_lower or "favourite" in command_lower:
        return {"action": "show_favorites"}
    
    # Check for club info (look for common club indicators)
    club_indicators = ["club", "fc", "united", "city", "arsenal", "chelsea", "liverpool", 
                       "manchester", "barcelona", "real madrid", "psg", "bayern", "juventus"]
    if any(indicator in command_lower for indicator in club_indicators):
        # Extract club name
        club_name = command_lower
        for prefix in ["show", "display", "get", "find", "club", "info", "information", "achievements"]:
            if club_name.startswith(prefix):
                club_name = club_name[len(prefix):].strip()
        club_name = club_name.replace("stats", "").replace("statistics", "").strip()
        if club_name:
            return {"action": "club_achievements", "clubName": club_name.title()}
    
    # Player search - look for "stats" keyword
    if "stats" in command_lower or "statistics" in command_lower or "stat" in command_lower:
        player_part = command_lower
        club_part = None
        
        # Check for "for [club]"
        if " for " in player_part:
            parts = player_part.split(" for ", 1)
            player_part = parts[0]
            club_part = parts[1].strip()
        
        # Remove common prefixes
        for prefix in ["show me", "show", "find", "get", "search for", "stats for", "statistics for", "display"]:
            if player_part.startswith(prefix):
                player_part = player_part[len(prefix):].strip()
        
        # Remove "stats" suffix
        for suffix in [" stats", " statistics", " stat"]:
            if player_part.endswith(suffix):
                player_part = player_part[:-len(suffix)].strip()
        
        if player_part:
            return {
                "action": "search_player",
                "playerName": player_part.title(),
                "clubName": club_part.upper() if club_part else None
            }
    
    # Default: treat as player name
    cleaned = command_lower
    for prefix in ["show me", "show", "find", "get", "search for", "display"]:
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):].strip()
    
    if cleaned:
        return {
            "action": "search_player",
            "playerName": cleaned.title()
        }
    
    # Ultimate fallback
    return {"action": "search_player", "playerName": command}

@app.post("/api/parse-command")
async def parse_command(request: CommandRequest):
    """Parse voice command and extract information"""
    try:
        result = extract_player_and_club(request.command)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Transfermarkt API proxy endpoints
@app.get("/api/test")
async def test_route():
    """Test route to verify routing works"""
    return {"message": "API routes are working"}

@app.get("/api/players/search/{player_name}")
async def proxy_player_search(player_name: str, page_number: int = 1):
    """Proxy endpoint for player search"""
    try:
        api_url = get_transfermarkt_api_url()
        url = f"{api_url}/players/search/{player_name}"
        params = {"page_number": page_number} if page_number > 1 else {}
        
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/113.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, headers=headers, timeout=30.0)
            
            if response.status_code == 403:
                error_msg = (
                    "The Transfermarkt API is currently blocking requests (403 Forbidden). "
                    "This may be due to rate limiting or anti-bot protection. "
                    "Try again in a few minutes, or run the Transfermarkt API locally."
                )
                raise HTTPException(status_code=403, detail=error_msg)
            
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 403:
            error_msg = (
                "The Transfermarkt API is currently blocking requests. "
                "This may be due to rate limiting. Please try again later or run the API locally."
            )
            raise HTTPException(status_code=403, detail=error_msg)
        error_detail = e.response.text if hasattr(e.response, 'text') else str(e)
        raise HTTPException(status_code=e.response.status_code, detail=error_detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/players/{player_id}/stats")
async def proxy_player_stats(player_id: str):
    """Proxy endpoint for player stats"""
    try:
        api_url = get_transfermarkt_api_url()
        url = f"{api_url}/players/{player_id}/stats"
        
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/113.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=30.0)
            
            if response.status_code == 403:
                error_msg = "The Transfermarkt API is currently blocking requests. Please try again later or run the API locally."
                raise HTTPException(status_code=403, detail=error_msg)
            
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 403:
            error_msg = "The Transfermarkt API is currently blocking requests. Please try again later."
            raise HTTPException(status_code=403, detail=error_msg)
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/players/{player_id}/profile")
async def proxy_player_profile(player_id: str):
    """Proxy endpoint for player profile"""
    try:
        api_url = get_transfermarkt_api_url()
        url = f"{api_url}/players/{player_id}/profile"
        
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/113.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=30.0)
            
            if response.status_code == 403:
                error_msg = "The Transfermarkt API is currently blocking requests. Please try again later."
                raise HTTPException(status_code=403, detail=error_msg)
            
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 403:
            error_msg = "The Transfermarkt API is currently blocking requests. Please try again later."
            raise HTTPException(status_code=403, detail=error_msg)
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/players/{player_id}/achievements")
async def proxy_player_achievements(player_id: str):
    """Proxy endpoint for player achievements"""
    try:
        api_url = get_transfermarkt_api_url()
        url = f"{api_url}/players/{player_id}/achievements"
        
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/113.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/clubs/search/{club_name}")
async def proxy_club_search(club_name: str, page_number: int = 1):
    """Proxy endpoint for club search"""
    try:
        api_url = get_transfermarkt_api_url()
        url = f"{api_url}/clubs/search/{club_name}"
        params = {"page_number": page_number} if page_number > 1 else {}
        
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/113.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/clubs/{club_id}/profile")
async def proxy_club_profile(club_id: str):
    """Proxy endpoint for club profile"""
    try:
        api_url = get_transfermarkt_api_url()
        url = f"{api_url}/clubs/{club_id}/profile"
        
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/113.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/clubs/{club_id}/players")
async def proxy_club_players(club_id: str, season_id: Optional[str] = None):
    """Proxy endpoint for club players"""
    try:
        api_url = get_transfermarkt_api_url()
        url = f"{api_url}/clubs/{club_id}/players"
        params = {"season_id": season_id} if season_id else {}
        
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/113.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/players/{player_id}/transfers")
async def proxy_player_transfers(player_id: str):
    """Proxy endpoint for player transfers"""
    try:
        api_url = get_transfermarkt_api_url()
        url = f"{api_url}/players/{player_id}/transfers"
        
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/113.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/players/{player_id}/injuries")
async def proxy_player_injuries(player_id: str, page_number: int = 1):
    """Proxy endpoint for player injuries"""
    try:
        api_url = get_transfermarkt_api_url()
        url = f"{api_url}/players/{player_id}/injuries"
        params = {"page_number": page_number} if page_number > 1 else {}
        
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/113.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/players/{player_id}/market_value")
async def proxy_player_market_value(player_id: str):
    """Proxy endpoint for player market value"""
    try:
        api_url = get_transfermarkt_api_url()
        url = f"{api_url}/players/{player_id}/market_value"
        
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/113.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/players/{player_id}/jersey_numbers")
async def proxy_player_jersey_numbers(player_id: str):
    """Proxy endpoint for player jersey numbers"""
    try:
        api_url = get_transfermarkt_api_url()
        url = f"{api_url}/players/{player_id}/jersey_numbers"
        
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/113.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/competitions/search/{competition_name}")
async def proxy_competition_search(competition_name: str, page_number: int = 1):
    """Proxy endpoint for competition search"""
    try:
        api_url = get_transfermarkt_api_url()
        url = f"{api_url}/competitions/search/{competition_name}"
        params = {"page_number": page_number} if page_number > 1 else {}
        
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/113.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    """Serve the main HTML page"""
    from fastapi.responses import FileResponse
    html_path = os.path.join("web", "index.html")
    if os.path.exists(html_path):
        return FileResponse(html_path)
    else:
        from fastapi.responses import HTMLResponse
        return HTMLResponse(content="<h1>Web interface not found. Please ensure web/index.html exists.</h1>")

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
