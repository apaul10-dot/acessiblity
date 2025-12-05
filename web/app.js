// Configuration
const PROXY_URL = 'http://localhost:8001';

// State management
let isRecording = false;
let recognition = null;
let currentSpeech = null;
let searchResults = null;
let currentPage = 'home';
let autoListening = false;
let ttsMuted = false;
let lastPlayerResult = null;
let lastClubResult = null;
let userInteracted = false; // Track user interaction for speech synthesis
let isReadingAloud = false; // Prevent duplicate reads
let isRecognitionStarting = false; // Prevent concurrent start attempts
let isRecognitionStopping = false; // Track if we're stopping
let restartTimeout = null; // Track restart timeout

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    showLoading(false);
    initRouting();
    initSpeechRecognition();
    setupEventListeners();
    initializeVoiceAutoStart();
    // Start voice recognition immediately - no button needed for accessibility
    startVoiceRecognitionImmediately();
});

// Start voice recognition immediately for accessibility (no button press needed)
async function startVoiceRecognitionImmediately() {
    // Wait for recognition to be initialized
    setTimeout(async () => {
        if (!recognition) {
            console.warn('Recognition not ready yet, retrying...');
            setTimeout(() => startVoiceRecognitionImmediately(), 500);
            return;
        }
        
        // Try to start immediately
        console.log('🎤 Starting voice recognition automatically for accessibility...');
        updateStatus('🎤 Voice recognition starting automatically. No button press needed. Speak your commands when ready.', 'info');
        // Announce to screen readers
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.setAttribute('aria-live', 'polite');
            statusEl.setAttribute('aria-atomic', 'true');
        }
        
        // Try multiple approaches to get user interaction
        // 1. Try immediate start (may work if permission already granted)
        try {
            if (!isRecording && !isRecognitionStarting) {
                autoListening = true;
                const hasPermission = await requestMicrophonePermission();
                if (hasPermission) {
                    setTimeout(() => {
                        if (safeStartRecognition()) {
                            updateStatus('🎤 Listening for voice commands. Speak your command now.', 'success');
                            // Announce to screen readers
                            const statusEl = document.getElementById('status');
                            if (statusEl) {
                                statusEl.textContent = 'Voice recognition is active and listening. You can speak your commands now.';
                            }
                            // Also use TTS to announce (but only if user has interacted)
                            if (userInteracted) {
                                speak('Voice recognition is now active. You can speak your commands.', false);
                            }
                            return;
                        }
                    }, 300);
                }
            }
        } catch (error) {
            console.warn('Immediate start failed, will try on interaction:', error);
        }
        
        // 2. Set up listeners for ANY interaction (keyboard, mouse, touch, focus)
        const startOnInteraction = () => {
            if (!isRecording && !isRecognitionStarting) {
                userInteracted = true;
                console.log('✓ User interaction detected - starting voice recognition');
                autoStartVoiceRecognition();
            }
        };
        
        // Listen for any possible interaction
        ['click', 'keydown', 'keypress', 'touchstart', 'mousedown', 'focus', 'pointerdown'].forEach(event => {
            document.addEventListener(event, startOnInteraction, { once: true, passive: true });
        });
        
        // Also try on window focus (when user switches to tab)
        window.addEventListener('focus', startOnInteraction, { once: true });
        
        // Try on page visibility change
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !isRecording && !isRecognitionStarting) {
                setTimeout(startOnInteraction, 100);
            }
        }, { once: true });
    }, 1000); // Give page time to fully load
}

function trackUserInteraction() {
    // Track user interactions to enable speech synthesis (required by browsers)
    const markInteracted = () => {
        userInteracted = true;
        console.log('✓ User interaction detected');
    };
    
    ['click', 'keydown', 'touchstart'].forEach(event => {
        document.addEventListener(event, markInteracted, { once: true });
    });
}

// Auto-start voice recognition after user interaction
async function autoStartVoiceRecognition() {
    if (!recognition) {
        console.warn('Recognition not initialized yet');
        return;
    }
    
    // Don't start if already recording, starting, or stopping
    if (isRecording || isRecognitionStarting || isRecognitionStopping) {
        console.log('Recognition already active, skipping auto-start');
        return;
    }
    
    console.log('Auto-starting voice recognition...');
    updateStatus('Requesting microphone access...', 'info');
    
    // Request microphone permission
    const hasPermission = await requestMicrophonePermission();
    if (hasPermission) {
        // Small delay to ensure everything is ready
        setTimeout(() => {
            // Double-check state before starting
            if (!isRecording && !isRecognitionStarting && !isRecognitionStopping && recognition) {
                autoListening = true;
                if (safeStartRecognition()) {
                    updateStatus('🎤 Listening for voice commands. Speak your command now.', 'success');
                    // Update status for screen readers
                    const statusEl = document.getElementById('status');
                    if (statusEl) {
                        statusEl.textContent = 'Voice recognition is active and listening. You can speak your commands now.';
                    }
                    console.log('✓ Auto-start successful - recognition is now active');
                } else {
                    console.warn('Auto-start failed - safeStartRecognition returned false');
                    updateStatus('Voice recognition will start automatically. If it does not, use the microphone button.', 'info');
                    autoListening = false;
                }
            } else {
                console.log('State changed during auto-start delay, skipping');
            }
        }, 300);
    } else {
        updateStatus('Microphone permission required. Please allow access and refresh.', 'error');
    }
}

async function initializeVoiceAutoStart() {
    // Voice recognition starts automatically - no button needed
    // Status will be updated by startVoiceRecognitionImmediately()
}

// ==================== ROUTING ====================
function initRouting() {
    // Navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const page = e.target.dataset.page;
            if (page) navigateTo(page);
        });
    });
    
    // Forms
    const compareForm = document.getElementById('compareForm');
    const clubAchievementsForm = document.getElementById('clubAchievementsForm');
    
    if (compareForm) {
        compareForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const player1 = document.getElementById('player1Name').value;
            const player2 = document.getElementById('player2Name').value;
            await comparePlayers(player1, player2);
        });
    }
    
    if (clubAchievementsForm) {
        clubAchievementsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const clubName = document.getElementById('clubAchievementsName').value;
            await showClubAchievements(clubName);
        });
    }
    
    // Load favorites on favorites page
    document.querySelector('[data-page="favorites"]')?.addEventListener('click', () => {
        loadFavorites();
    });
}

function navigateTo(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    // Show selected page
    const pageElement = document.getElementById(`${page}-page`);
    if (pageElement) {
        pageElement.classList.add('active');
        currentPage = page;
    }
    
    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.page === page) {
            link.classList.add('active');
        }
    });
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById(`${tab}Form`)?.classList.add('active');
}

// ==================== SPEECH RECOGNITION ====================
async function requestMicrophonePermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately
        return true;
    } catch (error) {
        console.error('Microphone permission error:', error);
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            updateStatus('Microphone permission denied. Please allow microphone access in your browser settings and refresh the page.', 'error');
            speak('Microphone permission is required for voice commands. Please allow access in your browser settings.', false);
        } else if (error.name === 'NotFoundError') {
            updateStatus('No microphone found. Please connect a microphone and try again.', 'error');
        } else {
            updateStatus(`Microphone error: ${error.message}`, 'error');
        }
        return false;
    }
}

// Safe function to start recognition with proper state checking
function safeStartRecognition() {
    if (!recognition) {
        console.warn('Recognition not initialized');
        return false;
    }
    
    // Don't start if already recording, starting, or stopping
    if (isRecording || isRecognitionStarting || isRecognitionStopping) {
        console.warn('Recognition already active or in transition');
        return false;
    }
    
    try {
        isRecognitionStarting = true;
        recognition.start();
        return true;
    } catch (error) {
        isRecognitionStarting = false;
        // If already started, that's okay - update state
        if (error.name === 'InvalidStateError' || error.message?.includes('already started')) {
            isRecording = true;
            updateVoiceButton(true);
            return true;
        }
        console.warn('Error starting recognition:', error);
        return false;
    }
}

function initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            isRecording = true;
            isRecognitionStarting = false;
            isRecognitionStopping = false;
            updateVoiceButton(true);
            updateStatus('🎤 Listening for voice commands...', 'success');
            // Announce to screen readers that recognition is active
            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.setAttribute('aria-live', 'polite');
                statusEl.textContent = 'Voice recognition is active and listening for commands';
            }
        };

        recognition.onresult = async (event) => {
            // Mark user interaction when voice command received
            userInteracted = true;
            
            // Get the most recent result (last in array) to avoid processing old commands
            const resultIndex = event.results.length - 1;
            const result = event.results[resultIndex];
            const isFinal = result.isFinal;
            
            // Only process final results
            if (!isFinal) return;
            
            const transcript = result[0].transcript.trim();
            if (!transcript) return;
            
            // Stop any ongoing reading immediately
            if (isReadingAloud) {
                stopReading();
            }
            
            updateStatus(`Heard: "${transcript}"`, 'success');
            
            // Check for stop command FIRST before processing
            const cmdLower = transcript.toLowerCase();
            if (cmdLower === 'stop' || cmdLower.includes('stop talking') || cmdLower.includes('stop reading') || 
                cmdLower.includes('be quiet') || cmdLower.includes('shut up')) {
                stopReading();
                updateStatus('Reading stopped. Say "resume" to continue.', 'success');
                return;
            }
            
            await processVoiceCommand(transcript);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            isRecording = false;
            isRecognitionStarting = false;
            updateVoiceButton(false);
            
            // Handle aborted error - this happens when trying to start while already running
            if (event.error === 'aborted') {
                // Silently handle - recognition was aborted, likely because we tried to start while already running
                // Reset state and don't restart immediately
                isRecording = false;
                isRecognitionStarting = false;
                return;
            }
            
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                updateStatus('Microphone access denied. Please allow microphone access in your browser settings and refresh the page.', 'error');
                speak('Microphone permission is required. Please allow access in your browser settings and refresh the page.', false);
                autoListening = false;
                isRecognitionStarting = false;
            } else if (event.error === 'no-speech') {
                // Don't show error for no-speech, just silently restart if auto-listening
                // Only restart if we're not already trying to start and not reading aloud
                if (autoListening && !isReadingAloud && !isRecognitionStarting && !isRecognitionStopping) {
                    if (restartTimeout) clearTimeout(restartTimeout);
                    restartTimeout = setTimeout(() => {
                        if (autoListening && !isReadingAloud && !isRecording && !isRecognitionStarting && !isRecognitionStopping) {
                            safeStartRecognition();
                        }
                    }, 2000); // Longer delay to avoid rapid restarts
                }
            } else if (event.error === 'audio-capture') {
                updateStatus('No microphone found. Please connect a microphone and try again.', 'error');
                autoListening = false;
                isRecognitionStarting = false;
            } else {
                // For other errors, only show if not auto-listening
                if (!autoListening) {
                    updateStatus(`Error: ${event.error}. Please try again.`, 'error');
                }
                isRecognitionStarting = false;
            }
        };

        recognition.onend = () => {
            isRecording = false;
            isRecognitionStarting = false;
            isRecognitionStopping = false;
            updateVoiceButton(false);
            
            // Auto-restart listening if enabled (but not if reading aloud or already starting)
            if (autoListening && recognition && !isReadingAloud && !isRecognitionStarting && !isRecognitionStopping) {
                if (restartTimeout) clearTimeout(restartTimeout);
                restartTimeout = setTimeout(() => {
                    // Double-check state before restarting
                    if (autoListening && !isReadingAloud && !isRecording && !isRecognitionStarting && !isRecognitionStopping && recognition) {
                        safeStartRecognition();
                    }
                }, 2000); // Longer delay to avoid constant restarting
            }
        };
    } else {
        updateStatus('Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari.', 'error');
    }
}

function parseVoiceCommandLocal(command) {
    const commandLower = command.toLowerCase().trim();
    
    // Stop or resume talking - check this FIRST before other commands
    if (commandLower === 'stop' || 
        commandLower.startsWith('stop ') ||
        commandLower.includes('stop talking') || 
        commandLower.includes('stop reading') || 
        commandLower.includes('be quiet') ||
        commandLower.includes('shut up') ||
        commandLower.includes('quiet')) {
        return { action: 'stop_speaking' };
    }
    if (commandLower.includes('resume talking') || commandLower.includes('start talking') || commandLower.includes('start reading')) {
        return { action: 'resume_speaking' };
    }
    
    // Read specific sections
    if (commandLower.includes('tell me') || commandLower.includes('read') || commandLower.includes('show me')) {
        if (commandLower.includes('injuries') || commandLower.includes('injury')) {
            return { action: 'read_injuries' };
        }
        if (commandLower.includes('transfers') || commandLower.includes('transfer')) {
            return { action: 'read_transfers' };
        }
        if (commandLower.includes('achievements') || commandLower.includes('achievement') || commandLower.includes('honors') || commandLower.includes('honours')) {
            return { action: 'read_achievements' };
        }
        if (commandLower.includes('market value') || commandLower.includes('market value history')) {
            return { action: 'read_market_value' };
        }
    }
    
    // Favorites navigation
    if ((commandLower.includes('show') || commandLower.includes('open') || commandLower.includes('go to')) &&
        (commandLower.includes('favorite') || commandLower.includes('favourite'))) {
        return { action: 'show_favorites' };
    }

    // Quick favorite commands like "favorite Barcelona"
    if (commandLower.startsWith('favorite ') && !commandLower.includes('show favorite')) {
        const isClub = commandLower.includes('club') || commandLower.includes('team');
        const name = extractNameFromCommand(commandLower, ['favorite', 'club', 'team', 'player', 'the']);
        if (isClub) {
            return { action: 'add_club_favorite', clubName: name || commandLower };
        }
        return { action: 'add_player_favorite', playerName: name || commandLower };
    }
    
    // Add favorites
    if (commandLower.includes('add') && (commandLower.includes('favorite') || commandLower.includes('favourite'))) {
        if (commandLower.includes('this club')) {
            return { action: 'add_current_club_favorite' };
        }
        if (commandLower.includes('this player')) {
            return { action: 'add_current_player_favorite' };
        }
        const isClub = commandLower.includes('club') || commandLower.includes('team');
        const name = extractNameFromCommand(commandLower, ['add', 'to favorites', 'favorites', 'favorite', 'favourite', 'club', 'team', 'player', 'the']);
        if (isClub) {
            return { action: 'add_club_favorite', clubName: name || commandLower };
        }
        return { action: 'add_player_favorite', playerName: name || commandLower };
    }
    
    // Remove favorites
    if (commandLower.includes('remove') && (commandLower.includes('favorite') || commandLower.includes('favourite'))) {
        const isClub = commandLower.includes('club') || commandLower.includes('team');
        if (commandLower.includes('this club')) {
            return { action: 'remove_club_favorite', clubName: 'this' };
        }
        if (commandLower.includes('this player')) {
            return { action: 'remove_player_favorite', playerName: 'this' };
        }
        const name = extractNameFromCommand(commandLower, ['remove', 'from favorites', 'favorites', 'favorite', 'favourite', 'club', 'team', 'player', 'the']);
        if (isClub) {
            return { action: 'remove_club_favorite', clubName: name || commandLower };
        }
        return { action: 'remove_player_favorite', playerName: name || commandLower };
    }
    
    // Compare players
    if (commandLower.includes('compare') || commandLower.includes(' vs ') || commandLower.includes(' versus ')) {
        const cleaned = commandLower.replace('compare', '').replace('versus', ' ').replace(' vs ', ' ');
        const parts = cleaned.split(' and ');
        if (parts.length >= 2) {
            const player1 = parts[0].trim().replace(/stats?/g, '').trim();
            const player2 = parts[1].trim().replace(/stats?/g, '').trim();
            return {
                action: 'compare_players',
                playerName: player1,
                playerName2: player2
            };
        }
    }
    
    // Club info
    const clubKeywords = ['club', 'fc', 'united', 'city', 'arsenal', 'chelsea', 'liverpool',
        'manchester', 'barcelona', 'real madrid', 'psg', 'bayern', 'juventus'];
    if (clubKeywords.some(keyword => commandLower.includes(keyword)) &&
        !commandLower.includes('stats') && !commandLower.includes('statistics')) {
        let clubName = commandLower;
        ['show', 'display', 'get', 'find', 'club', 'info', 'information', 'achievements', 'team'].forEach(prefix => {
            if (clubName.startsWith(prefix)) {
                clubName = clubName.slice(prefix.length).trim();
            }
        });
        clubName = clubName.replace(/stats?/g, '').trim();
        if (clubName) {
            return { action: 'club_achievements', clubName: clubName };
        }
    }
    
    // Player stats
    if (commandLower.includes('stats') || commandLower.includes('statistics') || commandLower.includes('stat')) {
        let playerPart = commandLower;
        let clubPart = null;
        
        if (playerPart.includes(' for ')) {
            const split = playerPart.split(' for ');
            playerPart = split[0];
            clubPart = split[1].trim();
        }
        
        ['show me', 'show', 'find', 'get', 'search for', 'stats for', 'statistics for', 'display'].forEach(prefix => {
            if (playerPart.startsWith(prefix)) {
                playerPart = playerPart.slice(prefix.length).trim();
            }
        });
        
        [' stats', ' statistics', ' stat'].forEach(suffix => {
            if (playerPart.endsWith(suffix)) {
                playerPart = playerPart.slice(0, -suffix.length).trim();
            }
        });
        
        if (playerPart) {
            return {
                action: 'search_player',
                playerName: playerPart,
                clubName: clubPart ? clubPart.toUpperCase() : null
            };
        }
    }
    
    // Default: treat as player name
    let cleaned = commandLower;
    ['show me', 'show', 'find', 'get', 'search for', 'display'].forEach(prefix => {
        if (cleaned.startsWith(prefix)) {
            cleaned = cleaned.slice(prefix.length).trim();
        }
    });
    
    if (cleaned) {
        return { action: 'search_player', playerName: cleaned };
    }
    
    return { action: 'search_player', playerName: command };
}

function extractNameFromCommand(commandLower, wordsToRemove = []) {
    let name = commandLower;
    wordsToRemove.forEach(word => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'g');
        name = name.replace(regex, ' ');
    });
    return name.replace(/\s+/g, ' ').trim();
}

async function processVoiceCommand(transcript) {
    showLoading(true);
    updateStatus('Processing your command...', 'success');
    
    // Stop any ongoing reading when processing new command
    if (isReadingAloud) {
        stopReading();
    }

    try {
        const localIntent = parseVoiceCommandLocal(transcript);
        let data;
    try {
        const response = await fetch(`${PROXY_URL}/api/parse-command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: transcript })
        });

            if (response.ok) {
                data = await response.json();
            } else {
                // Fallback to local parsing
                data = localIntent;
            }
        } catch (error) {
            // Fallback to local parsing if API fails
            console.warn('API parsing failed, using local parser:', error);
            data = localIntent;
        }

        const specialActions = new Set([
            'stop_speaking',
            'resume_speaking',
            'read_injuries',
            'read_transfers',
            'read_achievements',
            'read_market_value',
            'add_player_favorite',
            'add_club_favorite',
            'add_current_player_favorite',
            'add_current_club_favorite',
            'remove_player_favorite',
            'remove_club_favorite',
            'show_favorites'
        ]);

        if (specialActions.has(localIntent.action)) {
            data = localIntent;
        }

        const { action, playerName, playerName2, clubName } = data;
        const normalizedPlayerName = playerName?.trim();
        const normalizedClubName = clubName?.trim();

        switch (action) {
            case 'stop_speaking':
                ttsMuted = true;
                stopReading();
                updateStatus('Text-to-speech stopped. Say "resume talking" or perform a new search to hear results again.', 'success');
                // Don't speak here - user wants silence
                break;
            case 'resume_speaking':
                ttsMuted = false;
                updateStatus('Text-to-speech resumed.', 'success');
                if (searchResults) {
                    readResultsAloud();
                }
                break;
            case 'read_injuries':
                if (searchResults && searchResults.injuries) {
                    readInjuriesAloud(searchResults.injuries);
                } else {
                    updateStatus('No player injuries data available. Please search for a player first.', 'error');
                    speak('No injuries data available. Please search for a player first.', false);
                }
                break;
            case 'read_transfers':
                if (searchResults && searchResults.transfers) {
                    readTransfersAloud(searchResults.transfers);
                } else {
                    updateStatus('No player transfers data available. Please search for a player first.', 'error');
                    speak('No transfers data available. Please search for a player first.', false);
                }
                break;
            case 'read_achievements':
                if (searchResults && searchResults.achievements) {
                    readAchievementsAloud(searchResults.achievements);
                } else {
                    updateStatus('No player achievements data available. Please search for a player first.', 'error');
                    speak('No achievements data available. Please search for a player first.', false);
                }
                break;
            case 'read_market_value':
                if (searchResults && searchResults.marketValue) {
                    readMarketValueAloud(searchResults.marketValue);
                } else {
                    updateStatus('No market value data available. Please search for a player first.', 'error');
                    speak('No market value data available. Please search for a player first.', false);
                }
                break;
            case 'search_player':
                if (normalizedPlayerName) {
                    await searchPlayerStats(normalizedPlayerName, normalizedClubName);
                }
                break;
            case 'compare_players':
                if (playerName && playerName2) {
                    navigateTo('compare');
                    await comparePlayers(playerName, playerName2);
                }
                break;
            case 'club_achievements':
            case 'club_info':
                if (normalizedClubName) {
                    navigateTo('club-achievements');
                    await showClubAchievements(normalizedClubName);
                }
                break;
            case 'show_favorites':
                navigateTo('favorites');
                loadFavorites();
                break;
            case 'add_player_favorite':
                if (normalizedPlayerName === 'this') {
                    await addCurrentPlayerFavorite();
                } else if (normalizedPlayerName) {
                    await addPlayerFavoriteByName(normalizedPlayerName);
                }
                break;
            case 'add_club_favorite':
                if (normalizedClubName === 'this') {
                    await addCurrentClubFavorite();
                } else if (normalizedClubName) {
                    await addClubFavoriteByName(normalizedClubName);
                }
                break;
            case 'add_current_player_favorite':
                await addCurrentPlayerFavorite();
                break;
            case 'add_current_club_favorite':
                await addCurrentClubFavorite();
                break;
            case 'remove_player_favorite':
                if (normalizedPlayerName === 'this') {
                    if (lastPlayerResult) {
                        removeFavorite(lastPlayerResult.id, 'player');
                    } else {
                        updateStatus('No recent player to remove from favorites.', 'error');
                    }
                } else if (normalizedPlayerName) {
                    removePlayerFavoriteByName(normalizedPlayerName);
                }
                break;
            case 'remove_club_favorite':
                if (normalizedClubName === 'this') {
                    if (lastClubResult?.club) {
                        removeFavorite(lastClubResult.club.id, 'club');
                    } else {
                        updateStatus('No recent club to remove from favorites.', 'error');
                    }
                } else if (normalizedClubName) {
                    removeClubFavoriteByName(normalizedClubName);
                }
                break;
            default:
                if (normalizedPlayerName) {
                    await searchPlayerStats(normalizedPlayerName, normalizedClubName);
                } else {
                    updateStatus('Sorry, I could not understand that command.', 'error');
                    speak('Sorry, I could not understand that command. Please try again.', false);
                }
        }
    } catch (error) {
        console.error('Error processing voice command:', error);
        updateStatus('Error processing command. Please try again.', 'error');
        speak('Sorry, I encountered an error processing your command.', false);
    } finally {
        showLoading(false);
    }
}

// ==================== PLAYER SEARCH & STATS ====================
async function searchPlayerStats(playerName, clubName = null) {
    // Mark user interaction when search is initiated
    userInteracted = true;
    showLoading(true);
    ttsMuted = false; // Unmute TTS for new search
    updateStatus(`Searching for ${playerName}...`, 'success');

    try {
        const searchResponse = await fetch(`${PROXY_URL}/api/players/search/${encodeURIComponent(playerName)}`);
        
        if (!searchResponse.ok) {
            const errorData = await searchResponse.json().catch(() => ({}));
            const errorMsg = errorData.detail || `API returned status ${searchResponse.status}`;
            
            if (searchResponse.status === 403) {
                throw new Error('The Transfermarkt API is currently blocking requests. Please try again in a few minutes.');
            }
            
            throw new Error(errorMsg);
        }

        const searchData = await searchResponse.json();
        
        if (searchData.detail) {
            throw new Error(searchData.detail);
        }
        
        if (!searchData.results || searchData.results.length === 0) {
            updateStatus(`No players found for "${playerName}"`, 'error');
            displayError(`No players found matching "${playerName}"`);
            TTSManager.readError(`No players found matching ${playerName}`);
            return;
        }

        let selectedPlayer = searchData.results[0];
        
        if (clubName) {
            const clubMatch = searchData.results.find(player => 
                (player.club && player.club.name && 
                 player.club.name.toLowerCase().includes(clubName.toLowerCase())) ||
                (player.currentClub && 
                 player.currentClub.toLowerCase().includes(clubName.toLowerCase()))
            );
            if (clubMatch) {
                selectedPlayer = clubMatch;
            }
        }

        // Get player stats
        const statsResponse = await fetch(`${PROXY_URL}/api/players/${selectedPlayer.id}/stats`);
        
        let statsData = null;
        if (statsResponse.ok) {
            statsData = await statsResponse.json();
            if (statsData.detail) {
                console.warn('Stats API error:', statsData.detail);
            }
        }
        
        // Get player profile
        let profileData = null;
        try {
            const profileResponse = await fetch(`${PROXY_URL}/api/players/${selectedPlayer.id}/profile`);
            if (profileResponse.ok) {
                profileData = await profileResponse.json();
                if (profileData.detail) {
                    profileData = null;
                }
            }
        } catch (e) {
            console.warn('Could not fetch profile data:', e);
        }

        // Get additional data in parallel
        const [transfersData, injuriesData, achievementsData, marketValueData] = await Promise.all([
            fetch(`${PROXY_URL}/api/players/${selectedPlayer.id}/transfers`).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
            fetch(`${PROXY_URL}/api/players/${selectedPlayer.id}/injuries`).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
            fetch(`${PROXY_URL}/api/players/${selectedPlayer.id}/achievements`).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
            fetch(`${PROXY_URL}/api/players/${selectedPlayer.id}/market_value`).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null)
        ]);

        ttsMuted = false; // Unmute TTS for new search
        searchResults = {
            player: selectedPlayer,
            stats: statsData,
            profile: profileData,
            transfers: transfersData,
            injuries: injuriesData,
            achievements: achievementsData,
            marketValue: marketValueData
        };
        lastPlayerResult = selectedPlayer;

        displayResults(searchResults);
        updateStatus(`Found statistics for ${selectedPlayer.name}`, 'success');
        
        // Auto-read results aloud after display
        // Always try to read - userInteracted should be true by now
        console.log('Search complete. userInteracted:', userInteracted, 'ttsMuted:', ttsMuted);
        setTimeout(() => {
            console.log('Attempting to read results. isReadingAloud:', isReadingAloud, 'ttsMuted:', ttsMuted, 'userInteracted:', userInteracted);
            if (!isReadingAloud && !ttsMuted) {
                readResultsAloud();
            } else {
                console.log('Skipping read - isReadingAloud:', isReadingAloud, 'ttsMuted:', ttsMuted);
            }
        }, 1500);

    } catch (error) {
        console.error('Error searching player:', error);
        let errorMessage = error.message || 'An error occurred while searching. Please try again.';
        
        if (errorMessage.includes('403') || errorMessage.includes('blocking')) {
            errorMessage = 'The Transfermarkt API is currently blocking requests due to rate limiting or anti-bot protection. Please try again in a few minutes, or consider running the Transfermarkt API locally for better reliability.';
        }
        
        updateStatus(`Error: ${errorMessage}`, 'error');
        displayError(errorMessage);
        TTSManager.readError(errorMessage);
    } finally {
        showLoading(false);
    }
}

function displayResults(data) {
    const resultsContent = document.getElementById('resultsContent');
    const { player, stats, profile, transfers, injuries, achievements, marketValue } = data;

    const clubName = (player.club && player.club.name) || player.currentClub || 'N/A';
    const position = player.position || 'N/A';
    const age = player.age || 'N/A';

    // Get player image from profile or player object
    const playerImage = (profile && profile.image_url) || (player.image_url) || (player.image) || null;
    
    let html = `
        <div class="player-card" role="article" aria-labelledby="player-name">
            <div class="player-header">
                <div style="display: flex; align-items: center; gap: 1rem; flex: 1;">
                    ${playerImage ? `<img src="${escapeHtml(playerImage)}" alt="${escapeHtml(player.name)}" class="player-image" style="width: 80px; height: 80px; object-fit: cover; border-radius: 12px; border: 2px solid rgba(157, 122, 255, 0.3);">` : ''}
                    <div style="flex: 1;">
                        <h3 id="player-name" class="player-name">${escapeHtml(player.name)}</h3>
                        <p class="player-info">
                            <span class="info-item">Club: ${escapeHtml(clubName)}</span>
                            <span class="info-separator">•</span>
                            <span class="info-item">Position: ${escapeHtml(position)}</span>
                            <span class="info-separator">•</span>
                            <span class="info-item">Age: ${escapeHtml(age)}</span>
                        </p>
                    </div>
                </div>
                <button class="favorite-btn" onclick="toggleFavorite('${player.id}', '${escapeHtml(player.name)}')" aria-label="Add to favorites">⭐</button>
            </div>
    `;

    // Display stats correctly
    if (stats && stats.stats && Array.isArray(stats.stats) && stats.stats.length > 0) {
        html += '<div class="stats-section">';
        html += '<h4 class="stats-section-title">Career Statistics</h4>';
        html += '<div class="stats-grid" role="list">';
        
        let totalAppearances = 0;
        let totalGoals = 0;
        let totalAssists = 0;

        stats.stats.forEach(stat => {
            totalAppearances += stat.appearances || 0;
            totalGoals += stat.goals || 0;
            totalAssists += stat.assists || 0;
        });

        const statItems = [
            { label: 'Total Appearances', value: totalAppearances, icon: '👟' },
            { label: 'Total Goals', value: totalGoals, icon: '⚽' },
            { label: 'Total Assists', value: totalAssists, icon: '🎯' },
        ];

        statItems.forEach(stat => {
            html += `
                <div class="stat-item" role="listitem">
                    <div class="stat-icon">${stat.icon}</div>
                    <div class="stat-content">
                        <div class="stat-label">${escapeHtml(stat.label)}</div>
                        <div class="stat-value">${escapeHtml(String(stat.value))}</div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        
        // Recent seasons
        if (stats.stats.length > 0) {
            html += '<div class="seasons-section">';
            html += '<h4 class="stats-section-title">Recent Seasons</h4>';
            html += '<div class="seasons-list">';
            
            const recentSeasons = stats.stats.slice(0, 5);
            recentSeasons.forEach(season => {
                const compName = season.competitionName || season.competition_name || 'Unknown';
                const clubId = season.clubId || season.club_id || '';
                html += `
                    <div class="season-item">
                        <div class="season-header">
                            <span class="season-name">${escapeHtml(compName)}</span>
                            <span class="season-season">${escapeHtml(season.seasonId || season.season_id || '')}</span>
                        </div>
                        <div class="season-stats">
                            <span>${season.appearances || 0} apps</span>
                            <span>${season.goals || 0} goals</span>
                            <span>${season.assists || 0} assists</span>
                        </div>
                    </div>
                `;
            });
            
            html += '</div></div>';
        }
        
        html += '</div>';
    } else {
        html += '<div class="stats-unavailable">Statistics not available for this player</div>';
    }

    // Market value - format properly
    const formatMarketValue = (value) => {
        if (!value) return null;
        if (typeof value === 'string') return value;
        if (value >= 1000000000) return `€${(value / 1000000000).toFixed(2)}B`;
        if (value >= 1000000) return `€${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `€${(value / 1000).toFixed(1)}K`;
        return `€${value}`;
    };
    
    const currentMarketValue = profile?.marketValue || player.market_value;
    if (currentMarketValue) {
        const formattedValue = formatMarketValue(currentMarketValue);
        html += `
            <div class="market-value-section">
                <h4 class="stats-section-title">Market Value</h4>
                <div class="stat-item market-value">
                    <div class="stat-icon">💰</div>
                    <div class="stat-content">
                        <div class="stat-label">Current Market Value</div>
                        <div class="stat-value">${escapeHtml(formattedValue)}</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Additional market value section if history exists
    if (marketValue && marketValue.marketValueHistory && marketValue.marketValueHistory.length > 0) {
        const latest = marketValue.marketValueHistory[0];
        const latestValue = latest.marketValue || latest.value || 0;
        const latestFormatted = formatMarketValue(latestValue);
        const latestDate = latest.date || latest.dateStr || 'Recent';
        
        html += `
            <div class="market-value-section">
                <div class="stat-item market-value">
                    <div class="stat-icon">📈</div>
                    <div class="stat-content">
                        <div class="stat-label">Latest Market Value</div>
                        <div class="stat-value">${escapeHtml(latestFormatted)}</div>
                        <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 4px;">${escapeHtml(latestDate)}</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Additional player info from profile
    if (profile) {
        if (profile.height) {
            html += `
                <div class="stat-item">
                    <div class="stat-icon">📏</div>
                    <div class="stat-content">
                        <div class="stat-label">Height</div>
                        <div class="stat-value">${escapeHtml(profile.height)} cm</div>
                    </div>
                </div>
            `;
        }
        if (profile.foot) {
            html += `
                <div class="stat-item">
                    <div class="stat-icon">🦶</div>
                    <div class="stat-content">
                        <div class="stat-label">Preferred Foot</div>
                        <div class="stat-value">${escapeHtml(profile.foot)}</div>
                    </div>
                </div>
            `;
        }
        if (profile.citizenship && profile.citizenship.length > 0) {
            html += `
                <div class="stat-item">
                    <div class="stat-icon">🌍</div>
                    <div class="stat-content">
                        <div class="stat-label">Nationality</div>
                        <div class="stat-value">${escapeHtml(profile.citizenship.join(', '))}</div>
                    </div>
                </div>
            `;
        }
    }

    html += '</div>'; // Close player-card
    
    // Check if we have additional tabs to show
    const hasTransfers = transfers && transfers.transfers && transfers.transfers.length > 0;
    const hasInjuries = injuries && injuries.injuries && injuries.injuries.length > 0;
    const hasAchievements = achievements && achievements.achievements && achievements.achievements.length > 0;
    const hasMarketValueHistory = marketValue && marketValue.marketValueHistory && marketValue.marketValueHistory.length > 0;
    const hasTabs = hasTransfers || hasInjuries || hasAchievements || hasMarketValueHistory;
    
    // Add tabs section if we have additional data
    if (hasTabs) {
        html += '<div class="player-tabs-container">';
        html += '<div class="player-tabs">';
        if (hasTransfers) {
            html += '<button class="tab-button active" data-tab="transfers">🔄 Transfers</button>';
        }
        if (hasInjuries) {
            html += '<button class="tab-button' + (hasTransfers ? '' : ' active') + '" data-tab="injuries">🏥 Injuries</button>';
        }
        if (hasAchievements) {
            html += '<button class="tab-button' + ((hasTransfers || hasInjuries) ? '' : ' active') + '" data-tab="achievements">🏆 Achievements</button>';
        }
        if (hasMarketValueHistory) {
            html += '<button class="tab-button' + ((hasTransfers || hasInjuries || hasAchievements) ? '' : ' active') + '" data-tab="market-value">💰 Market Value</button>';
        }
    html += '</div>';
        html += '<div class="tabs-content-wrapper">';
    }
    
    // Transfers tab
    if (hasTransfers) {
        html += '<div class="tab-content' + (hasTransfers ? ' active' : '') + '" id="transfers-tab">';
        html += '<h4 class="stats-section-title">Transfer History</h4>';
        html += '<div class="transfers-list">';
        transfers.transfers.slice(0, 10).forEach(transfer => {
            const date = transfer.date || transfer.transferDate || 'N/A';
            // Handle different API response formats
            const from = (transfer.clubFrom && transfer.clubFrom.name) || 
                        (transfer.club_from && transfer.club_from.name) || 
                        transfer.fromClub || 
                        transfer.from || 
                        'Unknown';
            const to = (transfer.clubTo && transfer.clubTo.name) || 
                      (transfer.club_to && transfer.club_to.name) || 
                      transfer.toClub || 
                      transfer.to || 
                      'Unknown';
            const fee = transfer.fee ? formatMarketValue(transfer.fee) : (transfer.transferFee || 'Free');
            const season = transfer.season || '';
            html += `
                <div class="transfer-item">
                    <div class="transfer-date">${escapeHtml(date)}${season ? ` (${escapeHtml(season)})` : ''}</div>
                    <div class="transfer-details">
                        <span class="transfer-from">${escapeHtml(from)}</span>
                        <span class="transfer-arrow">→</span>
                        <span class="transfer-to">${escapeHtml(to)}</span>
                    </div>
                    <div class="transfer-fee">${escapeHtml(fee)}</div>
                </div>
            `;
        });
        html += '</div></div>';
    }
    
    // Injuries tab
    if (hasInjuries) {
        html += '<div class="tab-content' + ((hasTransfers ? '' : ' active')) + '" id="injuries-tab">';
        html += '<h4 class="stats-section-title">Injury History</h4>';
        html += '<div class="injuries-list">';
        injuries.injuries.slice(0, 10).forEach(injury => {
            const injuryType = injury.injury || injury.injuryType || injury.type || 'Unknown';
            const fromDate = injury.from_date || injury.fromDate || injury.startDate || 'N/A';
            const untilDate = injury.until_date || injury.untilDate || injury.endDate || 'Ongoing';
            const season = injury.season || '';
            const gamesMissed = injury.games_missed || injury.gamesMissed || null;
            html += `
                <div class="injury-item">
                    <div class="injury-type">${escapeHtml(injuryType)}</div>
                    <div class="injury-dates">${escapeHtml(fromDate)} - ${escapeHtml(untilDate)}${season ? ` (${escapeHtml(season)})` : ''}</div>
                    ${gamesMissed !== null ? `<div class="injury-days">${escapeHtml(gamesMissed)} games missed</div>` : ''}
                </div>
            `;
        });
        html += '</div></div>';
    }
    
    // Achievements tab
    if (hasAchievements) {
        html += '<div class="tab-content' + ((hasTransfers || hasInjuries) ? '' : ' active') + '" id="achievements-tab">';
        html += '<h4 class="stats-section-title">Achievements & Honors</h4>';
        html += '<div class="achievements-list">';
        achievements.achievements.forEach(achievement => {
            const title = achievement.title || achievement.name || 'Unknown';
            const season = achievement.season || achievement.seasonId || '';
            html += `
                <div class="achievement-item">
                    <div class="achievement-title">${escapeHtml(title)}</div>
                    ${season ? `<div class="achievement-season">${escapeHtml(season)}</div>` : ''}
                </div>
            `;
        });
        html += '</div></div>';
    }
    
    // Market Value History tab
    if (hasMarketValueHistory) {
        html += '<div class="tab-content' + ((hasTransfers || hasInjuries || hasAchievements) ? '' : ' active') + '" id="market-value-tab">';
        html += '<h4 class="stats-section-title">Market Value History</h4>';
        html += '<div class="market-value-chart">';
        const maxValue = Math.max(...marketValue.marketValueHistory.map(mv => mv.marketValue || mv.value || 0));
        marketValue.marketValueHistory.slice(0, 20).forEach(mv => {
            const date = mv.date || mv.dateStr || 'N/A';
            const value = mv.marketValue || mv.value || 0;
            const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
            const formattedValue = formatMarketValue(value);
            html += `
                <div class="market-value-item">
                    <div class="mv-date">${escapeHtml(date)}</div>
                    <div class="mv-bar-container">
                        <div class="mv-bar" style="width: ${percentage}%"></div>
                        <div class="mv-value">${escapeHtml(formattedValue)}</div>
                    </div>
                </div>
            `;
        });
        html += '</div></div>';
    }
    
    
    if (hasTabs) {
        html += '</div>'; // Close tabs-content-wrapper
        html += '</div>'; // Close player-tabs-container
    }
    
    resultsContent.innerHTML = html;

    // Setup tab switching
    setupTabs();
    
    // Auto-read results aloud
    setTimeout(() => {
        readResultsAloud();
    }, 500);
}

// ==================== PLAYER COMPARISON ====================
async function comparePlayers(player1Name, player2Name) {
    showLoading(true);
    const resultsDiv = document.getElementById('compareResults');
    resultsDiv.innerHTML = '<p>Loading comparison...</p>';

    try {
        // Search for both players
        const [player1Data, player2Data] = await Promise.all([
            searchPlayerForComparison(player1Name),
            searchPlayerForComparison(player2Name)
        ]);

        if (!player1Data || !player2Data) {
            throw new Error('Could not find one or both players');
        }

        // Get stats for both
        const [stats1, stats2] = await Promise.all([
            fetchPlayerStats(player1Data.id),
            fetchPlayerStats(player2Data.id)
        ]);

        ttsMuted = false;
        displayComparison(player1Data, player2Data, stats1, stats2);
    } catch (error) {
        resultsDiv.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
    } finally {
        showLoading(false);
    }
}

async function searchPlayerForComparison(playerName) {
    const response = await fetch(`${PROXY_URL}/api/players/search/${encodeURIComponent(playerName)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.results && data.results.length > 0 ? data.results[0] : null;
}

async function fetchPlayerStats(playerId) {
    try {
        const response = await fetch(`${PROXY_URL}/api/players/${playerId}/stats`);
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.warn('Could not fetch stats:', e);
    }
    return null;
}

function displayComparison(player1, player2, stats1, stats2) {
    const resultsDiv = document.getElementById('compareResults');
    
    // Calculate totals - handle both camelCase and snake_case
    const calcTotals = (stats) => {
        if (!stats || !stats.stats) return { appearances: 0, goals: 0, assists: 0 };
        return stats.stats.reduce((acc, s) => ({
            appearances: acc.appearances + (s.appearances || 0),
            goals: acc.goals + (s.goals || 0),
            assists: acc.assists + (s.assists || 0)
        }), { appearances: 0, goals: 0, assists: 0 });
    };

    const totals1 = calcTotals(stats1);
    const totals2 = calcTotals(stats2);
    
    // Auto-read comparison aloud using new comprehensive TTS manager
    setTimeout(() => {
        TTSManager.readComparison(player1, player2, stats1, stats2);
    }, 500);

    const html = `
        <div class="comparison-container">
            <div class="comparison-header">
                <div class="player-compare">
                    <h3>${escapeHtml(player1.name)}</h3>
                    <p>${escapeHtml((player1.club && player1.club.name) || 'N/A')}</p>
                </div>
                <div class="vs">VS</div>
                <div class="player-compare">
                    <h3>${escapeHtml(player2.name)}</h3>
                    <p>${escapeHtml((player2.club && player2.club.name) || 'N/A')}</p>
                </div>
            </div>
            <div class="comparison-stats">
                <div class="comparison-stat">
                    <div class="stat-label">Appearances</div>
                    <div class="stat-bars">
                        <div class="stat-bar" style="width: ${Math.max(totals1.appearances, totals2.appearances) > 0 ? (totals1.appearances / Math.max(totals1.appearances, totals2.appearances)) * 100 : 50}%">
                            ${totals1.appearances}
                        </div>
                        <div class="stat-bar" style="width: ${Math.max(totals1.appearances, totals2.appearances) > 0 ? (totals2.appearances / Math.max(totals1.appearances, totals2.appearances)) * 100 : 50}%">
                            ${totals2.appearances}
                        </div>
                    </div>
                </div>
                <div class="comparison-stat">
                    <div class="stat-label">Goals</div>
                    <div class="stat-bars">
                        <div class="stat-bar" style="width: ${Math.max(totals1.goals, totals2.goals) > 0 ? (totals1.goals / Math.max(totals1.goals, totals2.goals)) * 100 : 50}%">
                            ${totals1.goals}
                        </div>
                        <div class="stat-bar" style="width: ${Math.max(totals1.goals, totals2.goals) > 0 ? (totals2.goals / Math.max(totals1.goals, totals2.goals)) * 100 : 50}%">
                            ${totals2.goals}
                        </div>
                    </div>
                </div>
                <div class="comparison-stat">
                    <div class="stat-label">Assists</div>
                    <div class="stat-bars">
                        <div class="stat-bar" style="width: ${Math.max(totals1.assists, totals2.assists) > 0 ? (totals1.assists / Math.max(totals1.assists, totals2.assists)) * 100 : 50}%">
                            ${totals1.assists}
                        </div>
                        <div class="stat-bar" style="width: ${Math.max(totals1.assists, totals2.assists) > 0 ? (totals2.assists / Math.max(totals1.assists, totals2.assists)) * 100 : 50}%">
                            ${totals2.assists}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    resultsDiv.innerHTML = html;
}

// ==================== CLUB INFORMATION ====================
async function showClubAchievements(clubName) {
    showLoading(true);
    const resultsDiv = document.getElementById('clubAchievementsResults');
    resultsDiv.innerHTML = '<p>Loading club information...</p>';

    try {
        // Search for club
        const response = await fetch(`${PROXY_URL}/api/clubs/search/${encodeURIComponent(clubName)}`);
        if (!response.ok) throw new Error('Could not find club');
        
        const data = await response.json();
        if (!data.results || data.results.length === 0) {
            throw new Error(`No club found matching "${clubName}"`);
        }

        const club = data.results[0];
        
        // Get club profile and players in parallel
        const [clubProfile, clubPlayers] = await Promise.all([
            fetch(`${PROXY_URL}/api/clubs/${club.id}/profile`).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
            fetch(`${PROXY_URL}/api/clubs/${club.id}/players`).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null)
        ]);
        
        ttsMuted = false;
        displayClubInfo(club, clubProfile, clubPlayers);
        
        // Auto-read club info aloud
        setTimeout(() => {
            readClubInfoAloud(club, clubProfile, clubPlayers);
        }, 500);
    } catch (error) {
        resultsDiv.innerHTML = `<div class="error-message" role="alert">Error: ${error.message}</div>`;
    } finally {
        showLoading(false);
    }
}

function readClubInfoAloud(club, profile, clubPlayers) {
    // Use the new comprehensive TTS manager
    TTSManager.readClubInfo(club, profile, clubPlayers);
}

function displayClubInfo(club, profile, clubPlayers = null) {
    const resultsDiv = document.getElementById('clubAchievementsResults');
    lastClubResult = { club, profile };
    
    // Format market value
    const formatMarketValue = (value) => {
        if (!value) return 'N/A';
        if (typeof value === 'string') return value;
        if (value >= 1000000000) return `€${(value / 1000000000).toFixed(2)}B`;
        if (value >= 1000000) return `€${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `€${(value / 1000).toFixed(1)}K`;
        return `€${value}`;
    };
    
    // Handle market value from different sources
    let marketValue = null;
    if (profile?.currentMarketValue) {
        // Try to parse if it's a string
        if (typeof profile.currentMarketValue === 'string') {
            const cleaned = profile.currentMarketValue.replace(/[^\d]/g, '');
            marketValue = cleaned ? parseInt(cleaned) : null;
        } else {
            marketValue = profile.currentMarketValue;
        }
    } else if (club.marketValue) {
        marketValue = club.marketValue;
    }
    
    let html = `
        <div class="club-card" role="article" aria-labelledby="club-name">
            <div class="club-header">
                <div>
                    <h3 id="club-name" class="club-name">${escapeHtml(club.name || profile?.name || 'Unknown')}</h3>
                    ${profile?.officialName ? `<p class="club-official-name">${escapeHtml(profile.officialName)}</p>` : ''}
                </div>
                ${profile?.image ? `<img src="${escapeHtml(profile.image)}" alt="${escapeHtml(club.name)} logo" class="club-logo">` : ''}
            </div>
            
            <div class="club-stats-grid">
                ${marketValue ? `
                <div class="stat-item">
                    <div class="stat-icon">💰</div>
                    <div class="stat-content">
                        <div class="stat-label">Market Value</div>
                        <div class="stat-value">${formatMarketValue(marketValue)}</div>
                    </div>
                </div>
                ` : ''}
                
                ${profile?.squad ? `
                <div class="stat-item">
                    <div class="stat-icon">👥</div>
                    <div class="stat-content">
                        <div class="stat-label">Squad Size</div>
                        <div class="stat-value">${profile.squad.size || 'N/A'}</div>
                    </div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon">📊</div>
                    <div class="stat-content">
                        <div class="stat-label">Average Age</div>
                        <div class="stat-value">${profile.squad.averageAge ? parseFloat(profile.squad.averageAge).toFixed(1) : 'N/A'}</div>
                    </div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon">🌍</div>
                    <div class="stat-content">
                        <div class="stat-label">Foreigners</div>
                        <div class="stat-value">${profile.squad.foreigners || 'N/A'}</div>
                    </div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon">⭐</div>
                    <div class="stat-content">
                        <div class="stat-label">National Team Players</div>
                        <div class="stat-value">${profile.squad.nationalTeamPlayers || 'N/A'}</div>
                    </div>
                </div>
                ` : ''}
                
                ${profile?.stadiumName ? `
                <div class="stat-item">
                    <div class="stat-icon">🏟️</div>
                    <div class="stat-content">
                        <div class="stat-label">Stadium</div>
                        <div class="stat-value">${escapeHtml(profile.stadiumName)}</div>
                    </div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon">🪑</div>
                    <div class="stat-content">
                        <div class="stat-label">Stadium Capacity</div>
                        <div class="stat-value">${profile.stadiumSeats ? parseInt(profile.stadiumSeats).toLocaleString() : 'N/A'}</div>
                    </div>
                </div>
                ` : ''}
                
                ${profile?.league ? `
                <div class="stat-item">
                    <div class="stat-icon">🏆</div>
                    <div class="stat-content">
                        <div class="stat-label">League</div>
                        <div class="stat-value">${escapeHtml(profile.league.name || 'N/A')}</div>
                    </div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon">🌎</div>
                    <div class="stat-content">
                        <div class="stat-label">Country</div>
                        <div class="stat-value">${escapeHtml(profile.league.countryName || club.country || 'N/A')}</div>
                    </div>
                </div>
                ` : club.country ? `
                <div class="stat-item">
                    <div class="stat-icon">🌎</div>
                    <div class="stat-content">
                        <div class="stat-label">Country</div>
                        <div class="stat-value">${escapeHtml(club.country)}</div>
                    </div>
                </div>
                ` : ''}
                
                ${profile?.foundedOn ? `
                <div class="stat-item">
                    <div class="stat-icon">📅</div>
                    <div class="stat-content">
                        <div class="stat-label">Founded</div>
                        <div class="stat-value">${escapeHtml(profile.foundedOn)}</div>
                    </div>
                </div>
                ` : ''}
                
                ${profile?.fifaWorldRanking ? `
                <div class="stat-item">
                    <div class="stat-icon">🌐</div>
                    <div class="stat-content">
                        <div class="stat-label">FIFA World Ranking</div>
                        <div class="stat-value">#${escapeHtml(profile.fifaWorldRanking)}</div>
                    </div>
                </div>
                ` : ''}
            </div>
            
            ${profile?.website ? `
            <div class="club-links">
                <a href="https://${escapeHtml(profile.website)}" target="_blank" rel="noopener noreferrer" class="club-link" aria-label="Visit ${escapeHtml(club.name)} website">
                    🌐 Official Website
                </a>
            </div>
            ` : ''}
        </div>
    `;
    
    // Add club players section if available
    if (clubPlayers && clubPlayers.players && clubPlayers.players.length > 0) {
        html += `
            <div class="club-players-section">
                <h3 class="club-section-title">Squad Players</h3>
                <div class="club-players-grid">
        `;
        clubPlayers.players.slice(0, 20).forEach(player => {
            const name = player.name || 'Unknown';
            const position = player.position || 'N/A';
            const marketValue = player.marketValue ? formatMarketValue(player.marketValue) : 'N/A';
            html += `
                <div class="club-player-card" onclick="searchPlayerStats('${escapeHtml(name)}')" style="cursor: pointer;">
                    <div class="club-player-name">${escapeHtml(name)}</div>
                    <div class="club-player-position">${escapeHtml(position)}</div>
                    <div class="club-player-value">${escapeHtml(marketValue)}</div>
                </div>
            `;
        });
        html += `
                </div>
            </div>
        `;
    }
    
    resultsDiv.innerHTML = html;
}

// ==================== FAVORITES (LocalStorage) ====================
function getFavorites() {
    const favorites = localStorage.getItem('favorites');
    const parsed = favorites ? JSON.parse(favorites) : [];
    return parsed.map(fav => fav.type ? fav : { ...fav, type: 'player' });
}

function saveFavorites(favorites) {
    localStorage.setItem('favorites', JSON.stringify(favorites));
}

function loadFavorites() {
    showLoading(true);
    const resultsDiv = document.getElementById('favoritesResults');
    
    try {
        const favorites = getFavorites();
        displayFavorites(favorites);
        
        // Auto-read favorites aloud using new comprehensive TTS manager
        if (userInteracted && !ttsMuted) {
            setTimeout(() => {
                TTSManager.readFavorites(favorites);
            }, 500);
        }
    } catch (error) {
        resultsDiv.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        TTSManager.readError(error.message);
    } finally {
        showLoading(false);
    }
}

function displayFavorites(favorites) {
    const resultsDiv = document.getElementById('favoritesResults');
    
    if (favorites.length === 0) {
        resultsDiv.innerHTML = '<p>No favorites yet. Add players or clubs to favorites using the favorite button or voice commands.</p>';
        return;
    }

    const playerFavorites = favorites.filter(f => f.type === 'player');
    const clubFavorites = favorites.filter(f => f.type === 'club');

    let html = '';

    if (playerFavorites.length > 0) {
        html += '<h3>Favorite Players</h3><div class="favorites-list">';
        playerFavorites.forEach(fav => {
        html += `
            <div class="favorite-item">
                    <div>
                        <strong>${escapeHtml(fav.player_name)}</strong>
                        <div class="favorite-meta">${escapeHtml(fav.club_name || '')}</div>
                    </div>
                    <div class="favorite-actions">
                <button onclick="searchFavoritePlayer('${fav.player_id}', '${escapeHtml(fav.player_name)}')">View</button>
                        <button onclick="removeFavorite('${fav.player_id}', 'player')">Remove</button>
                    </div>
            </div>
        `;
    });
    html += '</div>';
    }

    if (clubFavorites.length > 0) {
        html += '<h3>Favorite Clubs</h3><div class="favorites-list">';
        clubFavorites.forEach(fav => {
            html += `
                <div class="favorite-item">
                    <div>
                        <strong>${escapeHtml(fav.club_name)}</strong>
                        <div class="favorite-meta">${escapeHtml(fav.country || '')}</div>
                    </div>
                    <div class="favorite-actions">
                        <button onclick="viewFavoriteClub('${escapeHtml(fav.club_name)}')">View</button>
                        <button onclick="removeFavorite('${fav.club_id}', 'club')">Remove</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    resultsDiv.innerHTML = html;
}

function toggleFavorite(playerId, playerName) {
    const favorites = getFavorites();
    const existingIndex = favorites.findIndex(f => f.type === 'player' && f.player_id === playerId);
    
    if (existingIndex >= 0) {
        favorites.splice(existingIndex, 1);
        updateStatus('Player removed from favorites', 'success');
    } else {
        favorites.push({
            type: 'player',
            player_id: playerId,
            player_name: playerName,
            club_name: (searchResults?.player?.club && searchResults.player.club.name) || searchResults?.player?.currentClub || '',
            added_at: new Date().toISOString()
        });
        updateStatus('Player added to favorites', 'success');
    }
    
    saveFavorites(favorites);
    
    if (currentPage === 'favorites') {
        displayFavorites(favorites);
    }
}

function toggleClubFavorite(clubId, clubName) {
    const favorites = getFavorites();
    const existingIndex = favorites.findIndex(f => f.type === 'club' && f.club_id === clubId);
    
    if (existingIndex >= 0) {
        favorites.splice(existingIndex, 1);
        updateStatus('Club removed from favorites', 'success');
    } else {
        favorites.push({
            type: 'club',
            club_id: clubId,
            club_name: clubName,
            added_at: new Date().toISOString()
        });
        updateStatus('Club added to favorites', 'success');
    }
    
    saveFavorites(favorites);
    
    if (currentPage === 'favorites') {
        displayFavorites(favorites);
    }
}

function removeFavorite(id, type = 'player') {
    const favorites = getFavorites();
    const filtered = favorites.filter(f => {
        if (type === 'player') {
            return !(f.type === 'player' && f.player_id === id);
        }
        return !(f.type === 'club' && f.club_id === id);
    });
    saveFavorites(filtered);
    
    if (currentPage === 'favorites') {
        displayFavorites(filtered);
    }
    updateStatus(`${type === 'player' ? 'Player' : 'Club'} removed from favorites`, 'success');
}

async function searchFavoritePlayer(playerId, playerName) {
    navigateTo('home');
    await searchPlayerStats(playerName);
}

async function viewFavoriteClub(clubName) {
    navigateTo('club-achievements');
    await showClubAchievements(clubName);
}

async function addPlayerFavoriteByName(name) {
    if (!name) {
        updateStatus('Please specify a player name to favorite.', 'error');
        return;
    }
    updateStatus(`Adding ${name} to favorites...`, 'success');
    try {
        const response = await fetch(`${PROXY_URL}/api/players/search/${encodeURIComponent(name)}`);
        if (!response.ok) throw new Error('Player not found');
        const data = await response.json();
        if (!data.results || data.results.length === 0) throw new Error('Player not found');
        const player = data.results[0];
        addFavoriteEntry({
            type: 'player',
            player_id: player.id,
            player_name: player.name,
            club_name: (player.club && player.club.name) || player.currentClub || '',
            added_at: new Date().toISOString()
        });
    } catch (error) {
        updateStatus(`Could not add player to favorites: ${error.message}`, 'error');
    }
}

async function addClubFavoriteByName(name) {
    if (!name) {
        updateStatus('Please specify a club name to favorite.', 'error');
        return;
    }
    updateStatus(`Adding ${name} to favorites...`, 'success');
    try {
        const response = await fetch(`${PROXY_URL}/api/clubs/search/${encodeURIComponent(name)}`);
        if (!response.ok) throw new Error('Club not found');
        const data = await response.json();
        if (!data.results || data.results.length === 0) throw new Error('Club not found');
        const club = data.results[0];
        addFavoriteEntry({
            type: 'club',
            club_id: club.id,
            club_name: club.name,
            country: club.country || '',
            added_at: new Date().toISOString()
        });
    } catch (error) {
        updateStatus(`Could not add club to favorites: ${error.message}`, 'error');
    }
}

async function addCurrentPlayerFavorite() {
    if (!lastPlayerResult) {
        updateStatus('No player selected yet. Search for a player first.', 'error');
        return;
    }
    toggleFavorite(lastPlayerResult.id, lastPlayerResult.name);
}

async function addCurrentClubFavorite() {
    if (!lastClubResult?.club) {
        updateStatus('No club selected yet. Search for a club first.', 'error');
        return;
    }
    toggleClubFavorite(lastClubResult.club.id, lastClubResult.club.name);
}

function removePlayerFavoriteByName(name) {
    if (!name || name === 'this') {
        if (lastPlayerResult) {
            removeFavorite(lastPlayerResult.id, 'player');
        } else {
            updateStatus('No recently viewed player to remove.', 'error');
        }
        return;
    }
    const favorites = getFavorites();
    const filtered = favorites.filter(f => !(f.type === 'player' && f.player_name?.toLowerCase() === name.toLowerCase()));
    if (filtered.length === favorites.length) {
        updateStatus('Player not found in favorites.', 'error');
        return;
    }
    saveFavorites(filtered);
    if (currentPage === 'favorites') {
        displayFavorites(filtered);
    }
    updateStatus('Player removed from favorites', 'success');
}

function removeClubFavoriteByName(name) {
    if (!name || name === 'this') {
        if (lastClubResult?.club) {
            removeFavorite(lastClubResult.club.id, 'club');
        } else {
            updateStatus('No recently viewed club to remove.', 'error');
        }
        return;
    }
    const favorites = getFavorites();
    const filtered = favorites.filter(f => !(f.type === 'club' && f.club_name?.toLowerCase() === name.toLowerCase()));
    if (filtered.length === favorites.length) {
        updateStatus('Club not found in favorites.', 'error');
        return;
    }
    saveFavorites(filtered);
    if (currentPage === 'favorites') {
        displayFavorites(filtered);
    }
    updateStatus('Club removed from favorites', 'success');
}

function addFavoriteEntry(entry) {
    const favorites = getFavorites();
    const exists = favorites.some(f => {
        if (entry.type === 'player' && f.type === 'player') {
            return f.player_id === entry.player_id;
        }
        if (entry.type === 'club' && f.type === 'club') {
            return f.club_id === entry.club_id;
        }
        return false;
    });
    if (exists) {
        updateStatus(`${entry.type === 'player' ? 'Player' : 'Club'} already in favorites`, 'info');
        return;
    }
    favorites.push(entry);
    saveFavorites(favorites);
    updateStatus(`${entry.type === 'player' ? 'Player' : 'Club'} added to favorites`, 'success');
    if (currentPage === 'favorites') {
        displayFavorites(favorites);
    }
}

async function viewFavoritePlayer(playerId) {
    // Reserved for future use if needed
    navigateTo('home');
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    const voiceBtn = document.getElementById('voiceBtn');
    const searchForm = document.getElementById('searchForm');
    const stopBtn = document.getElementById('stopBtn');

    if (voiceBtn) {
        voiceBtn.addEventListener('click', toggleVoiceRecording);
        voiceBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleVoiceRecording();
            }
        });
    }

    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // Mark user interaction when form is submitted
            userInteracted = true;
            console.log('Search form submitted, userInteracted set to true');
            const playerName = document.getElementById('playerName').value.trim();
            const clubName = document.getElementById('clubName').value.trim();
            if (playerName) {
                searchPlayerStats(playerName, clubName || null);
            }
        });
    }

    if (stopBtn) stopBtn.addEventListener('click', stopReading);
}

// ==================== UTILITY FUNCTIONS ====================
async function toggleVoiceRecording() {
    if (!recognition) {
        updateStatus('Speech recognition not available', 'error');
        return;
    }
    if (isRecording || isRecognitionStarting) {
        // Stop recording
        autoListening = false;
        isRecognitionStopping = true;
        try {
            recognition.stop();
            updateStatus('Voice listening stopped', 'success');
        } catch (error) {
            console.warn('Error stopping recognition:', error);
            isRecording = false;
            isRecognitionStarting = false;
            isRecognitionStopping = false;
            updateVoiceButton(false);
        }
    } else {
        // Start recording manually (button click)
        // Request microphone permission first
        const hasPermission = await requestMicrophonePermission();
        if (hasPermission) {
            // Use safe start function
            autoListening = true;
            if (safeStartRecognition()) {
                updateStatus('🎤 Listening for voice commands...', 'success');
            } else {
                updateStatus('Error starting voice recognition. Please try again.', 'error');
                autoListening = false;
            }
        }
    }
}

function updateVoiceButton(recording) {
    const btn = document.getElementById('voiceBtn');
    const text = btn?.querySelector('.button-text');
    if (btn && text) {
        if (recording) {
            btn.classList.add('recording');
            btn.setAttribute('aria-pressed', 'true');
            text.textContent = 'Stop Recording';
        } else {
            btn.classList.remove('recording');
            btn.setAttribute('aria-pressed', 'false');
            text.textContent = 'Start Voice Command';
        }
    }
}

function updateStatus(message, type = '') {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
    }
}

function showLoading(show = true) {
    const loading = document.getElementById('loading');
    if (loading) {
        if (show) {
            loading.removeAttribute('hidden');
            loading.setAttribute('aria-busy', 'true');
        } else {
            loading.setAttribute('hidden', 'true');
            loading.setAttribute('aria-busy', 'false');
        }
    }
}

function displayError(message) {
    const resultsContent = document.getElementById('resultsContent');
    if (resultsContent) {
        resultsContent.innerHTML = `
            <div class="error-message" role="alert">
                ${escapeHtml(message)}
            </div>
        `;
    }
}

// Legacy speak function - now uses TTSManager
function speak(text, interrupt = true) {
    TTSManager.speak(text, interrupt);
}

// ==================== COMPREHENSIVE TEXT-TO-SPEECH SYSTEM ====================
/**
 * Comprehensive TTS System - Reads all query outputs aloud
 * This is a completely new implementation with enhanced features
 */

// TTS Manager - Centralized text-to-speech controller
const TTSManager = {
    isActive: false,
    queue: [],
    currentUtterance: null,
    
    /**
     * Format market value for speech
     */
    formatMarketValue(value) {
        if (!value) return null;
        if (typeof value === 'string') {
            // Try to extract number from string
            const numMatch = value.replace(/[^\d]/g, '');
            if (numMatch) value = parseInt(numMatch);
            else return value;
        }
        if (value >= 1000000000) return `${(value / 1000000000).toFixed(2)} billion euros`;
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)} million euros`;
        if (value >= 1000) return `${(value / 1000).toFixed(1)} thousand euros`;
        return `${value} euros`;
    },
    
    /**
     * Format number with proper pronunciation
     */
    formatNumber(num) {
        if (num === null || num === undefined) return 'zero';
        return num.toLocaleString('en-US');
    },
    
    /**
     * Read player statistics comprehensively
     */
    readPlayerStats(searchResults) {
        console.log('TTSManager.readPlayerStats called with:', searchResults);
        if (!searchResults || !searchResults.player) {
            console.log('No player data in searchResults');
            this.speak('No player data available to read.', false);
            return;
        }
        
        if (ttsMuted) {
            console.log('TTS is muted, not reading player stats');
            return;
        }
        if (!userInteracted) {
            console.log('User not interacted, enabling TTS anyway for search results');
            userInteracted = true; // Enable for search results
        }
        
        console.log('Generating player stats text...');
        
        const { player, stats, profile, transfers, injuries, achievements, marketValue } = searchResults;
        const clubName = (player.club && player.club.name) || player.currentClub || 'Unknown club';
        const position = player.position || 'Unknown position';
        const age = player.age ? `${player.age} years old` : 'Unknown age';
        
        let text = `Player Statistics Report. `;
        text += `Player name: ${player.name}. `;
        text += `Current club: ${clubName}. `;
        text += `Position: ${position}. `;
        text += `Age: ${age}. `;
        
        // Career Statistics
        if (stats && stats.stats && Array.isArray(stats.stats) && stats.stats.length > 0) {
            let totalAppearances = 0;
            let totalGoals = 0;
            let totalAssists = 0;
            let competitions = new Set();
            
            stats.stats.forEach(stat => {
                totalAppearances += (stat.appearances || 0);
                totalGoals += (stat.goals || 0);
                totalAssists += (stat.assists || 0);
                const compName = stat.competitionName || stat.competition_name;
                if (compName) competitions.add(compName);
            });
            
            text += `Career Summary. `;
            text += `Total appearances: ${this.formatNumber(totalAppearances)}. `;
            text += `Total goals: ${this.formatNumber(totalGoals)}. `;
            text += `Total assists: ${this.formatNumber(totalAssists)}. `;
            
            if (totalGoals > 0 && totalAppearances > 0) {
                const goalsPerGame = (totalGoals / totalAppearances).toFixed(2);
                text += `Goals per game average: ${goalsPerGame}. `;
            }
            
            // Recent seasons (last 3)
            const recentSeasons = stats.stats.slice(0, 3);
            if (recentSeasons.length > 0) {
                text += `Recent seasons performance. `;
                recentSeasons.forEach((stat, idx) => {
                    const compName = stat.competitionName || stat.competition_name || 'Unknown competition';
                    const seasonId = stat.seasonId || stat.season_id || 'Unknown season';
                    const apps = stat.appearances || 0;
                    const goals = stat.goals || 0;
                    const assists = stat.assists || 0;
                    text += `Season ${seasonId} in ${compName}: ${apps} appearances, ${goals} goals, ${assists} assists. `;
                });
            }
        } else {
            text += `Statistics data is not available for this player. `;
        }
        
        // Market Value
        let marketValueText = '';
        if (profile && profile.marketValue) {
            const formatted = this.formatMarketValue(profile.marketValue);
            marketValueText = `Current market value: ${formatted}. `;
        } else if (player.market_value) {
            const formatted = this.formatMarketValue(player.market_value);
            marketValueText = `Current market value: ${formatted}. `;
        }
        
        if (marketValue && marketValue.marketValueHistory && marketValue.marketValueHistory.length > 0) {
            const latest = marketValue.marketValueHistory[0];
            const date = latest.date || latest.dateStr || 'recently';
            const value = latest.marketValue || latest.value || 0;
            const formatted = this.formatMarketValue(value);
            if (!marketValueText) {
                marketValueText = `Latest market value: ${formatted} as of ${date}. `;
            } else {
                marketValueText += `Latest update on ${date}: ${formatted}. `;
            }
        }
        text += marketValueText;
        
        // Additional profile info
        if (profile) {
            if (profile.height) {
                text += `Height: ${profile.height} centimeters. `;
            }
            if (profile.foot) {
                text += `Preferred foot: ${profile.foot}. `;
            }
            if (profile.citizenship && profile.citizenship.length > 0) {
                text += `Nationality: ${profile.citizenship.join(', ')}. `;
            }
        }
        
        // Transfers summary
        if (transfers && transfers.transfers && transfers.transfers.length > 0) {
            const recentTransfers = transfers.transfers.slice(0, 3);
            text += `Recent transfers. `;
            recentTransfers.forEach((transfer, idx) => {
                const from = (transfer.club_from && transfer.club_from.name) || transfer.fromClub || transfer.from || 'Unknown';
                const to = (transfer.club_to && transfer.club_to.name) || transfer.toClub || transfer.to || 'Unknown';
                const date = transfer.date || transfer.transferDate || 'Unknown date';
                const fee = transfer.fee ? this.formatMarketValue(transfer.fee) : 'Free transfer';
                text += `Transfer ${idx + 1}: On ${date}, moved from ${from} to ${to} for ${fee}. `;
            });
        }
        
        // Injuries summary
        if (injuries && injuries.injuries && injuries.injuries.length > 0) {
            const recentInjuries = injuries.injuries.slice(0, 3);
            text += `Recent injuries. `;
            recentInjuries.forEach((injury, idx) => {
                const injuryType = injury.injury || injury.injuryType || injury.type || 'Unknown';
                const fromDate = injury.from_date || injury.fromDate || injury.startDate || 'Unknown';
                const untilDate = injury.until_date || injury.untilDate || injury.endDate || 'Ongoing';
                text += `Injury ${idx + 1}: ${injuryType} from ${fromDate} to ${untilDate}. `;
            });
        }
        
        // Achievements summary
        if (achievements && achievements.achievements && achievements.achievements.length > 0) {
            text += `Achievements and honors. `;
            const topAchievements = achievements.achievements.slice(0, 5);
            topAchievements.forEach((achievement, idx) => {
                const title = achievement.title || achievement.name || 'Unknown achievement';
                const season = achievement.season || achievement.seasonId || '';
                if (season) {
                    text += `${title} in ${season}. `;
                } else {
                    text += `${title}. `;
                }
            });
        }
        
        text += `End of player statistics report. `;
        console.log('Generated text length:', text.length, 'characters');
        console.log('Calling this.speak with text');
        this.speak(text, true);
    },
    
    /**
     * Read club information comprehensively
     */
    readClubInfo(club, profile, clubPlayers) {
        if (ttsMuted || !userInteracted) return;
        
        if (!club && !profile) {
            this.speak('No club data available to read.', false);
            return;
        }
        
        const clubName = club?.name || profile?.name || 'Unknown club';
        let text = `Club Information Report. `;
        text += `Club name: ${clubName}. `;
        
        if (profile?.officialName && profile.officialName !== clubName) {
            text += `Official name: ${profile.officialName}. `;
        }
        
        // Market Value
        let marketValue = null;
        if (profile?.currentMarketValue) {
            if (typeof profile.currentMarketValue === 'string') {
                const cleaned = profile.currentMarketValue.replace(/[^\d]/g, '');
                marketValue = cleaned ? parseInt(cleaned) : null;
            } else {
                marketValue = profile.currentMarketValue;
            }
        } else if (club?.marketValue) {
            marketValue = club.marketValue;
        }
        
        if (marketValue) {
            const formatted = this.formatMarketValue(marketValue);
            text += `Market value: ${formatted}. `;
        }
        
        // Squad Information
        if (profile?.squad) {
            text += `Squad information. `;
            if (profile.squad.size) {
                text += `Squad size: ${profile.squad.size} players. `;
            }
            if (profile.squad.averageAge) {
                text += `Average age: ${parseFloat(profile.squad.averageAge).toFixed(1)} years. `;
            }
            if (profile.squad.foreigners) {
                text += `Foreign players: ${profile.squad.foreigners}. `;
            }
            if (profile.squad.nationalTeamPlayers) {
                text += `National team players: ${profile.squad.nationalTeamPlayers}. `;
            }
        }
        
        // Stadium
        if (profile?.stadiumName) {
            text += `Stadium: ${profile.stadiumName}. `;
            if (profile.stadiumSeats) {
                const capacity = parseInt(profile.stadiumSeats).toLocaleString('en-US');
                text += `Stadium capacity: ${capacity} seats. `;
            }
        }
        
        // League and Country
        if (profile?.league) {
            if (profile.league.name) {
                text += `League: ${profile.league.name}. `;
            }
            if (profile.league.countryName) {
                text += `Country: ${profile.league.countryName}. `;
            }
        } else if (club?.country) {
            text += `Country: ${club.country}. `;
        }
        
        // Founded
        if (profile?.foundedOn) {
            text += `Founded: ${profile.foundedOn}. `;
        }
        
        // FIFA Ranking
        if (profile?.fifaWorldRanking) {
            text += `FIFA World Ranking: number ${profile.fifaWorldRanking}. `;
        }
        
        // Squad Players
        if (clubPlayers && clubPlayers.players && clubPlayers.players.length > 0) {
            text += `Squad has ${clubPlayers.players.length} players. `;
            const topPlayers = clubPlayers.players.slice(0, 5);
            text += `Notable players include: `;
            topPlayers.forEach((player, idx) => {
                const name = player.name || 'Unknown';
                const position = player.position || '';
                if (position) {
                    text += `${name}, ${position}. `;
                } else {
                    text += `${name}. `;
                }
            });
        }
        
        text += `End of club information report. `;
        this.speak(text, true);
    },
    
    /**
     * Read player comparison comprehensively
     */
    readComparison(player1, player2, stats1, stats2) {
        if (ttsMuted || !userInteracted) return;
        
        if (!player1 || !player2) {
            this.speak('Comparison data is incomplete.', false);
            return;
        }
        
        const calcTotals = (stats) => {
            if (!stats || !stats.stats) return { appearances: 0, goals: 0, assists: 0 };
            return stats.stats.reduce((acc, s) => ({
                appearances: acc.appearances + (s.appearances || 0),
                goals: acc.goals + (s.goals || 0),
                assists: acc.assists + (s.assists || 0)
            }), { appearances: 0, goals: 0, assists: 0 });
        };
        
        const totals1 = calcTotals(stats1);
        const totals2 = calcTotals(stats2);
        
        const club1 = (player1.club && player1.club.name) || player1.currentClub || 'Unknown club';
        const club2 = (player2.club && player2.club.name) || player2.currentClub || 'Unknown club';
        
        let text = `Player Comparison Report. `;
        text += `Comparing ${player1.name} from ${club1} versus ${player2.name} from ${club2}. `;
        
        // Appearances
        text += `Appearances: ${player1.name} has ${this.formatNumber(totals1.appearances)} appearances, `;
        text += `while ${player2.name} has ${this.formatNumber(totals2.appearances)} appearances. `;
        if (totals1.appearances > totals2.appearances) {
            text += `${player1.name} has more appearances. `;
        } else if (totals2.appearances > totals1.appearances) {
            text += `${player2.name} has more appearances. `;
        } else {
            text += `Both players have the same number of appearances. `;
        }
        
        // Goals
        text += `Goals: ${player1.name} has scored ${this.formatNumber(totals1.goals)} goals, `;
        text += `while ${player2.name} has scored ${this.formatNumber(totals2.goals)} goals. `;
        if (totals1.goals > totals2.goals) {
            text += `${player1.name} has scored more goals. `;
        } else if (totals2.goals > totals1.goals) {
            text += `${player2.name} has scored more goals. `;
        } else {
            text += `Both players have scored the same number of goals. `;
        }
        
        // Assists
        text += `Assists: ${player1.name} has ${this.formatNumber(totals1.assists)} assists, `;
        text += `while ${player2.name} has ${this.formatNumber(totals2.assists)} assists. `;
        if (totals1.assists > totals2.assists) {
            text += `${player1.name} has more assists. `;
        } else if (totals2.assists > totals1.assists) {
            text += `${player2.name} has more assists. `;
        } else {
            text += `Both players have the same number of assists. `;
        }
        
        // Goals per game
        if (totals1.appearances > 0 && totals2.appearances > 0) {
            const gpg1 = (totals1.goals / totals1.appearances).toFixed(2);
            const gpg2 = (totals2.goals / totals2.appearances).toFixed(2);
            text += `Goals per game: ${player1.name} averages ${gpg1} goals per game, `;
            text += `while ${player2.name} averages ${gpg2} goals per game. `;
        }
        
        text += `End of comparison report. `;
        this.speak(text, true);
    },
    
    /**
     * Read favorites list
     */
    readFavorites(favorites) {
        if (ttsMuted || !userInteracted) return;
        
        if (!favorites || favorites.length === 0) {
            this.speak('You have no favorites saved yet.', false);
            return;
        }
        
        const playerFavorites = favorites.filter(f => f.type === 'player');
        const clubFavorites = favorites.filter(f => f.type === 'club');
        
        let text = `Your Favorites List. `;
        
        if (playerFavorites.length > 0) {
            text += `You have ${playerFavorites.length} favorite player${playerFavorites.length > 1 ? 's' : ''}. `;
            playerFavorites.forEach((fav, idx) => {
                const name = fav.player_name || 'Unknown player';
                const club = fav.club_name || '';
                if (club) {
                    text += `Player ${idx + 1}: ${name} from ${club}. `;
                } else {
                    text += `Player ${idx + 1}: ${name}. `;
                }
            });
        }
        
        if (clubFavorites.length > 0) {
            text += `You have ${clubFavorites.length} favorite club${clubFavorites.length > 1 ? 's' : ''}. `;
            clubFavorites.forEach((fav, idx) => {
                const name = fav.club_name || 'Unknown club';
                text += `Club ${idx + 1}: ${name}. `;
            });
        }
        
        text += `End of favorites list. `;
        this.speak(text, true);
    },
    
    /**
     * Read error message
     */
    readError(errorMessage) {
        if (ttsMuted) return;
        const text = `Error: ${errorMessage}. Please try again.`;
        this.speak(text, false);
    },
    
    /**
     * Read success message
     */
    readSuccess(message) {
        if (ttsMuted) return;
        this.speak(message, false);
    },
    
    /**
     * Core speak function - enhanced version
     */
    speak(text, interrupt = true) {
        console.log('TTSManager.speak called with text length:', text?.length, 'interrupt:', interrupt);
        console.log('State - ttsMuted:', ttsMuted, 'userInteracted:', userInteracted);
        
        if (ttsMuted && !interrupt) {
            console.log('TTS muted and not interrupting, returning');
            return;
        }
        if (!text || text.trim() === '') {
            console.log('Empty text, returning');
            return;
        }
        
        if (!userInteracted) {
            console.warn('Speech synthesis requires user interaction - enabling anyway');
            userInteracted = true; // Enable for search results
        }
        
        if ('speechSynthesis' in window) {
            console.log('speechSynthesis available, creating utterance');
            if (interrupt && currentSpeech) {
                window.speechSynthesis.cancel();
            }
            
            setTimeout(() => {
                if (ttsMuted || !userInteracted) return;
                
                this.currentUtterance = new SpeechSynthesisUtterance(text);
                this.currentUtterance.rate = 0.9;
                this.currentUtterance.pitch = 1;
                this.currentUtterance.volume = 1;
                this.currentUtterance.lang = 'en-US';
                
                this.currentUtterance.onstart = () => {
                    this.isActive = true;
                    isReadingAloud = true;
                    const stopBtn = document.getElementById('stopBtn');
                    if (stopBtn) stopBtn.disabled = false;
                };
                
                this.currentUtterance.onend = () => {
                    this.currentUtterance = null;
                    this.isActive = false;
                    isReadingAloud = false;
                    currentSpeech = null;
                    const stopBtn = document.getElementById('stopBtn');
                    if (stopBtn) stopBtn.disabled = true;
                    
                    if (autoListening && recognition && !isRecording && !isRecognitionStarting && !isRecognitionStopping) {
                        if (restartTimeout) clearTimeout(restartTimeout);
                        restartTimeout = setTimeout(() => {
                            if (autoListening && !isRecording && !isReadingAloud && !isRecognitionStarting && !isRecognitionStopping && recognition) {
                                safeStartRecognition();
                            }
                        }, 1000);
                    }
                };
                
                this.currentUtterance.onerror = (event) => {
                    console.error('Speech synthesis error:', event.error);
                    this.currentUtterance = null;
                    this.isActive = false;
                    isReadingAloud = false;
                    currentSpeech = null;
                    const stopBtn = document.getElementById('stopBtn');
                    if (stopBtn) stopBtn.disabled = true;
                    
                    if (event.error === 'not-allowed') {
                        userInteracted = false;
                        updateStatus('Text-to-speech requires user interaction. Please click on the page.', 'error');
                    }
                };
                
                try {
                    console.log('Calling window.speechSynthesis.speak');
                    window.speechSynthesis.speak(this.currentUtterance);
                    currentSpeech = this.currentUtterance;
                    const stopBtn = document.getElementById('stopBtn');
                    if (stopBtn) stopBtn.disabled = false;
                    console.log('Speech synthesis started successfully');
                } catch (error) {
                    console.error('Error starting speech:', error);
                    this.isActive = false;
                    isReadingAloud = false;
                }
            }, interrupt ? 100 : 0);
        }
    }
};

// Main function to read all query results - NEW COMPREHENSIVE VERSION
function readResultsAloud() {
    console.log('readResultsAloud called');
    console.log('State check - isReadingAloud:', isReadingAloud, 'speaking:', window.speechSynthesis?.speaking, 'TTSManager.isActive:', TTSManager.isActive);
    
    // Prevent duplicate calls
    if (isReadingAloud || window.speechSynthesis?.speaking || TTSManager.isActive) {
        console.log('Already reading, skipping duplicate call');
        return;
    }
    
    if (!searchResults) {
        console.log('No searchResults available');
        TTSManager.speak('No results to read', false);
        return;
    }
    if (ttsMuted) {
        console.log('TTS is muted, not reading');
        return;
    }
    if (!userInteracted) {
        console.log('User not interacted yet, cannot read - setting userInteracted to true');
        userInteracted = true; // Auto-enable for search results
    }
    
    console.log('Calling TTSManager.readPlayerStats with searchResults:', searchResults);
    // Use the new comprehensive TTS manager
    TTSManager.readPlayerStats(searchResults);
}

function readInjuriesAloud(injuriesData) {
    if (ttsMuted || !userInteracted) return;
    if (!injuriesData || !injuriesData.injuries || injuriesData.injuries.length === 0) {
        TTSManager.speak('No injury history available for this player.', false);
        return;
    }
    
    let text = `Injury History Report. `;
    injuriesData.injuries.slice(0, 10).forEach((injury, index) => {
        const injuryType = injury.injury || injury.injuryType || injury.type || 'Unknown injury';
        const fromDate = injury.from_date || injury.fromDate || injury.startDate || 'Unknown date';
        const untilDate = injury.until_date || injury.untilDate || injury.endDate || 'Ongoing';
        const season = injury.season || '';
        const gamesMissed = injury.games_missed || injury.gamesMissed;
        
        text += `Injury ${index + 1}: ${injuryType}. `;
        text += `From ${fromDate} to ${untilDate}. `;
        if (season) text += `Season: ${season}. `;
        if (gamesMissed) text += `Games missed: ${gamesMissed}. `;
    });
    text += `End of injury history report. `;
    
    TTSManager.speak(text, true);
}

function readTransfersAloud(transfersData) {
    if (ttsMuted || !userInteracted) return;
    if (!transfersData || !transfersData.transfers || transfersData.transfers.length === 0) {
        TTSManager.speak('No transfer history available for this player.', false);
        return;
    }
    
    let text = `Transfer History Report. `;
    transfersData.transfers.slice(0, 10).forEach((transfer, index) => {
        const date = transfer.date || transfer.transferDate || 'Unknown date';
        const from = (transfer.club_from && transfer.club_from.name) || transfer.fromClub || transfer.from || 'Unknown club';
        const to = (transfer.club_to && transfer.club_to.name) || transfer.toClub || transfer.to || 'Unknown club';
        const fee = transfer.fee ? TTSManager.formatMarketValue(transfer.fee) : (transfer.transferFee || 'Free transfer');
        const season = transfer.season || '';
        
        text += `Transfer ${index + 1}: On ${date}. `;
        if (season) text += `Season: ${season}. `;
        text += `From ${from} to ${to}. `;
        text += `Transfer fee: ${fee}. `;
    });
    text += `End of transfer history report. `;
    
    TTSManager.speak(text, true);
}

function readAchievementsAloud(achievementsData) {
    if (ttsMuted || !userInteracted) return;
    if (!achievementsData || !achievementsData.achievements || achievementsData.achievements.length === 0) {
        TTSManager.speak('No achievements available for this player.', false);
        return;
    }
    
    let text = `Achievements and Honors Report. `;
    achievementsData.achievements.forEach((achievement, index) => {
        const title = achievement.title || achievement.name || 'Unknown achievement';
        const season = achievement.season || achievement.seasonId || '';
        
        text += `Achievement ${index + 1}: ${title}. `;
        if (season) text += `Season: ${season}. `;
    });
    text += `End of achievements report. `;
    
    TTSManager.speak(text, true);
}

function readMarketValueAloud(marketValueData) {
    if (ttsMuted || !userInteracted) return;
    if (!marketValueData || !marketValueData.marketValueHistory || marketValueData.marketValueHistory.length === 0) {
        TTSManager.speak('No market value history available for this player.', false);
        return;
    }
    
    let text = `Market Value History Report. `;
    marketValueData.marketValueHistory.slice(0, 10).forEach((mv, index) => {
        const date = mv.date || mv.dateStr || 'Unknown date';
        const value = mv.marketValue || mv.value || 0;
        const formatted = TTSManager.formatMarketValue(value);
        
        text += `On ${date}, market value was ${formatted}. `;
    });
    text += `End of market value history report. `;

    TTSManager.speak(text, true);
}

function stopReading() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        currentSpeech = null;
        isReadingAloud = false;
        ttsMuted = true; // Mute TTS when stopped
        TTSManager.isActive = false;
        TTSManager.currentUtterance = null;
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) stopBtn.disabled = true;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== TABS ====================
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Show corresponding content
            const targetContent = document.getElementById(`${targetTab}-tab`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

// ==================== CLUB PLAYERS ====================
async function loadClubPlayers(clubId) {
    try {
        const response = await fetch(`${PROXY_URL}/api/clubs/${clubId}/players`);
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.warn('Could not fetch club players:', e);
        return null;
    }
}

// Make functions available globally for onclick handlers
window.toggleFavorite = toggleFavorite;
window.removeFavorite = removeFavorite;
window.searchFavoritePlayer = searchFavoritePlayer;
window.viewFavoriteClub = viewFavoriteClub;
