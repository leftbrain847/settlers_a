/**
 * UI controller — ties Game + BoardRenderer together,
 * handles user interactions, modals, and display updates.
 */

(function () {
    // ---------------------------------------------------------------
    // Lobby
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    // Theme palettes
    // ---------------------------------------------------------------
    const themes = {
        midnight: {
            '--bg': '#1a1a2e', '--bg-panel': '#16213e', '--bg-card': '#0f3460',
            '--text': '#e0e0e0', '--text-dim': '#8899aa', '--accent': '#e94560',
            '--accent2': '#f39c12', '--success': '#2ecc71', '--border': '#2a3a5e',
            '--board-bg': 'radial-gradient(ellipse at center, #0d2147 0%, #091428 60%, #050d1a 100%)',
        },
        ocean: {
            '--bg': '#0b1628', '--bg-panel': '#0d2137', '--bg-card': '#134568',
            '--text': '#d6e8f0', '--text-dim': '#7ba3bd', '--accent': '#00b4d8',
            '--accent2': '#48cae4', '--success': '#06d6a0', '--border': '#1a4a6e',
            '--board-bg': 'radial-gradient(ellipse at center, #0a2540 0%, #061a2e 60%, #030f1a 100%)',
        },
        forest: {
            '--bg': '#1a2216', '--bg-panel': '#1e2e1a', '--bg-card': '#2a4020',
            '--text': '#d8e8d0', '--text-dim': '#8aaa7e', '--accent': '#e07e39',
            '--accent2': '#c5e063', '--success': '#4caf50', '--border': '#3a5a30',
            '--board-bg': 'radial-gradient(ellipse at center, #1e3a18 0%, #152a10 60%, #0a1a06 100%)',
        },
        sunset: {
            '--bg': '#2b1b1e', '--bg-panel': '#3a2025', '--bg-card': '#4a2a2f',
            '--text': '#f0ddd0', '--text-dim': '#b89080', '--accent': '#ff6b6b',
            '--accent2': '#ffa947', '--success': '#51cf66', '--border': '#5a3a3e',
            '--board-bg': 'radial-gradient(ellipse at center, #3a2028 0%, #2a1518 60%, #1a0a0c 100%)',
        },
        slate: {
            '--bg': '#1e1e2e', '--bg-panel': '#24243a', '--bg-card': '#2e2e4a',
            '--text': '#e0e0f0', '--text-dim': '#8888aa', '--accent': '#a78bfa',
            '--accent2': '#c4b5fd', '--success': '#34d399', '--border': '#3a3a5e',
            '--board-bg': 'radial-gradient(ellipse at center, #1e1e3a 0%, #141428 60%, #0a0a1a 100%)',
        },
        nord: {
            '--bg': '#2e3440', '--bg-panel': '#3b4252', '--bg-card': '#434c5e',
            '--text': '#eceff4', '--text-dim': '#8899aa', '--accent': '#bf616a',
            '--accent2': '#ebcb8b', '--success': '#a3be8c', '--border': '#4c566a',
            '--board-bg': 'radial-gradient(ellipse at center, #2e3440 0%, #252b36 60%, #1c2028 100%)',
        },
    };

    // ---------- Per-theme color palettes ----------
    // Each theme defines terrain hex fills, resource UI colors, and player colors.
    // Terrain and resource colors are linked: the hex tile color for "hills" matches
    // the --clay variable so the board and sidebar feel like one unified palette.
    //
    // Design goal: you should be able to glance at a screenshot and instantly
    // know which theme is active. No two themes share the same hue mapping.

    // Terrain hex fill colors (drawn on the SVG board)
    const themeTerrain = {
        midnight: null,  // use server defaults: red clay, green wood, gray rock, gold wheat, emerald sheep, tan desert
        // Ocean: coral reef, deep teal forest, navy mountains, sandy gold, turquoise pastures, bright sand
        ocean:    { hills: '#FF7F6B', forest: '#006D6F', mountains: '#344E6A', fields: '#D4A030', pasture: '#20B2AA', desert: '#FFF0D0' },
        // Forest: burnt orange clay, deep pine, warm stone, harvest gold, olive meadow, dry straw
        forest:   { hills: '#CC5500', forest: '#2D4A22', mountains: '#7A6A5A', fields: '#CC8800', pasture: '#6B7A35', desert: '#D8C89A' },
        // Sunset: hot pink clay, deep jade forest, dusty purple mountains, bright orange, spring green, warm peach
        sunset:   { hills: '#D83060', forest: '#0A7A58', mountains: '#7A5A80', fields: '#E89020', pasture: '#38A848', desert: '#FFE0C0' },
        // Slate: wine red, cool jade, blue-slate mountains, bronze, teal pasture, silver sand
        slate:    { hills: '#8A4050', forest: '#2A7A68', mountains: '#5A5A8A', fields: '#9A8020', pasture: '#3A8A7A', desert: '#B0B0C8' },
        // Nord: official Nord palette — salmon, sage, steel blue, warm tan, frost teal, snow
        nord:     { hills: '#BF616A', forest: '#A3BE8C', mountains: '#81A1C1', fields: '#EBCB8B', pasture: '#8FBCBB', desert: '#D8DEE9' },
    };

    // Player piece colors — each palette tells a different story
    const themePlayerColors = {
        midnight: null,  // server defaults: red, blue, white, orange, purple, teal
        // Ocean: tropical reef — coral, turquoise, sand, deep violet, hot pink, lime
        ocean:    ['#FF6B6B', '#00CEC9', '#FFEAA7', '#6C5CE7', '#FD79A8', '#55EFC4'],
        // Forest: earthy naturals — terracotta, teal, goldenrod, plum, olive, rust
        forest:   ['#E76F51', '#2A9D8F', '#E9C46A', '#7B2D8E', '#606C38', '#D62828'],
        // Sunset: vivid neon — hot pink, electric yellow, deep purple, tangerine, mint, cobalt
        sunset:   ['#FF006E', '#FFBE0B', '#8338EC', '#FB5607', '#3BCEAC', '#0077B6'],
        // Slate: cyberpunk glow — cyan, magenta, acid green, coral, lavender, gold
        slate:    ['#00F5FF', '#FF10F0', '#39FF14', '#FF6F61', '#BF5AF2', '#FFD60A'],
        // Nord: muted Scandinavian — salmon, steel blue, snow, peach, mauve, frost
        nord:     ['#BF616A', '#5E81AC', '#ECEFF4', '#D08770', '#B48EAD', '#88C0D0'],
    };

    // Resource UI colors [bright, dim] — matched to terrain hex fills above so
    // the "Clay" resource card looks like the "Hills" hex on the board.
    const themeResourceColors = {
        midnight: null,  // CSS defaults
        ocean:    { clay: ['#FF7F6B', '#B85A48'], wood: ['#009A9A', '#006060'], rock: ['#4A6A8A', '#304860'], wheat: ['#D4A030', '#906A18'], sheep: ['#20B2AA', '#147A72'] },
        forest:   { clay: ['#CC5500', '#8A3A00'], wood: ['#3A6030', '#243E1A'], rock: ['#7A6A5A', '#504538'], wheat: ['#CC8800', '#8A5A00'], sheep: ['#6B7A35', '#485220'] },
        sunset:   { clay: ['#D83060', '#901838'], wood: ['#0A7A58', '#065038'], rock: ['#7A5A80', '#503858'], wheat: ['#E89020', '#A06010'], sheep: ['#38A848', '#207030'] },
        slate:    { clay: ['#8A4050', '#5A2830'], wood: ['#2A7A68', '#185048'], rock: ['#5A5A8A', '#3A3A60'], wheat: ['#9A8020', '#685510'], sheep: ['#3A8A7A', '#205A50'] },
        nord:     { clay: ['#BF616A', '#8A3A42'], wood: ['#A3BE8C', '#6A8A5A'], rock: ['#81A1C1', '#506A8A'], wheat: ['#EBCB8B', '#A08850'], sheep: ['#8FBCBB', '#5A8A88'] },
    };

    let currentThemePlayerColors = null;

    document.getElementById('theme-select').addEventListener('change', (e) => {
        const themeName = e.target.value;
        const theme = themes[themeName];
        if (!theme) return;
        const root = document.documentElement;
        for (const [key, value] of Object.entries(theme)) {
            if (key === '--board-bg') continue;
            root.style.setProperty(key, value);
        }
        // Apply board background
        const boardArea = document.querySelector('.board-area');
        if (boardArea && theme['--board-bg']) {
            boardArea.style.background = theme['--board-bg'];
        }
        // Apply terrain color overrides
        const tc = themeTerrain[themeName] || null;
        BoardRenderer.setThemeTerrainColors(tc);
        // Apply resource color overrides
        const rc = themeResourceColors[themeName];
        const defaultRes = { clay: ['#c0392b','#a0341c'], wood: ['#1a7a42','#14582e'], rock: ['#7f8c8d','#4a545a'], wheat: ['#c9a800','#8a7200'], sheep: ['#2ecc71','#1a8a4a'] };
        const resTheme = rc || defaultRes;
        for (const [res, [color, dim]] of Object.entries(resTheme)) {
            root.style.setProperty('--' + res, color);
            root.style.setProperty('--' + res + '-dim', dim);
        }
        // Store player color overrides
        currentThemePlayerColors = themePlayerColors[themeName] || null;
        // Re-render if game is active
        if (Game.getState()) renderAll();
    });

    const btnStart = document.getElementById('btn-start-game');
    const btnJoin = document.getElementById('btn-join-game');

    // Settings toggle
    document.getElementById('settings-toggle').addEventListener('click', () => {
        const panel = document.getElementById('settings-panel');
        const arrow = document.getElementById('toggle-arrow');
        const visible = panel.style.display !== 'none';
        panel.style.display = visible ? 'none' : 'flex';
        arrow.classList.toggle('open', !visible);
    });

    // Reset to defaults button
    document.getElementById('btn-reset-defaults').addEventListener('click', () => {
        document.getElementById('setting-vp').value = 10;
        document.getElementById('setting-rings').value = 3;
        document.getElementById('setting-starting-res').value = 'none';
        document.getElementById('setting-friendly-robber').checked = false;
        document.getElementById('setting-discard-threshold').value = 7;
        document.getElementById('setting-max-roads').value = 15;
        document.getElementById('setting-max-settlements').value = 5;
        document.getElementById('setting-max-cities').value = 4;
        document.getElementById('setting-dev-knight').value = 14;
        document.getElementById('setting-dev-road-building').value = 2;
        document.getElementById('setting-dev-year-of-plenty').value = 2;
        document.getElementById('setting-dev-monopoly').value = 2;
        document.getElementById('setting-dev-victory-point').value = 5;
        document.getElementById('setting-port-generic').value = 4;
        document.getElementById('setting-port-clay').value = 1;
        document.getElementById('setting-port-wood').value = 1;
        document.getElementById('setting-port-rock').value = 1;
        document.getElementById('setting-port-wheat').value = 1;
        document.getElementById('setting-port-sheep').value = 1;
        document.getElementById('setting-trade-timer').value = 10;
        document.getElementById('setting-counter-timer').value = 15;
        updateRingsLabel();
    });

    // Board rings slider — live hex count display
    const ringsSlider = document.getElementById('setting-rings');
    const ringsLabel = document.getElementById('rings-label');
    function updateRingsLabel() {
        const n = parseInt(ringsSlider.value);
        const hexCount = 3 * n * (n - 1) + 1;
        ringsLabel.textContent = `${n} rings — ${hexCount} hexes`;
    }
    ringsSlider.addEventListener('input', updateRingsLabel);
    updateRingsLabel();

    let isHost = false;

    // Helper: build a shareable join URL
    async function getJoinUrl(gid) {
        try {
            const resp = await fetch('/api/server-info');
            const info = await resp.json();
            if (info.public_url) {
                return `${info.public_url}?join=${gid}`;
            }
        } catch (e) { /* ignore */ }
        return `${location.origin}?join=${gid}`;
    }

    // Helper: enter game screen (called when game actually starts)
    async function enterGame(gid) {
        document.getElementById('waiting-room').classList.remove('active');
        document.getElementById('game').classList.add('active');
        BoardRenderer.init(document.getElementById('board-svg'));

        // Show copyable game ID in top bar
        const display = document.getElementById('game-id-display');
        const url = await getJoinUrl(gid);
        display.innerHTML = '';
        const link = document.createElement('span');
        link.textContent = `ID: ${gid}`;
        link.style.cursor = 'pointer';
        link.title = 'Click to copy join link';
        link.addEventListener('click', () => {
            navigator.clipboard.writeText(url).then(() => {
                link.textContent = 'Link copied!';
                setTimeout(() => { link.textContent = `ID: ${gid}`; }, 2000);
            });
        });
        display.appendChild(link);
    }

    // Helper: show the waiting room
    async function enterWaitingRoom(gid, players) {
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('waiting-room').classList.add('active');

        // Show/hide host controls
        const btnBegin = document.getElementById('btn-begin-game');
        const statusText = document.getElementById('waiting-room-status');
        if (isHost) {
            btnBegin.style.display = '';
            statusText.style.display = 'none';
        } else {
            btnBegin.style.display = 'none';
            statusText.style.display = '';
        }

        // Show join link
        const url = await getJoinUrl(gid);
        document.getElementById('waiting-room-url').textContent = url;
        document.getElementById('btn-copy-link').addEventListener('click', () => {
            navigator.clipboard.writeText(url).then(() => {
                document.getElementById('btn-copy-link').textContent = 'Copied!';
                setTimeout(() => { document.getElementById('btn-copy-link').textContent = 'Copy'; }, 2000);
            });
        });

        // Render initial player list
        renderWaitingRoomPlayers(players);

        // Connect WebSocket (receives lobby_update and state_update messages)
        await Game.connectWebSocket(onGameUpdate);
    }

    function renderWaitingRoomPlayers(players) {
        const list = document.getElementById('waiting-room-player-list');
        list.innerHTML = '';
        for (const p of players) {
            const div = document.createElement('div');
            div.className = 'waiting-room-player';
            const isMe = p.id === Game.getPlayerId();
            let tag = '';
            if (p.is_ai) tag = '<span class="player-tag">Bot</span>';
            else if (isMe) tag = '<span class="player-tag">You</span>';
            div.innerHTML = `
                <span class="player-color-dot" style="background:${remapPlayerColor(p.color)}"></span>
                <span class="player-label">${p.name}</span>
                ${tag}
            `;
            list.appendChild(div);
        }
    }

    function renderWaitingRoomSettings(settings) {
        const container = document.getElementById('waiting-room-settings');
        const list = document.getElementById('waiting-room-settings-list');
        if (!settings || Object.keys(settings).length === 0) {
            container.style.display = 'none';
            return;
        }
        container.style.display = '';

        const lines = [];
        if (settings.vp_to_win) lines.push(`Victory Points: <b>${settings.vp_to_win}</b>`);
        if (settings.board_rings) lines.push(`Board Size: <b>${settings.board_rings} rings</b>`);
        if (settings.starting_resources && settings.starting_resources !== 'none')
            lines.push(`Starting Resources: <b>${settings.starting_resources}</b>`);
        if (settings.friendly_robber) lines.push(`Friendly Robber: <b>On</b>`);
        if (settings.discard_threshold) lines.push(`Discard Threshold: <b>${settings.discard_threshold}</b>`);
        if (settings.trade_timer) lines.push(`Trade Timer: <b>${settings.trade_timer}s</b>`);
        if (settings.counter_timer) lines.push(`Counter Timer: <b>${settings.counter_timer}s</b>`);
        if (settings.max_roads) lines.push(`Roads: <b>${settings.max_roads}</b>`);
        if (settings.max_settlements) lines.push(`Settlements: <b>${settings.max_settlements}</b>`);
        if (settings.max_cities) lines.push(`Cities: <b>${settings.max_cities}</b>`);

        list.innerHTML = lines.join('<br>');
    }

    // --- Create Game (host) ---
    btnStart.addEventListener('click', async () => {
        const name = document.getElementById('player-name').value || 'Player 1';
        const numAI = parseInt(document.getElementById('num-ai').value);

        const settings = {
            vp_to_win: parseInt(document.getElementById('setting-vp').value) || 10,
            board_rings: parseInt(document.getElementById('setting-rings').value) || 3,
            starting_resources: document.getElementById('setting-starting-res').value,
            friendly_robber: document.getElementById('setting-friendly-robber').checked,
            discard_threshold: parseInt(document.getElementById('setting-discard-threshold').value) || 7,
            max_roads: parseInt(document.getElementById('setting-max-roads').value) || 15,
            max_settlements: parseInt(document.getElementById('setting-max-settlements').value) || 5,
            max_cities: parseInt(document.getElementById('setting-max-cities').value) || 4,
            dev_cards: {
                knight: parseInt(document.getElementById('setting-dev-knight').value) || 0,
                road_building: parseInt(document.getElementById('setting-dev-road-building').value) || 0,
                year_of_plenty: parseInt(document.getElementById('setting-dev-year-of-plenty').value) || 0,
                monopoly: parseInt(document.getElementById('setting-dev-monopoly').value) || 0,
                victory_point: parseInt(document.getElementById('setting-dev-victory-point').value) || 0,
            },
            port_counts: {
                generic: parseInt(document.getElementById('setting-port-generic').value) || 0,
                clay_port: parseInt(document.getElementById('setting-port-clay').value) || 0,
                wood_port: parseInt(document.getElementById('setting-port-wood').value) || 0,
                rock_port: parseInt(document.getElementById('setting-port-rock').value) || 0,
                wheat_port: parseInt(document.getElementById('setting-port-wheat').value) || 0,
                sheep_port: parseInt(document.getElementById('setting-port-sheep').value) || 0,
            },
            trade_timer: parseInt(document.getElementById('setting-trade-timer').value) || 10,
            counter_timer: parseInt(document.getElementById('setting-counter-timer').value) || 15,
        };

        btnStart.disabled = true;
        btnStart.textContent = 'Creating...';

        try {
            isHost = true;
            const data = await Game.createGame(name, numAI, settings);
            await enterWaitingRoom(Game.getGameId(), data.players);
        } catch (e) {
            console.error(e);
            btnStart.disabled = false;
            btnStart.textContent = 'Start Game';
        }
    });

    // --- "Begin Game" button in waiting room (host only) ---
    document.getElementById('btn-begin-game').addEventListener('click', async () => {
        const btn = document.getElementById('btn-begin-game');
        btn.disabled = true;
        btn.textContent = 'Starting...';
        try {
            await Game.startGame();
        } catch (e) {
            console.error(e);
            btn.disabled = false;
            btn.textContent = 'Begin Game';
        }
    });

    // --- Join Game ---
    btnJoin.addEventListener('click', async () => {
        const gid = document.getElementById('join-game-id').value.trim();
        const name = document.getElementById('player-name').value || 'Player';
        if (!gid) return;

        try {
            isHost = false;
            const data = await Game.joinGame(gid, name);
            // Build player list from the join response (we only know our own info)
            // The WebSocket init or lobby_update will give us the full list
            await enterWaitingRoom(gid, []);
        } catch (e) {
            console.error(e);
        }
    });

    // Auto-join from URL parameter: ?join=GAME_ID
    (async function checkUrlJoin() {
        const params = new URLSearchParams(location.search);
        const joinId = params.get('join');
        if (!joinId) return;

        document.getElementById('join-game-id').value = joinId;
        document.getElementById('player-name').focus();
        document.getElementById('player-name').placeholder = 'Enter your name to join';

        const subtitle = document.querySelector('#lobby .subtitle');
        if (subtitle) subtitle.textContent = `Joining game ${joinId.slice(0, 8)}...`;
    })();

    // ---------------------------------------------------------------
    // Game update handler
    // ---------------------------------------------------------------

    let prevState = null;

    function onGameUpdate(type, data) {
        if (type === 'lobby_update') {
            renderWaitingRoomPlayers(data.players);
            if (data.settings) renderWaitingRoomSettings(data.settings);
        }
        else if (type === 'init') {
            const state = Game.getState();
            if (state && state.phase === 'lobby') {
                // Still in lobby — populate waiting room from init state
                const players = state.player_order.map(pid => {
                    const p = state.players[pid];
                    return { id: pid, name: p.name, color: p.color, is_ai: false };
                });
                renderWaitingRoomPlayers(players);
            } else {
                // Game already started (e.g. reconnecting or host just started)
                const config = Game.getConfig();
                enterGame(Game.getGameId());
                BoardRenderer.setTerrainColors(config);
                renderAll();
            }
        }
        else if (type === 'state_update') {
            const newState = Game.getState();
            // Transition from waiting room to game screen when game starts
            if (newState && newState.phase !== 'lobby' && !document.getElementById('game').classList.contains('active')) {
                const config = Game.getConfig();
                enterGame(Game.getGameId());
                BoardRenderer.setTerrainColors(config);
            }
            checkNotifications(prevState, newState);
            prevState = newState ? JSON.parse(JSON.stringify(newState)) : null;
            renderAll();
            checkModals();
        }
        else if (type === 'error') {
            addLog(`Error: ${data}`);
        }
        else if (type === 'disconnected') {
            addLog('Disconnected from server.');
        }
    }

    // ---------------------------------------------------------------
    // Notifications
    // ---------------------------------------------------------------

    function showNotification(text, type) {
        const banner = document.getElementById('notification-banner');
        const div = document.createElement('div');
        div.className = 'notif ' + (type || '');
        div.textContent = text;
        banner.appendChild(div);
        setTimeout(() => div.remove(), 3200);
    }

    function checkNotifications(prev, next) {
        if (!next) return;

        // Robber activated — a 7 was rolled and it's your turn
        if (next.pending_robber_move && Game.isMyTurn()) {
            if (!prev || !prev.pending_robber_move) {
                showNotification('A 7 was rolled! Move the robber to a new hex.', 'robber');
            }
        }

        // Discard needed
        if (next.pending_discards && next.pending_discards[Game.getPlayerId()]) {
            if (!prev || !prev.pending_discards || !prev.pending_discards[Game.getPlayerId()]) {
                const count = next.pending_discards[Game.getPlayerId()];
                showNotification('You must discard ' + count + ' cards!', 'warning');
            }
        }
    }

    function renderAll() {
        const state = Game.getState();
        const config = Game.getConfig();
        if (!state) return;

        renderBoard(state, config);
        renderPlayers(state);
        renderResources(state);
        renderActions(state);
        renderDevCards(state);
        renderBankTrades(state);
        renderTopBar(state);
        renderLog(state);
        checkWinner(state);
        // Update proposer's trade response display if active
        if (activeSentTradeId) updateTradeResponsesDisplay();
    }

    // ---------------------------------------------------------------
    // Board rendering
    // ---------------------------------------------------------------

    // Server-side color palette (must match engine/engine.py PLAYER_COLORS)
    const SERVER_PLAYER_COLORS = ["#e74c3c", "#3498db", "#ecf0f1", "#f39c12", "#9b59b6", "#1abc9c"];

    function remapPlayerColor(serverColor) {
        if (!currentThemePlayerColors) return serverColor;
        const idx = SERVER_PLAYER_COLORS.indexOf(serverColor);
        if (idx >= 0 && idx < currentThemePlayerColors.length) {
            return currentThemePlayerColors[idx];
        }
        return serverColor;
    }

    function renderBoard(state, config) {
        // Enrich board data with player colors for buildings
        const boardData = JSON.parse(JSON.stringify(state.board));

        // Set player colors on buildings (with theme remapping)
        for (const [iid, inter] of Object.entries(boardData.intersections)) {
            if (inter.building) {
                inter.building.player = remapPlayerColor(Game.getPlayerColor(inter.building.player));
            }
        }
        for (const [eid, edge] of Object.entries(boardData.edges)) {
            if (edge.building) {
                edge.building.player = remapPlayerColor(Game.getPlayerColor(edge.building.player));
            }
        }

        BoardRenderer.render(boardData, config, {
            onHexClick: handleHexClick,
            onIntersectionClick: handleIntersectionClick,
            onEdgeClick: handleEdgeClick,
        });

        // If in build mode, highlight legal locations
        const buildMode = Game.getBuildMode();
        if (buildMode === 'settlement') {
            BoardRenderer.highlightIntersections(Game.getLegalBuildLocations('settlement'));
        } else if (buildMode === 'city') {
            BoardRenderer.highlightIntersections(Game.getLegalBuildLocations('city'));
        } else if (buildMode === 'road') {
            BoardRenderer.highlightEdges(Game.getLegalBuildLocations('road'));
        }

        // Highlight robber-movable hexes
        const state2 = Game.getState();
        if (state2 && state2.pending_robber_move && Game.isMyTurn()) {
            BoardRenderer.highlightHexes(Game.getLegalRobberHexes());
        }
    }

    // ---------------------------------------------------------------
    // Click handlers
    // ---------------------------------------------------------------

    function handleHexClick(hexId) {
        const state = Game.getState();
        if (state && state.pending_robber_move && Game.isMyTurn()) {
            Game.moveRobber(hexId);
            return;
        }
    }

    function handleIntersectionClick(iid) {
        const buildMode = Game.getBuildMode();
        if (buildMode === 'settlement') {
            const legal = Game.getLegalBuildLocations('settlement');
            if (legal.includes(iid)) {
                Game.buildSettlement(iid);
                Game.exitBuildMode();
            }
        } else if (buildMode === 'city') {
            const legal = Game.getLegalBuildLocations('city');
            if (legal.includes(iid)) {
                Game.buildCity(iid);
                Game.exitBuildMode();
            }
        } else {
            // During setup, auto-detect what's needed
            const state = Game.getState();
            if (state && state.phase === 'setup' && Game.isMyTurn()) {
                const settlementLocs = Game.getLegalBuildLocations('settlement');
                if (settlementLocs.includes(iid)) {
                    Game.buildSettlement(iid);
                }
            }
        }
    }

    function handleEdgeClick(eid) {
        const buildMode = Game.getBuildMode();
        if (buildMode === 'road') {
            const legal = Game.getLegalBuildLocations('road');
            if (legal.includes(eid)) {
                Game.buildRoad(eid);
                Game.exitBuildMode();
            }
        } else {
            // During setup, auto-build road
            const state = Game.getState();
            if (state && state.phase === 'setup' && Game.isMyTurn()) {
                const roadLocs = Game.getLegalBuildLocations('road');
                if (roadLocs.includes(eid)) {
                    Game.buildRoad(eid);
                }
            }
            // Free roads from road building card
            const pendingAction = state ? state.pending_action : null;
            if (pendingAction && pendingAction.type === 'build_free_roads') {
                const freeRoadLocs = Game.getLegalActions()
                    .filter(a => a.type === 'dev_card_action' && a.location >= 0)
                    .map(a => a.location);
                if (freeRoadLocs.includes(eid)) {
                    Game.devCardAction({ location: eid });
                }
            }
        }
    }

    // ---------------------------------------------------------------
    // Players panel
    // ---------------------------------------------------------------

    function renderPlayers(state) {
        const panel = document.getElementById('players-panel');
        panel.innerHTML = '<div class="panel-title">Players</div>';

        for (const pid of state.player_order) {
            const p = state.players[pid];
            const isMe = pid === Game.getPlayerId();
            const isCurrent = state.phase === 'setup'
                ? state.player_order[state.setup.player_idx] === pid
                : state.current_player === pid;

            const card = document.createElement('div');
            card.className = 'player-card' + (isCurrent ? ' current-turn' : '') + (isMe ? ' is-you' : '');

            let resourceHTML = '';
            if (isMe && p.resources) {
                for (const [res, count] of Object.entries(p.resources)) {
                    if (count > 0) {
                        resourceHTML += `<span class="resource-badge ${res}">${count}</span>`;
                    }
                }
            } else if (p.resource_count !== undefined) {
                resourceHTML = `<span style="font-size:0.8em;color:var(--text-dim);">${p.resource_count} cards</span>`;
            }

            let achieveHTML = '';
            if (p.achievements && p.achievements.length > 0) {
                for (const a of p.achievements) {
                    const name = a.replace('_', ' ');
                    achieveHTML += `<span class="achievement-badge">${name}</span>`;
                }
            }

            // Build stats line: knights, settlements, cities, roads, dev cards
            const knightsPlayed = (p.played_dev_cards || []).filter(c => c === 'knight').length;
            const settlements = (p.buildings_placed || {}).settlement || 0;
            const cities = (p.buildings_placed || {}).city || 0;
            const roads = (p.buildings_placed || {}).road || 0;
            const devCards = isMe ? (p.dev_cards || []).length : (p.dev_card_count || 0);

            const cfg = Game.getConfig();
            const maxSettlements = cfg && cfg.building_types && cfg.building_types.settlement ? cfg.building_types.settlement.max_per_player : 5;
            const maxCities = cfg && cfg.building_types && cfg.building_types.city ? cfg.building_types.city.max_per_player : 4;
            const maxRoads = cfg && cfg.building_types && cfg.building_types.road ? cfg.building_types.road.max_per_player : 15;

            let statsHTML = '<div class="player-stats">';
            statsHTML += `<span title="Settlements">${settlements}/${maxSettlements} stl</span>`;
            statsHTML += `<span title="Cities">${cities}/${maxCities} cty</span>`;
            statsHTML += `<span title="Roads">${roads}/${maxRoads} rd</span>`;
            if (knightsPlayed > 0) {
                statsHTML += `<span title="Knights played" class="stat-knights">${knightsPlayed} knt</span>`;
            }
            statsHTML += `<span title="Dev cards held">${devCards} dev</span>`;
            statsHTML += '</div>';

            card.innerHTML = `
                <div class="player-name">
                    <span class="player-color-dot" style="background:${remapPlayerColor(p.color)}"></span>
                    ${p.name}${isMe ? ' (You)' : ''}
                    ${isCurrent ? ' ◄' : ''}
                </div>
                <div class="player-vp">${p.vp} VP</div>
                <div class="player-resources">${resourceHTML}</div>
                ${achieveHTML ? `<div class="player-achievements">${achieveHTML}</div>` : ''}
                ${statsHTML}
            `;

            panel.appendChild(card);
        }
    }

    // ---------------------------------------------------------------
    // Resources display
    // ---------------------------------------------------------------

    function renderResources(state) {
        const container = document.getElementById('your-resources');
        const me = state.players[Game.getPlayerId()];
        if (!me || !me.resources) { container.innerHTML = ''; return; }

        const config = Game.getConfig();
        const resourceList = config ? Object.keys(config.resource_types) : Object.keys(me.resources);
        const colorMap = {
            clay: 'var(--clay)', wood: 'var(--wood)', rock: 'var(--rock)',
            wheat: 'var(--wheat)', sheep: 'var(--sheep)',
        };

        container.innerHTML = resourceList.map(res => {
            const displayName = res.charAt(0).toUpperCase() + res.slice(1);
            return `
            <div class="resource-card" style="border-color:${colorMap[res] || 'var(--border)'}">
                <div class="count" style="color:${colorMap[res] || 'var(--text)'}">${me.resources[res] || 0}</div>
                <div class="label">${displayName}</div>
            </div>
        `;
        }).join('');
    }

    // ---------------------------------------------------------------
    // Action buttons
    // ---------------------------------------------------------------

    function renderActions(state) {
        const container = document.getElementById('action-buttons');
        container.innerHTML = '';

        const isSetup = state.phase === 'setup';
        const myTurn = Game.isMyTurn();

        // During setup, show guidance
        if (isSetup) {
            if (myTurn) {
                const settlementLocs = Game.getLegalBuildLocations('settlement');
                const roadLocs = Game.getLegalBuildLocations('road');
                if (settlementLocs.length > 0) {
                    addInfoText(container, 'Click a highlighted spot to place your settlement');
                    BoardRenderer.highlightIntersections(settlementLocs);
                } else if (roadLocs.length > 0) {
                    addInfoText(container, 'Click an edge to place your road');
                    BoardRenderer.highlightEdges(roadLocs);
                }
            } else {
                addInfoText(container, 'Waiting for other players...');
            }
            return;
        }

        if (!myTurn) {
            // Check for trade offers I can respond to
            const tradeActions = Game.getLegalActions().filter(a => a.type === 'trade_accept');
            if (tradeActions.length > 0) {
                addInfoText(container, 'You have incoming trade offers!');
            } else {
                addInfoText(container, 'Waiting for your turn...');
            }
            return;
        }

        // Pending discard
        if (Game.getPlayerId() in (state.pending_discards || {})) {
            addInfoText(container, 'You must discard cards');
            return;
        }

        // Pending robber
        if (state.pending_robber_move) {
            addInfoText(container, 'Move the robber — click a hex');
            BoardRenderer.highlightHexes(Game.getLegalRobberHexes());
            return;
        }

        // Pending steal
        if (state.pending_robber_steal) {
            const targets = Game.getLegalStealTargets();
            addInfoText(container, 'Choose a player to steal from:');
            for (const target of targets) {
                const p = state.players[target];
                addActionBtn(container, `Steal from ${p.name}`, () => Game.steal(target));
            }
            return;
        }

        // Pending dev card action
        if (state.pending_action) {
            handlePendingAction(container, state.pending_action);
            return;
        }

        // Normal turn actions
        if (Game.canDoAction('roll_dice')) {
            addActionBtn(container, 'Roll Dice', () => Game.rollDice(), 'btn-primary');
        }

        if (Game.canDoAction('end_turn')) {
            // Build buttons
            if (Game.getLegalBuildLocations('settlement').length > 0) {
                addActionBtn(container, 'Build Settlement', () => {
                    Game.enterBuildMode('settlement');
                    BoardRenderer.highlightIntersections(Game.getLegalBuildLocations('settlement'));
                    renderActions(Game.getState());
                }, '', costDots({ clay: 1, wood: 1, wheat: 1, sheep: 1 }));
            }

            if (Game.getLegalBuildLocations('city').length > 0) {
                addActionBtn(container, 'Build City', () => {
                    Game.enterBuildMode('city');
                    BoardRenderer.highlightIntersections(Game.getLegalBuildLocations('city'));
                    renderActions(Game.getState());
                }, '', costDots({ rock: 3, wheat: 2 }));
            }

            if (Game.getLegalBuildLocations('road').length > 0) {
                addActionBtn(container, 'Build Road', () => {
                    Game.enterBuildMode('road');
                    BoardRenderer.highlightEdges(Game.getLegalBuildLocations('road'));
                    renderActions(Game.getState());
                }, '', costDots({ clay: 1, wood: 1 }));
            }

            if (Game.canDoAction('buy_dev_card')) {
                addActionBtn(container, 'Buy Dev Card', () => Game.buyDevCard(), '',
                    costDots({ rock: 1, wheat: 1, sheep: 1 }));
            }

            if (Game.canDoAction('trade_offer')) {
                addActionBtn(container, 'Trade with Players', () => showTradeOfferModal());
            }

            addActionBtn(container, 'End Turn', () => Game.endTurn(), 'btn-secondary');
        }

        // Cancel build mode
        if (Game.getBuildMode()) {
            container.innerHTML = '';
            addInfoText(container, `Placing ${Game.getBuildMode()} — click on a highlighted spot`);
            addActionBtn(container, 'Cancel', () => {
                Game.exitBuildMode();
                renderAll();
            }, 'btn-secondary');
        }
    }

    function handlePendingAction(container, pa) {
        if (pa.type === 'choose_resources') {
            showResourcePickerModal(pa.count, (resources) => {
                Game.devCardAction({ resources });
            });
            addInfoText(container, `Choose ${pa.count} resources (see popup)`);
        }
        else if (pa.type === 'choose_monopoly_resource') {
            showMonopolyModal();
            addInfoText(container, 'Choose a resource for Monopoly (see popup)');
        }
        else if (pa.type === 'build_free_roads') {
            // Free road legal locations come as dev_card_action with location field
            const freeRoadActions = Game.getLegalActions().filter(a => a.type === 'dev_card_action' && a.location >= 0);
            const roadLocs = freeRoadActions.map(a => a.location);
            addInfoText(container, `Place free road (${pa.remaining} remaining) — click an edge`);
            if (roadLocs.length > 0) {
                BoardRenderer.highlightEdges(roadLocs);
            } else {
                addInfoText(container, 'No legal road locations — skipping remaining free roads');
                Game.devCardAction({ location: -1, skip: true });
            }
        }
    }

    function addActionBtn(container, text, onClick, extraClass, costHTML) {
        const btn = document.createElement('button');
        btn.className = 'action-btn ' + (extraClass || '');
        btn.innerHTML = text + (costHTML || '');
        btn.addEventListener('click', onClick);
        container.appendChild(btn);
    }

    function addInfoText(container, text) {
        const div = document.createElement('div');
        div.style.cssText = 'color: var(--text-dim); font-size: 0.85em; padding: 4px 0;';
        div.textContent = text;
        container.appendChild(div);
    }

    function costDots(cost) {
        const colorMap = {
            clay: 'var(--clay)', wood: 'var(--wood)', rock: 'var(--rock)',
            wheat: 'var(--wheat)', sheep: 'var(--sheep)',
        };
        let html = '<span class="cost">';
        for (const [res, count] of Object.entries(cost)) {
            for (let i = 0; i < count; i++) {
                html += `<span class="cost-dot" style="background:${colorMap[res] || '#666'}"></span>`;
            }
        }
        html += '</span>';
        return html;
    }

    // ---------------------------------------------------------------
    // Dev cards display
    // ---------------------------------------------------------------

    function renderDevCards(state) {
        const section = document.getElementById('dev-cards-section');
        const list = document.getElementById('dev-cards-list');
        const me = state.players[Game.getPlayerId()];

        if (!me || !me.dev_cards || me.dev_cards.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        list.innerHTML = '';

        // Count cards by type
        const counts = {};
        for (const card of me.dev_cards) {
            counts[card] = (counts[card] || 0) + 1;
        }

        for (const [cardType, count] of Object.entries(counts)) {
            const config = Game.getConfig();
            const cardConfig = config && config.building_types ? null : null; // dev cards aren't in building_types
            const name = cardType.replace(/_/g, ' ');
            const canPlay = Game.getLegalActions().some(a => a.type === 'play_dev_card' && a.card_type === cardType);

            const item = document.createElement('div');
            item.className = 'dev-card-item';
            item.textContent = `${name} (x${count})`;
            if (canPlay) {
                item.style.cursor = 'pointer';
                item.style.borderColor = 'var(--accent2)';
                item.addEventListener('click', () => Game.playDevCard(cardType));
            } else {
                item.style.opacity = '0.6';
            }
            list.appendChild(item);
        }
    }

    // ---------------------------------------------------------------
    // Bank trade display
    // ---------------------------------------------------------------

    function renderBankTrades(state) {
        const area = document.getElementById('bank-trade-area');
        const trades = Game.getLegalBankTrades();

        if (trades.length === 0) {
            area.innerHTML = '<span style="font-size:0.8em;color:var(--text-dim);">No bank trades available</span>';
            return;
        }

        // Group by give_resource
        const byGive = {};
        for (const t of trades) {
            if (!byGive[t.give_resource]) byGive[t.give_resource] = [];
            byGive[t.give_resource].push(t.want_resource);
        }

        area.innerHTML = '';
        for (const [give, wants] of Object.entries(byGive)) {
            const me = state.players[Game.getPlayerId()];
            // Determine ratio
            let ratio = 4; // default
            if (me.ports) {
                const config = Game.getConfig();
                for (const portId of me.ports) {
                    const pt = config.port_types ? config.port_types[portId] : null;
                    if (pt) {
                        if (!pt.resource) ratio = Math.min(ratio, pt.ratio);
                        else if (pt.resource === give) ratio = Math.min(ratio, pt.ratio);
                    }
                }
            }

            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom:6px;';
            row.innerHTML = `<span style="font-size:0.8em;color:var(--text-dim);">Give ${ratio} ${give} for:</span>`;

            const btns = document.createElement('div');
            btns.style.cssText = 'display:flex;gap:4px;margin-top:3px;flex-wrap:wrap;';
            for (const want of wants) {
                const btn = document.createElement('button');
                btn.className = 'btn btn-small btn-secondary';
                btn.textContent = want;
                btn.addEventListener('click', () => Game.tradeBank(give, want));
                btns.appendChild(btn);
            }
            row.appendChild(btns);
            area.appendChild(row);
        }
    }

    // ---------------------------------------------------------------
    // Top bar
    // ---------------------------------------------------------------

    function renderTopBar(state) {
        const phase = document.getElementById('game-phase');
        const turnInd = document.getElementById('turn-indicator');
        const diceDisplay = document.getElementById('dice-display');
        const remaining = document.getElementById('dev-cards-remaining');

        phase.textContent = state.phase.charAt(0).toUpperCase() + state.phase.slice(1);

        const currentPlayer = state.phase === 'setup'
            ? state.players[state.player_order[state.setup.player_idx]]
            : state.players[state.current_player];

        if (currentPlayer) {
            turnInd.textContent = `${currentPlayer.name}'s turn`;
            turnInd.style.background = remapPlayerColor(currentPlayer.color);
            turnInd.style.color = 'white';
        }

        if (state.last_roll) {
            diceDisplay.style.display = 'flex';
            document.getElementById('die1').textContent = state.last_roll[0];
            document.getElementById('die2').textContent = state.last_roll[1];
            document.getElementById('dice-total').textContent = `= ${state.last_roll.reduce((a, b) => a + b, 0)}`;
        } else {
            diceDisplay.style.display = 'none';
        }

        remaining.textContent = `${state.dev_cards_remaining} dev cards left`;
    }

    // ---------------------------------------------------------------
    // Log
    // ---------------------------------------------------------------

    function renderLog(state) {
        const log = document.getElementById('game-log');
        if (!state.log) return;

        log.innerHTML = state.log.slice(-15).map(entry => {
            const playerName = entry.player ? (state.players[entry.player] ? state.players[entry.player].name : entry.player) : '';
            return `<div class="log-entry"><span class="player-name-log">${playerName}</span> ${formatLogEntry(entry)}</div>`;
        }).join('');
        log.scrollTop = log.scrollHeight;
    }

    function formatLogEntry(entry) {
        switch (entry.type) {
            case 'dice_rolled': return `rolled ${entry.total} (${entry.rolls.join(', ')})`;
            case 'build': return `built ${entry.building}`;
            case 'buy_dev_card': return 'bought a development card';
            case 'play_dev_card': return `played ${entry.card}`;
            case 'trade_bank': return `traded with bank`;
            case 'trade_accept': return 'accepted a trade';
            case 'steal': return `stole from ${entry.target}`;
            case 'move_robber': return 'moved the robber';
            case 'discard': return 'discarded cards';
            case 'end_turn': return 'ended their turn';
            case 'game_started': return 'Game started!';
            case 'setup_complete': return 'Setup complete!';
            case 'game_won': return `won the game with ${entry.vp} VP!`;
            default: return entry.type;
        }
    }

    function addLog(text) {
        const log = document.getElementById('game-log');
        log.innerHTML += `<div class="log-entry">${text}</div>`;
        log.scrollTop = log.scrollHeight;
    }

    // ---------------------------------------------------------------
    // Modals
    // ---------------------------------------------------------------

    function checkModals() {
        const state = Game.getState();
        if (!state) return;

        // Check for discard
        const myDiscard = state.pending_discards ? state.pending_discards[Game.getPlayerId()] : null;
        if (myDiscard) {
            showDiscardModal(myDiscard);
        }

        // Check for pending action modals
        if (state.pending_action && Game.isMyTurn()) {
            if (state.pending_action.type === 'choose_resources') {
                showResourcePickerModal(state.pending_action.count, (resources) => {
                    Game.devCardAction({ resources });
                });
            } else if (state.pending_action.type === 'choose_monopoly_resource') {
                showMonopolyModal();
            }
        }

        // Check for incoming trades — show only the first unresponded one
        if (state.trade_offers) {
            const incomingModal = document.getElementById('incoming-trade-modal');
            const alreadyShowing = incomingModal.classList.contains('active');
            if (!alreadyShowing) {
                for (const [tid, offer] of Object.entries(state.trade_offers)) {
                    if (offer.from_player !== Game.getPlayerId()) {
                        const myResponse = offer.responses ? offer.responses[Game.getPlayerId()] : undefined;
                        if (!myResponse) {
                            showIncomingTradeModal(tid, offer, state);
                            break; // Only show one at a time
                        }
                    }
                }
            }
        }
    }

    function showDiscardModal(count) {
        const modal = document.getElementById('discard-modal');
        const picker = document.getElementById('discard-picker');
        const msg = document.getElementById('discard-message');
        const state = Game.getState();
        const me = state.players[Game.getPlayerId()];

        msg.textContent = `You must discard ${count} cards.`;

        const selected = {};
        const config = Game.getConfig();
        const resources = config ? Object.keys(config.resource_types) : Object.keys(me.resources);

        function renderPicker() {
            picker.innerHTML = resources.map(res => {
                const have = me.resources[res] || 0;
                const sel = selected[res] || 0;
                return `
                    <div class="resource-pick">
                        <div style="font-size:0.75em;color:var(--text-dim);">${res}</div>
                        <div style="font-size:0.8em;">have: ${have}</div>
                        <div class="pick-count">${sel}</div>
                        <div>
                            <button data-res="${res}" data-dir="down">-</button>
                            <button data-res="${res}" data-dir="up">+</button>
                        </div>
                    </div>
                `;
            }).join('');

            picker.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const res = btn.dataset.res;
                    const dir = btn.dataset.dir;
                    if (dir === 'up' && (selected[res] || 0) < (me.resources[res] || 0)) {
                        selected[res] = (selected[res] || 0) + 1;
                    } else if (dir === 'down' && (selected[res] || 0) > 0) {
                        selected[res] = (selected[res] || 0) - 1;
                    }
                    renderPicker();
                });
            });
        }

        renderPicker();
        modal.classList.add('active');

        document.getElementById('btn-confirm-discard').onclick = () => {
            const total = Object.values(selected).reduce((a, b) => a + b, 0);
            if (total !== count) {
                alert(`Must discard exactly ${count} cards (selected ${total})`);
                return;
            }
            Game.discard(selected);
            modal.classList.remove('active');
        };
    }

    function showResourcePickerModal(count, onConfirm) {
        const modal = document.getElementById('resource-picker-modal');
        const picker = document.getElementById('resource-picker');
        const title = document.getElementById('resource-picker-title');
        title.textContent = `Choose ${count} Resources`;

        const selected = {};
        const config = Game.getConfig();
        const resources = config ? Object.keys(config.resource_types) : ['clay', 'wood', 'rock', 'wheat', 'sheep'];

        function renderPicker() {
            picker.innerHTML = resources.map(res => {
                const sel = selected[res] || 0;
                return `
                    <div class="resource-pick">
                        <div style="font-size:0.75em;color:var(--text-dim);">${res}</div>
                        <div class="pick-count">${sel}</div>
                        <div>
                            <button data-res="${res}" data-dir="down">-</button>
                            <button data-res="${res}" data-dir="up">+</button>
                        </div>
                    </div>
                `;
            }).join('');

            picker.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const res = btn.dataset.res;
                    const dir = btn.dataset.dir;
                    const total = Object.values(selected).reduce((a, b) => a + b, 0);
                    if (dir === 'up' && total < count) {
                        selected[res] = (selected[res] || 0) + 1;
                    } else if (dir === 'down' && (selected[res] || 0) > 0) {
                        selected[res] = (selected[res] || 0) - 1;
                    }
                    renderPicker();
                });
            });
        }

        renderPicker();
        modal.classList.add('active');

        document.getElementById('btn-confirm-resource-pick').onclick = () => {
            const total = Object.values(selected).reduce((a, b) => a + b, 0);
            if (total !== count) {
                alert(`Must choose exactly ${count} resources (selected ${total})`);
                return;
            }
            onConfirm(selected);
            modal.classList.remove('active');
        };
    }

    function showMonopolyModal() {
        const modal = document.getElementById('monopoly-modal');
        const choices = document.getElementById('monopoly-choices');
        const config = Game.getConfig();
        const resources = config ? Object.keys(config.resource_types) : ['clay', 'wood', 'rock', 'wheat', 'sheep'];

        choices.innerHTML = '';
        for (const res of resources) {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.textContent = res;
            btn.addEventListener('click', () => {
                Game.devCardAction({ resource: res });
                modal.classList.remove('active');
            });
            choices.appendChild(btn);
        }
        modal.classList.add('active');
    }

    function getResColor(res) {
        return getComputedStyle(document.documentElement).getPropertyValue('--' + res).trim() || '#888';
    }

    // Track the trade offer we sent (for response display)
    let activeSentTradeId = null;
    let tradeTimerInterval = null;
    let incomingTradeTimerInterval = null;

    function showTradeOfferModal() {
        const modal = document.getElementById('trade-offer-modal');
        const state = Game.getState();
        const me = state.players[Game.getPlayerId()];
        const config = Game.getConfig();
        const resources = config ? Object.keys(config.resource_types) : Object.keys(me.resources);

        // Show build section, hide responses section
        document.getElementById('trade-build-section').style.display = '';
        document.getElementById('trade-responses-section').style.display = 'none';
        document.getElementById('trade-offer-title').textContent = 'Trade with Players';
        document.getElementById('trade-offer-hint').textContent = 'Use the +/- buttons to adjust resource amounts.';
        document.getElementById('trade-offer-hint').style.display = '';

        const give = {};
        const want = {};

        function renderCards() {
            const giveCards = document.getElementById('trade-give-cards');
            giveCards.innerHTML = '';
            for (const res of resources) {
                const have = me.resources[res] || 0;
                const selected = give[res] || 0;
                const card = document.createElement('div');
                card.className = 'trade-res-card' + (selected > 0 ? ' selected' : '');
                card.dataset.res = res;
                const displayName = res.charAt(0).toUpperCase() + res.slice(1);
                card.innerHTML = `
                    <div class="res-count">${selected}</div>
                    <div class="res-name">${displayName}</div>
                    <div class="res-have">(${have})</div>
                    <div class="trade-pm-btns">
                        <button class="trade-pm-btn minus" data-res="${res}" data-side="give">&#x2212;</button>
                        <button class="trade-pm-btn plus" data-res="${res}" data-side="give">+</button>
                    </div>
                `;
                giveCards.appendChild(card);
            }

            const wantCards = document.getElementById('trade-want-cards');
            wantCards.innerHTML = '';
            for (const res of resources) {
                const selected = want[res] || 0;
                const card = document.createElement('div');
                card.className = 'trade-res-card' + (selected > 0 ? ' selected' : '');
                card.dataset.res = res;
                const displayName = res.charAt(0).toUpperCase() + res.slice(1);
                card.innerHTML = `
                    <div class="res-count">${selected}</div>
                    <div class="res-name">${displayName}</div>
                    <div class="trade-pm-btns">
                        <button class="trade-pm-btn minus" data-res="${res}" data-side="want">&#x2212;</button>
                        <button class="trade-pm-btn plus" data-res="${res}" data-side="want">+</button>
                    </div>
                `;
                wantCards.appendChild(card);
            }

            // Only target buttons inside trade-build-section to avoid clobbering counter-offer buttons
            document.getElementById('trade-build-section').querySelectorAll('.trade-pm-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const r = btn.dataset.res;
                    const side = btn.dataset.side;
                    const isPlus = btn.classList.contains('plus');
                    if (side === 'give') {
                        const have = me.resources[r] || 0;
                        if (isPlus && (give[r] || 0) < have) give[r] = (give[r] || 0) + 1;
                        else if (!isPlus && (give[r] || 0) > 0) give[r] = (give[r] || 0) - 1;
                    } else {
                        if (isPlus) want[r] = (want[r] || 0) + 1;
                        else if (!isPlus && (want[r] || 0) > 0) want[r] = (want[r] || 0) - 1;
                    }
                    renderCards();
                });
            });

            const giveSummary = Object.entries(give).filter(([, v]) => v > 0).map(([r, c]) => `${c} ${r.charAt(0).toUpperCase() + r.slice(1)}`).join(', ');
            const wantSummary = Object.entries(want).filter(([, v]) => v > 0).map(([r, c]) => `${c} ${r.charAt(0).toUpperCase() + r.slice(1)}`).join(', ');
            document.getElementById('trade-give-summary').textContent = giveSummary || 'Click to add';
            document.getElementById('trade-want-summary').textContent = wantSummary || 'Click to add';
        }

        renderCards();
        modal.classList.add('active');

        document.getElementById('btn-send-trade').onclick = () => {
            const offering = {};
            const requesting = {};
            for (const [k, v] of Object.entries(give)) { if (v > 0) offering[k] = v; }
            for (const [k, v] of Object.entries(want)) { if (v > 0) requesting[k] = v; }
            if (Object.keys(offering).length === 0 || Object.keys(requesting).length === 0) {
                showNotification('Must offer and request something', 'warning');
                return;
            }
            Game.tradeOffer(offering, requesting);
            // Switch to response tracking phase
            showTradeResponsesPhase(offering, requesting);
        };

        document.getElementById('btn-cancel-trade').onclick = () => {
            modal.classList.remove('active');
            activeSentTradeId = null;
        };
    }

    function showTradeResponsesPhase(offering, requesting) {
        document.getElementById('trade-build-section').style.display = 'none';
        document.getElementById('trade-responses-section').style.display = '';
        document.getElementById('trade-offer-title').textContent = 'Waiting for Responses';
        document.getElementById('trade-offer-hint').style.display = 'none';

        // Show recap of what we offered
        function resChips(obj) {
            return Object.entries(obj).filter(([, c]) => c > 0).map(([r, c]) =>
                `<span class="res-chip" style="color:${getResColor(r)}">${c} ${r.charAt(0).toUpperCase() + r.slice(1)}</span>`
            ).join(' ');
        }
        document.getElementById('trade-offer-recap').innerHTML =
            `Offering ${resChips(offering)} for ${resChips(requesting)}`;

        // Find our trade ID from state
        const state = Game.getState();
        const myId = Game.getPlayerId();
        activeSentTradeId = null;
        if (state.trade_offers) {
            for (const [tid, offer] of Object.entries(state.trade_offers)) {
                if (offer.from_player === myId) {
                    activeSentTradeId = tid;
                    break;
                }
            }
        }

        // Start timer
        const config = Game.getConfig();
        const timerSeconds = (config && config.trade_rules && config.trade_rules.trade_timer) || 10;
        startTradeTimer(timerSeconds);

        // Initial render of responses
        updateTradeResponsesDisplay();

        document.getElementById('btn-cancel-sent-trade').onclick = () => {
            document.getElementById('trade-offer-modal').classList.remove('active');
            activeSentTradeId = null;
            clearTradeTimer();
        };
    }

    function startTradeTimer(seconds) {
        clearTradeTimer();
        const fill = document.getElementById('trade-timer-fill');
        fill.style.transition = 'none';
        fill.style.width = '100%';
        // Force reflow
        fill.offsetHeight;
        fill.style.transition = `width ${seconds}s linear`;
        fill.style.width = '0%';

        tradeTimerInterval = setTimeout(() => {
            // Timer expired — auto-dismiss the sent trade modal
            document.getElementById('trade-offer-modal').classList.remove('active');
            activeSentTradeId = null;
        }, seconds * 1000);
    }

    function clearTradeTimer() {
        if (tradeTimerInterval) {
            clearTimeout(tradeTimerInterval);
            tradeTimerInterval = null;
        }
    }

    function updateTradeResponsesDisplay() {
        const state = Game.getState();
        if (!state || !activeSentTradeId) return;

        const offer = state.trade_offers ? state.trade_offers[activeSentTradeId] : null;
        if (!offer) {
            // Trade was completed or cancelled
            document.getElementById('trade-offer-modal').classList.remove('active');
            activeSentTradeId = null;
            clearTradeTimer();
            return;
        }

        const list = document.getElementById('trade-responses-list');
        list.innerHTML = '';
        const myId = Game.getPlayerId();

        for (const pid of state.player_order) {
            if (pid === myId) continue;
            const p = state.players[pid];
            const response = offer.responses ? offer.responses[pid] : undefined;

            const row = document.createElement('div');
            row.className = 'trade-response-row';

            let statusHTML = '';
            let actionHTML = '';
            if (response === 'accepted') {
                statusHTML = '<span class="response-status accepted">Accepted</span>';
                actionHTML = `<button class="btn btn-small btn-primary btn-confirm-accepter" data-pid="${pid}">Trade</button>`;
            } else if (response === 'declined') {
                statusHTML = '<span class="response-status declined">Declined</span>';
            } else if (response === 'countered') {
                statusHTML = '<span class="response-status countered">Countered</span>';
            } else {
                statusHTML = '<span class="response-status waiting">Waiting...</span>';
            }

            row.innerHTML = `
                <span class="player-dot" style="background:${remapPlayerColor(p.color)}"></span>
                <span>${p.name}</span>
                ${statusHTML}
                ${actionHTML}
            `;
            list.appendChild(row);
        }

        // Attach confirm buttons
        list.querySelectorAll('.btn-confirm-accepter').forEach(btn => {
            btn.addEventListener('click', () => {
                const accepterId = btn.dataset.pid;
                Game.tradeAccept(activeSentTradeId, accepterId);
                document.getElementById('trade-offer-modal').classList.remove('active');
                activeSentTradeId = null;
                clearTradeTimer();
            });
        });
    }

    // Reject-all state: { until: turnNumber } — auto-decline until this turn
    let rejectAllUntil = 0;

    function showIncomingTradeModal(tradeId, offer, state) {
        // Auto-decline if reject-all is active
        if (rejectAllUntil > 0 && state.turn_number < rejectAllUntil) {
            Game.tradeRespond(tradeId, 'decline');
            return;
        }
        if (state.turn_number >= rejectAllUntil) {
            rejectAllUntil = 0;
        }

        const modal = document.getElementById('incoming-trade-modal');
        const display = document.getElementById('incoming-trade-display');
        const offerer = state.players[offer.from_player];
        const me = state.players[Game.getPlayerId()];
        const config = Game.getConfig();
        const resources = config ? Object.keys(config.resource_types) : ['clay', 'wood', 'rock', 'wheat', 'sheep'];

        function resChips(obj) {
            return Object.entries(obj).filter(([, c]) => c > 0).map(([r, c]) =>
                `<span class="res-chip" style="color:${getResColor(r)}">${c} ${r.charAt(0).toUpperCase() + r.slice(1)}</span>`
            ).join('');
        }

        // Check if player can afford the trade
        let canAfford = true;
        let missingText = '';
        if (me && me.resources) {
            for (const [res, amount] of Object.entries(offer.requesting)) {
                if ((me.resources[res] || 0) < amount) {
                    canAfford = false;
                    const deficit = amount - (me.resources[res] || 0);
                    missingText += `${deficit} ${res.charAt(0).toUpperCase() + res.slice(1)} `;
                }
            }
        }

        display.innerHTML = `
            <div class="incoming-trade-side">
                <div class="label">${offerer.name} gives</div>
                <div class="resources">${resChips(offer.offering)}</div>
            </div>
            <div class="trade-arrow">&#x21C4;</div>
            <div class="incoming-trade-side">
                <div class="label">You give</div>
                <div class="resources">${resChips(offer.requesting)}</div>
            </div>
            ${!canAfford ? `<div style="color:var(--accent);font-size:0.85em;text-align:center;margin-top:8px;">You don't have enough resources (need ${missingText.trim()})</div>` : ''}
        `;

        // Reset counter-offer and reject-all sections
        document.getElementById('counter-offer-section').style.display = 'none';
        document.getElementById('reject-all-section').style.display = 'none';

        // Build multi-resource counter-offer picker
        const counterTheyGive = {};
        const counterYouGive = {};
        // Pre-populate from original offer
        for (const [r, c] of Object.entries(offer.offering)) { if (c > 0) counterTheyGive[r] = c; }
        for (const [r, c] of Object.entries(offer.requesting)) { if (c > 0) counterYouGive[r] = c; }

        function renderCounterCards() {
            const theyCards = document.getElementById('counter-they-cards');
            theyCards.innerHTML = '';
            for (const res of resources) {
                const selected = counterTheyGive[res] || 0;
                const card = document.createElement('div');
                card.className = 'trade-res-card' + (selected > 0 ? ' selected' : '');
                card.dataset.res = res;
                const name = res.charAt(0).toUpperCase() + res.slice(1);
                card.innerHTML = `
                    <div class="res-count">${selected}</div>
                    <div class="res-name">${name}</div>
                    <div class="trade-pm-btns">
                        <button class="trade-pm-btn minus" data-res="${res}" data-side="counter-they">&#x2212;</button>
                        <button class="trade-pm-btn plus" data-res="${res}" data-side="counter-they">+</button>
                    </div>
                `;
                theyCards.appendChild(card);
            }

            const youCards = document.getElementById('counter-you-cards');
            youCards.innerHTML = '';
            for (const res of resources) {
                const have = me.resources[res] || 0;
                const selected = counterYouGive[res] || 0;
                const card = document.createElement('div');
                card.className = 'trade-res-card' + (selected > 0 ? ' selected' : '');
                card.dataset.res = res;
                const name = res.charAt(0).toUpperCase() + res.slice(1);
                card.innerHTML = `
                    <div class="res-count">${selected}</div>
                    <div class="res-name">${name}</div>
                    <div class="res-have">(${have})</div>
                    <div class="trade-pm-btns">
                        <button class="trade-pm-btn minus" data-res="${res}" data-side="counter-you">&#x2212;</button>
                        <button class="trade-pm-btn plus" data-res="${res}" data-side="counter-you">+</button>
                    </div>
                `;
                youCards.appendChild(card);
            }

            // Attach listeners only within counter-offer-section
            document.getElementById('counter-offer-section').querySelectorAll('.trade-pm-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const r = btn.dataset.res;
                    const side = btn.dataset.side;
                    const isPlus = btn.classList.contains('plus');
                    if (side === 'counter-they') {
                        if (isPlus) counterTheyGive[r] = (counterTheyGive[r] || 0) + 1;
                        else if ((counterTheyGive[r] || 0) > 0) counterTheyGive[r] = (counterTheyGive[r] || 0) - 1;
                    } else {
                        const have = me.resources[r] || 0;
                        if (isPlus && (counterYouGive[r] || 0) < have) counterYouGive[r] = (counterYouGive[r] || 0) + 1;
                        else if (!isPlus && (counterYouGive[r] || 0) > 0) counterYouGive[r] = (counterYouGive[r] || 0) - 1;
                    }
                    renderCounterCards();
                });
            });
        }

        modal.classList.add('active');

        // Start incoming trade timer — auto-declines when it expires
        if (incomingTradeTimerInterval) clearTimeout(incomingTradeTimerInterval);
        const incomingTimerSec = (config && config.trade_rules && config.trade_rules.trade_timer) || 10;
        const inFill = document.getElementById('incoming-trade-timer-fill');
        inFill.style.transition = 'none';
        inFill.style.width = '100%';
        inFill.offsetHeight; // force reflow
        inFill.style.transition = `width ${incomingTimerSec}s linear`;
        inFill.style.width = '0%';
        incomingTradeTimerInterval = setTimeout(() => {
            if (modal.classList.contains('active')) {
                Game.tradeRespond(tradeId, 'decline');
                modal.classList.remove('active');
            }
            incomingTradeTimerInterval = null;
        }, incomingTimerSec * 1000);

        const acceptBtn = document.getElementById('btn-accept-trade');
        acceptBtn.disabled = !canAfford;
        acceptBtn.onclick = () => {
            Game.tradeRespond(tradeId, 'accept');
            modal.classList.remove('active');
            clearTimeout(incomingTradeTimerInterval);
            incomingTradeTimerInterval = null;
        };

        document.getElementById('btn-decline-trade').onclick = () => {
            Game.tradeRespond(tradeId, 'decline');
            modal.classList.remove('active');
            clearTimeout(incomingTradeTimerInterval);
            incomingTradeTimerInterval = null;
        };

        document.getElementById('btn-counter-trade').onclick = () => {
            const section = document.getElementById('counter-offer-section');
            const showing = section.style.display !== 'none';
            section.style.display = showing ? 'none' : 'block';
            document.getElementById('reject-all-section').style.display = 'none';
            if (!showing) renderCounterCards();
        };

        document.getElementById('btn-send-counter').onclick = () => {
            const offering = {};
            const requesting = {};
            for (const [r, c] of Object.entries(counterYouGive)) { if (c > 0) offering[r] = c; }
            for (const [r, c] of Object.entries(counterTheyGive)) { if (c > 0) requesting[r] = c; }
            if (Object.keys(offering).length === 0 || Object.keys(requesting).length === 0) {
                showNotification('Counter-offer must include both sides', 'warning');
                return;
            }
            // Validate resources
            for (const [r, c] of Object.entries(offering)) {
                if ((me.resources[r] || 0) < c) {
                    showNotification(`Not enough ${r.charAt(0).toUpperCase() + r.slice(1)}`, 'warning');
                    return;
                }
            }
            Game.tradeRespond(tradeId, 'decline');
            Game.tradeOffer(offering, requesting);
            modal.classList.remove('active');
            clearTimeout(incomingTradeTimerInterval);
            incomingTradeTimerInterval = null;
        };

        document.getElementById('btn-reject-all-trades').onclick = () => {
            const section = document.getElementById('reject-all-section');
            section.style.display = section.style.display === 'none' ? 'block' : 'none';
            document.getElementById('counter-offer-section').style.display = 'none';
        };

        document.querySelectorAll('.reject-rounds-btn').forEach(btn => {
            btn.onclick = () => {
                const rounds = parseInt(btn.dataset.rounds);
                const playerCount = state.player_order.length;
                rejectAllUntil = state.turn_number + (rounds * playerCount);
                Game.tradeRespond(tradeId, 'decline');
                showNotification(`Auto-declining trades for ${rounds === 999 ? 'the rest of the game' : rounds + ' round(s)'}`, 'info');
                modal.classList.remove('active');
            };
        });
    }

    // Settings viewer
    document.getElementById('btn-view-settings').addEventListener('click', () => {
        const modal = document.getElementById('settings-viewer-modal');
        const content = document.getElementById('settings-viewer-content');
        const config = Game.getConfig();

        let html = '';
        if (config) {
            const vpThreshold = config.win_conditions && config.win_conditions[0]
                ? config.win_conditions[0].params.threshold : '?';
            html += `<div><strong>Victory Points to Win:</strong> ${vpThreshold}</div>`;

            const numRings = config.board_template ? config.board_template.num_rings : '?';
            html += `<div><strong>Board Size:</strong> ${numRings} rings</div>`;

            if (config.robber) {
                html += `<div><strong>Discard Threshold:</strong> >${config.robber.discard_threshold} cards</div>`;
            }

            if (config.building_types) {
                const bt = config.building_types;
                html += `<div style="margin-top:8px;"><strong>Piece Limits:</strong></div>`;
                if (bt.road) html += `<div style="padding-left:12px;">Roads: ${bt.road.max_per_player}</div>`;
                if (bt.settlement) html += `<div style="padding-left:12px;">Settlements: ${bt.settlement.max_per_player}</div>`;
                if (bt.city) html += `<div style="padding-left:12px;">Cities: ${bt.city.max_per_player}</div>`;
            }

            if (config.dev_card_types) {
                html += `<div style="margin-top:8px;"><strong>Dev Card Deck:</strong></div>`;
                for (const [id, dc] of Object.entries(config.dev_card_types)) {
                    const name = dc.name || id.replace(/_/g, ' ');
                    html += `<div style="padding-left:12px;">${name}: ${dc.count_in_deck}</div>`;
                }
            }

            if (config.board_template && config.board_template.port_counts) {
                html += `<div style="margin-top:8px;"><strong>Ports:</strong></div>`;
                for (const [id, count] of Object.entries(config.board_template.port_counts)) {
                    const pt = config.port_types && config.port_types[id];
                    const name = pt ? pt.name : id;
                    html += `<div style="padding-left:12px;">${name}: ${count}</div>`;
                }
            }

            if (config.building_types) {
                html += `<div style="margin-top:8px;"><strong>Building Costs:</strong></div>`;
                for (const [id, bt] of Object.entries(config.building_types)) {
                    if (id === 'dev_card') continue;
                    const costStr = Object.entries(bt.cost).map(([r, c]) =>
                        `${c} ${r.charAt(0).toUpperCase() + r.slice(1)}`).join(', ');
                    html += `<div style="padding-left:12px;">${bt.name}: ${costStr}</div>`;
                }
            }
        } else {
            html = '<div style="color:var(--text-dim);">Settings not available</div>';
        }
        content.innerHTML = html;
        modal.classList.add('active');
    });

    document.getElementById('btn-close-settings-viewer').addEventListener('click', () => {
        document.getElementById('settings-viewer-modal').classList.remove('active');
    });

    function checkWinner(state) {
        if (state.winner) {
            const winner = state.players[state.winner];
            document.getElementById('winner-name').textContent = `${winner.name} wins with ${winner.vp} VP!`;
            document.getElementById('winner-overlay').classList.add('active');
        }
    }
})();
