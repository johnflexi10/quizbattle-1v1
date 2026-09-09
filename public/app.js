/* ══════════════════════════════════════════════════════════
   QuizBattle — app.js  (cliente Socket.IO)
   ══════════════════════════════════════════════════════════ */

const AVATARS = ['🧙', '🦸', '🦊', '🐯', '🦁', '🐸', '🤖', '👾', '🦄', '🐉'];
const ANSWER_IDS = ['answerA', 'answerB', 'answerC', 'answerD'];
const ANSWER_LETTERS = ['A', 'B', 'C', 'D'];
const TIMER_CIRCUMFERENCE = 213.6; // 2 * π * 34

// ─── Efeitos Sonoros com Web Audio API Nativa ──────────────────────────────
const Sound = {
  ctx: null,
  muted: false,
  init() {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  },
  toggle() {
    this.muted = !this.muted;
    localStorage.setItem('quizbattle_sound_muted', this.muted ? '1' : '0');
    this.updateIcon();
    showToast(this.muted ? '🔇 Sons desativados' : '🔊 Sons ativados!');
  },
  updateIcon() {
    const icon = $('btnSoundIcon');
    const label = $('btnSoundLabel');
    const btn = $('btnSoundToggle');
    if (icon) icon.textContent = this.muted ? '🔇' : '🔊';
    if (label) label.textContent = this.muted ? 'Mudo' : 'Som';
    if (btn) btn.classList.toggle('muted', this.muted);
  },
  playTone(freq, type = 'sine', duration = 0.15, vol = 0.12) {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  },
  click() { this.playTone(650, 'sine', 0.05, 0.08); },
  tick() { this.playTone(750, 'triangle', 0.06, 0.08); },
  urgentTick() { this.playTone(1050, 'sawtooth', 0.09, 0.15); },
  correct() {
    this.playTone(523.25, 'sine', 0.1, 0.15);
    setTimeout(() => this.playTone(659.25, 'sine', 0.12, 0.15), 100);
    setTimeout(() => this.playTone(783.99, 'sine', 0.25, 0.2), 200);
  },
  wrong() {
    this.playTone(280, 'sawtooth', 0.15, 0.18);
    setTimeout(() => this.playTone(200, 'sawtooth', 0.3, 0.2), 150);
  },
  gameStart() {
    this.playTone(440, 'sine', 0.1, 0.15);
    setTimeout(() => this.playTone(554.37, 'sine', 0.1, 0.15), 120);
    setTimeout(() => this.playTone(659.25, 'sine', 0.1, 0.15), 240);
    setTimeout(() => this.playTone(880, 'sine', 0.35, 0.2), 360);
  },
  playerJoined() {
    this.playTone(587.33, 'triangle', 0.12, 0.15);
    setTimeout(() => this.playTone(880, 'triangle', 0.2, 0.2), 120);
  },
  victory() {
    [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'triangle', 0.25, 0.2), i * 140);
    });
  }
};

// ─── Estatísticas Locais do Jogador ──────────────────────────────────────────
const Stats = {
  get() {
    try {
      const data = localStorage.getItem('quizbattle_stats');
      return data ? JSON.parse(data) : { matches: 0, wins: 0, losses: 0, draws: 0, bestStreak: 0 };
    } catch (e) {
      return { matches: 0, wins: 0, losses: 0, draws: 0, bestStreak: 0 };
    }
  },
  recordMatch(result, matchStreak = 0) {
    const s = this.get();
    s.matches = (s.matches || 0) + 1;
    if (result === 'win') s.wins = (s.wins || 0) + 1;
    else if (result === 'loss') s.losses = (s.losses || 0) + 1;
    else if (result === 'draw') s.draws = (s.draws || 0) + 1;
    s.bestStreak = Math.max(s.bestStreak || 0, matchStreak);
    localStorage.setItem('quizbattle_stats', JSON.stringify(s));
    this.render();
  },
  render() {
    const s = this.get();
    const w = $('statWins');
    const m = $('statMatches');
    const st = $('statStreak');
    if (w) w.textContent = s.wins;
    if (m) m.textContent = s.matches;
    if (st) st.textContent = s.bestStreak;
  }
};

// ─── Efeito de Confetes na Vitória ───────────────────────────────────────────
const Confetti = {
  canvas: null,
  ctx: null,
  particles: [],
  animId: null,
  timer: null,

  start() {
    this.canvas = $('confettiCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.resize();
    this.particles = [];
    const colors = ['#ffd700', '#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#9b59b6'];

    for (let i = 0; i < 90; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * -this.canvas.height,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedY: Math.random() * 3 + 2,
        speedX: (Math.random() - 0.5) * 2,
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 6,
      });
    }

    cancelAnimationFrame(this.animId);
    clearTimeout(this.timer);
    this.loop();

    this.timer = setTimeout(() => this.stop(), 4000);
  },

  resize() {
    if (!this.canvas) return;
    this.canvas.width = this.canvas.offsetWidth || window.innerWidth;
    this.canvas.height = this.canvas.offsetHeight || window.innerHeight;
  },

  loop() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const p of this.particles) {
      p.y += p.speedY;
      p.x += p.speedX;
      p.rot += p.rotSpeed;

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rot * Math.PI) / 180);
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      this.ctx.restore();

      if (p.y > this.canvas.height) {
        p.y = -10;
        p.x = Math.random() * this.canvas.width;
      }
    }

    this.animId = requestAnimationFrame(() => this.loop());
  },

  stop() {
    cancelAnimationFrame(this.animId);
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.particles = [];
  }
};

// ─── Estado do Cliente ──────────────────────────────────────────────────────
const State = {
  socket: null,
  myId: null,
  myName: '',
  selectedAvatar: 0,
  roomCode: null,
  isHost: false,
  isMyReady: false,
  roomSettings: {
    roomName: '',
    totalRounds: 10,
    questionTime: 15,
    difficulty: 'todas',
    categories: [],
    isPublic: true,
  },
  categoryMode: 'all',
  publicRooms: [],
  players: [],           // [{id, name, avatar, score, isReady, isHost}]
  myPlayerIndex: -1,
  totalRounds: 10,
  currentRound: 0,
  questionTime: 15,
  currentQuestion: null,
  answered: false,
  selectedIndex: null,
  timerInterval: null,
  timerRemaining: 15,
  currentStreak: 0,
  bestStreak: 0,
  networkUrl: null,
  localIp: null,
};

// ─── Utilitários ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) {
    el.classList.add('active');
    el.scrollTop = 0;
  }

  // Ações do menu (som e tela cheia) nunca devem aparecer durante a partida ou lobby
  const topActions = document.querySelector('.menu-top-actions');
  if (topActions) {
    topActions.style.display = (id === 'screen-menu') ? 'flex' : 'none';
  }
  if (id === 'screen-menu') {
    Stats.render();
  }
}

function showToast(msg, duration = 3000) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 300);
  }, duration);
}

function getAvatar(index) {
  return AVATARS[(index || 0) % AVATARS.length];
}

function getMyPlayer() {
  return State.players[State.myPlayerIndex];
}
function getOpponentPlayer() {
  return State.players[State.myPlayerIndex === 0 ? 1 : 0];
}

// ─── Conectar Socket ────────────────────────────────────────────────────────
function connectSocket() {
  if (typeof io === 'undefined') {
    showToast('⏳ Conectando ao serviço de multiplayer...');
    return;
  }
  if (State.socket && State.socket.connected) return;

  const serverUrl = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? undefined
    : 'http://localhost:3000';

  State.socket = io(serverUrl, { transports: ['websocket', 'polling'] });
  const s = State.socket;

  // ── Eventos do servidor ──
  s.on('connect', () => {
    State.myId = s.id;
    console.log('[Socket] Conectado:', s.id);
  });

  s.on('disconnect', () => {
    console.log('[Socket] Desconectado');
    showToast('⚠️ Conexão perdida com o servidor.', 5000);
  });

  s.on('error', ({ message }) => {
    showToast('❌ ' + message);
  });

  // ── Informações de Rede Local (Multi-Device) ──
  s.on('server_network_info', (data) => {
    if (data && data.networkUrl) {
      State.networkUrl = data.networkUrl;
      State.localIp = data.localIp;
      console.log('[Rede] URL disponível para Mobile/Tablet:', State.networkUrl);
    }
  });

  // ── Lista de Salas Públicas Atualizada ──
  s.on('public_rooms_updated', (roomsList) => {
    State.publicRooms = roomsList || [];
    renderPublicRooms(State.publicRooms);
  });

  // ── Criou sala ──
  s.on('room_created', ({ code, player, settings, isHost }) => {
    State.roomCode = code;
    State.players = [player];
    State.myPlayerIndex = 0;
    State.isHost = !!isHost;
    State.isMyReady = true;
    if (settings) State.roomSettings = settings;

    renderLobby();
    showScreen('screen-lobby');
  });

  // ── Entrou em sala ──
  s.on('room_joined', ({ code, player, settings, isHost }) => {
    State.roomCode = code;
    State.myPlayerIndex = 1;
    State.isHost = !!isHost;
    State.isMyReady = false;
    if (settings) State.roomSettings = settings;

    renderLobby();
    showScreen('screen-lobby');
  });

  // ── Jogador entrou na sala ──
  s.on('player_joined', ({ players, settings }) => {
    const myId = State.myId;
    State.players = players.map(p => ({ ...p, score: 0 }));
    State.myPlayerIndex = players.findIndex(p => p.id === myId);
    if (settings) State.roomSettings = settings;

    Sound.playerJoined();
    renderLobby();
    showToast(`🎮 ${players[players.length - 1].name} entrou na sala!`);
  });

  // ── Atualização do Estado de Pronto ──
  s.on('players_ready_update', ({ players, allReady }) => {
    for (const p of players) {
      const match = State.players.find(x => x.id === p.id);
      if (match) match.isReady = p.isReady;
    }
    renderLobby();
  });

  // ── Outro jogador saiu da sala ──
  s.on('player_left', ({ remainingPlayers, settings, message }) => {
    State.players = remainingPlayers || [];
    const myId = State.myId;
    State.myPlayerIndex = State.players.findIndex(p => p.id === myId);
    State.isHost = State.players.some(p => p.id === myId && p.isHost);
    if (settings) State.roomSettings = settings;

    renderLobby();
    showToast(message || 'O outro jogador saiu da sala.');
  });

  // ── Matchmaking: procurando ──
  s.on('matchmaking_waiting', () => {
    showScreen('screen-matchmaking');
  });

  // ── Matchmaking: encontrado ──
  s.on('matchmaking_found', ({ code, player, opponent, settings }) => {
    State.roomCode = code;
    State.myId = player.id;
    State.players = [player, opponent];
    State.myPlayerIndex = 0;
    State.isHost = player.isHost;
    if (settings) State.roomSettings = settings;

    renderLobby();
    showScreen('screen-lobby');
    $('lobbyMessage').textContent = 'Adversário encontrado! Preparando duelo...';
  });

  s.on('matchmaking_cancelled', () => {
    showScreen('screen-menu');
  });

  // ── Jogo iniciando ──
  s.on('game_start', ({ players, totalRounds, questionTime, settings }) => {
    State.totalRounds = totalRounds;
    State.currentRound = 0;
    State.questionTime = questionTime;
    if (settings) State.roomSettings = settings;
    State.myId = State.socket.id;

    const myId = State.myId;
    State.players = players.map(p => ({ ...p }));
    State.myPlayerIndex = players.findIndex(p => p.id === myId);
    State.currentStreak = 0;
    State.bestStreak = 0;
    const cb = $('comboBadge');
    if (cb) cb.classList.add('hidden');

    Sound.gameStart();
    renderStartingScreen();
    showScreen('screen-starting');
  });

  // ── Nova pergunta ──
  s.on('new_question', (data) => {
    State.currentQuestion = data;
    State.currentRound = data.round;
    State.totalRounds = data.totalRounds;
    State.questionTime = data.timeLimit;
    State.answered = false;
    State.selectedIndex = null;
    hideFeedback();
    renderQuestion(data);
    showScreen('screen-game');
    startClientTimer(data.timeLimit);
  });

  // ── Timer tick do servidor ──
  s.on('timer_tick', ({ secondsLeft }) => {
    updateTimerDisplay(secondsLeft, State.questionTime);
    if (secondsLeft <= 3 && secondsLeft > 0) {
      Sound.urgentTick();
      $('timerCircle').style.stroke = '#ff1744';
      $('timerNumber').style.color = '#ff1744';
    } else if (secondsLeft <= 5) {
      Sound.tick();
    }
  });

  // ── Adversário respondeu ──
  s.on('opponent_answered', ({ playerId }) => {
    const opIdx = State.players.findIndex(p => p.id === playerId);
    if (opIdx !== -1) {
      const badgeId = opIdx === 0 ? 'badge1' : 'badge2';
      const badge = $(badgeId);
      if (badge) badge.classList.remove('hidden');
    }
  });

  // ── Resultado da rodada ──
  s.on('round_result', ({ correctIndex, correctLabel, results, scores }) => {
    clearClientTimer();

    for (const sc of scores) {
      const p = State.players.find(x => x.id === sc.id);
      if (p) p.score = sc.score;
    }

    const myResult = results[State.myId];
    revealAnswers(correctIndex, State.selectedIndex);

    const comboBadge = $('comboBadge');
    if (myResult && myResult.isCorrect) {
      Sound.correct();
      State.currentStreak++;
      State.bestStreak = Math.max(State.bestStreak, State.currentStreak);
      if (comboBadge) {
        if (State.currentStreak >= 2) {
          comboBadge.textContent = `🔥 COMBO x${State.currentStreak}!`;
          comboBadge.classList.remove('hidden');
        } else {
          comboBadge.classList.add('hidden');
        }
      }
    } else {
      Sound.wrong();
      State.currentStreak = 0;
      if (comboBadge) comboBadge.classList.add('hidden');
    }

    const feedbackDelay = 500;
    setTimeout(() => {
      if (!myResult || !myResult.answered) {
        showFeedback('timeout', 0, `Resposta: ${correctLabel}`);
      } else if (myResult.isCorrect) {
        const comboTxt = State.currentStreak >= 2 ? `🔥 Sequência de ${State.currentStreak} acertos!` : null;
        showFeedback('correct', myResult.points, comboTxt);
      } else {
        showFeedback('wrong', 0, `Resposta certa: ${correctLabel}`);
      }
    }, feedbackDelay);

    updateScorePanels();
  });

  // ── Fim de jogo ──
  s.on('game_end', (data) => {
    hideFeedback();
    clearClientTimer();
    setTimeout(() => renderResultScreen(data), 1000);
  });

  // ── Adversário desconectou ──
  s.on('opponent_disconnected', ({ message }) => {
    showToast('⚡ ' + message, 6000);
    setTimeout(() => App.backToMenu(), 4000);
  });

  // ── Rematch ──
  s.on('waiting_rematch', () => {
    $('btnPlayAgain').disabled = true;
    $('btnPlayAgain').textContent = '✓ Aguardando adversário...';
    $('rematchStatus').classList.remove('hidden');
  });

  s.on('opponent_wants_rematch', () => {
    showToast('🔄 Adversário quer uma revanche! Clique em Jogar Novamente.');
  });
}

// ─── Renderizações ──────────────────────────────────────────────────────────
function renderLobby() {
  const code = State.roomCode || '----';
  $('lobbyRoomCode').textContent = code;

  const settings = State.roomSettings || {};
  $('lobbyRoomTitle').textContent = settings.roomName || '🎮 Sala de Espera';
  $('lobbyRoomBadge').textContent = settings.isPublic ? '🌐 Sala Pública' : '🔒 Sala Privada';

  // Pills de configuração da sala
  const totalRounds = settings.totalRounds || State.totalRounds || 10;
  const questionTime = settings.questionTime || State.questionTime || 15;
  const diff = settings.difficulty || 'todas';
  const diffLabel = diff === 'todas' ? 'Todas' : (diff.charAt(0).toUpperCase() + diff.slice(1));

  $('lobbyPillRounds').textContent = `🏆 ${totalRounds} Rodadas`;
  $('lobbyPillTime').textContent = `⏱️ ${questionTime}s / perg.`;
  $('lobbyPillDiff').textContent = `🎯 Dif: ${diffLabel}`;

  if (!settings.categories || settings.categories.length === 0 || settings.categories.length >= 9) {
    $('lobbyPillCategories').textContent = '📚 Todas Categorias';
  } else if (settings.categories.length === 1) {
    $('lobbyPillCategories').textContent = `📚 ${settings.categories[0]}`;
  } else {
    $('lobbyPillCategories').textContent = `📚 ${settings.categories.length} Categorias`;
  }

  const p1 = State.players[0];
  const p2 = State.players[1];

  // Jogador 1 (Host)
  if (p1) {
    $('lobbyAvatar1').textContent = getAvatar(p1.avatar);
    $('lobbyAvatar1').classList.remove('waiting-pulse');
    $('lobbyName1').textContent = p1.name;
    $('crownP1').classList.toggle('hidden', !p1.isHost);
    $('lobbyStatus1').textContent = p1.isReady ? '✓ Pronto' : '⏳ Aguardando';
    $('lobbyStatus1').className = p1.isReady ? 'lobby-status ready' : 'lobby-status waiting';
  }

  // Jogador 2 (Convidado ou Aguardando)
  if (p2) {
    $('lobbyAvatar2').textContent = getAvatar(p2.avatar);
    $('lobbyAvatar2').classList.remove('waiting-pulse');
    $('lobbyName2').textContent = p2.name;
    $('crownP2').classList.toggle('hidden', !p2.isHost);
    $('lobbyStatus2').textContent = p2.isReady ? '✓ Pronto' : '⏳ Aguardando';
    $('lobbyStatus2').className = p2.isReady ? 'lobby-status ready' : 'lobby-status waiting';
  } else {
    $('lobbyAvatar2').textContent = '?';
    $('lobbyAvatar2').classList.add('waiting-pulse');
    $('lobbyName2').textContent = 'Aguardando...';
    $('crownP2').classList.add('hidden');
    $('lobbyStatus2').textContent = '⏳ Esperando';
    $('lobbyStatus2').className = 'lobby-status waiting';
  }

  // Mensagem central do lobby
  const dots = $('lobbyWaitingDots');
  if (State.players.length === 2) {
    dots.classList.add('hidden');
    const allReady = State.players.every(p => p.isReady);
    if (allReady) {
      $('lobbyMessage').textContent = State.isHost
        ? 'Todos prontos! Clique em Iniciar Batalha para começar.'
        : 'Todos prontos! Aguardando o Host iniciar a partida...';
    } else {
      $('lobbyMessage').textContent = 'Adversário conectado! Aguardando confirmação de pronto.';
    }
  } else {
    dots.classList.remove('hidden');
    $('lobbyMessage').textContent = 'Aguardando o segundo jogador entrar na sala...';
  }

  // Controles de Ação (Host vs Convidado)
  const btnStart = $('btnHostStart');
  const btnReady = $('btnToggleReady');

  if (State.isHost) {
    btnStart.classList.remove('hidden');
    btnReady.classList.add('hidden');

    if (State.players.length === 2) {
      btnStart.disabled = false;
      const allReady = State.players.every(p => p.isReady);
      if (allReady) {
        btnStart.textContent = '🚀 Iniciar Batalha 1v1 (Prontos!)';
        btnStart.classList.add('btn-pulse');
      } else {
        btnStart.textContent = '🚀 Iniciar Batalha 1v1';
        btnStart.classList.remove('btn-pulse');
      }
    } else {
      btnStart.disabled = true;
      btnStart.textContent = '⏳ Aguardando Oponente...';
      btnStart.classList.remove('btn-pulse');
    }
  } else {
    btnStart.classList.add('hidden');
    btnReady.classList.remove('hidden');

    if (State.isMyReady) {
      btnReady.textContent = '✓ Pronto! (Clique p/ Cancelar)';
      btnReady.classList.add('is-ready');
    } else {
      btnReady.textContent = '👍 Estou Pronto!';
      btnReady.classList.remove('is-ready');
    }
  }
}

function renderPublicRooms(roomsList) {
  const container = $('publicRoomsList');
  if (!container) return;

  if (!roomsList || roomsList.length === 0) {
    container.innerHTML = `
      <div class="public-room-empty">
        <p>🎮 Nenhuma sala pública aberta no momento.</p>
        <p style="margin-top:6px; font-size:12px; opacity:0.8;">Crie a sua sala 1v1 e desafie outros jogadores!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = roomsList.map(r => {
    const diff = r.difficulty === 'todas' ? 'Todas' : (r.difficulty.charAt(0).toUpperCase() + r.difficulty.slice(1));
    const catsText = (!r.categories || r.categories.length === 0 || r.categories.length >= 9)
      ? 'Todas Categorias'
      : (r.categories.length === 1 ? r.categories[0] : `${r.categories.length} Categorias`);

    return `
      <div class="public-room-card">
        <div class="room-card-info">
          <div class="room-card-title">${escapeHtml(r.roomName || 'Sala 1v1')}</div>
          <div class="room-card-meta">
            <span>👑 Host: ${getAvatar(r.hostAvatar)} ${escapeHtml(r.hostName)}</span>
            <span class="room-card-badge">🏆 ${r.totalRounds} rodadas</span>
            <span class="room-card-badge">⏱️ ${r.questionTime}s</span>
            <span class="room-card-badge">🎯 ${diff}</span>
            <span class="room-card-badge">📚 ${catsText}</span>
          </div>
        </div>
        <button class="btn-join-room" onclick="App.joinPublicRoom('${r.code}')">
          Entrar ⚔️
        </button>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderStartingScreen() {
  const p1 = State.players[0];
  const p2 = State.players[1];
  if (p1) {
    $('startAvatar1').textContent = getAvatar(p1.avatar);
    $('startName1').textContent = p1.name;
  }
  if (p2) {
    $('startAvatar2').textContent = getAvatar(p2.avatar);
    $('startName2').textContent = p2.name;
  }

  // Countdown 3-2-1
  let count = 3;
  $('startCountdown').textContent = count;
  const interval = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(interval);
      $('startCountdown').textContent = '🚀';
    } else {
      $('startCountdown').textContent = count;
      Sound.tick();
    }
  }, 1000);
}

function renderQuestion(data) {
  // Limpar badges de "respondeu"
  $('badge1').classList.add('hidden');
  $('badge2').classList.add('hidden');

  // Determinar índices: meu jogador vai para P1 (esquerda), oponente P2 (direita)
  const me  = State.players[State.myPlayerIndex];
  const opp = State.players[State.myPlayerIndex === 0 ? 1 : 0];

  $('gameAvatar1').textContent = getAvatar(me ? me.avatar : 0);
  $('gameName1').textContent   = me ? me.name : 'Você';
  $('gameScore1').textContent  = me ? me.score : 0;

  if (opp) {
    $('gameAvatar2').textContent = getAvatar(opp.avatar);
    $('gameName2').textContent   = opp.name;
    $('gameScore2').textContent  = opp.score;
  }

  // Progress
  const pct = (data.round / data.totalRounds) * 100;
  $('progressBar').style.width = pct + '%';
  $('progressLabel').textContent = `${data.round}/${data.totalRounds}`;

  const catIcons = {
    'Futebol & Esportes': '⚽',
    'Cinema & Séries': '🎬',
    'Games & Tecnologia': '🎮',
    'Música & Cultura Pop': '🎵',
    'Geografia & Mundo': '🌍',
    'História do Brasil & Mundo': '🏛️',
    'Ciências & Natureza': '🔬',
    'Conhecimentos Gerais': '💡',
    'Reino Animal': '🦁'
  };
  const icon = catIcons[data.category] || '📚';
  $('categoryBadge').textContent = `${icon} ${data.category} · ${data.difficulty}`;

  // Pergunta
  $('questionText').textContent = data.question;

  // Resetar timer display
  $('timerCircle').style.stroke = 'var(--gold)';
  $('timerNumber').style.color  = 'var(--white)';
  updateTimerDisplay(data.timeLimit, data.timeLimit);

  // Botões
  const btns = ANSWER_IDS.map(id => $(id));
  btns.forEach((btn, i) => {
    btn.disabled = false;
    btn.className = 'answer-btn';
    btn.removeAttribute('style');
    btn.querySelector('.answer-text').textContent = data.options[i];
    btn.querySelector('.answer-letter').textContent = ANSWER_LETTERS[i];
  });
}

function updateScorePanels() {
  const me  = State.players[State.myPlayerIndex];
  const opp = State.players[State.myPlayerIndex === 0 ? 1 : 0];

  if (me)  $('gameScore1').textContent = me.score;
  if (opp) $('gameScore2').textContent = opp.score;

  animateScoreChange('gameScore1');
  animateScoreChange('gameScore2');
}

function animateScoreChange(id) {
  const el = $(id);
  if (!el) return;
  el.style.transform = 'scale(1.35)';
  el.style.color = '#ffe066';
  setTimeout(() => {
    el.style.transition = 'transform 0.3s ease, color 0.3s ease';
    el.style.transform = 'scale(1)';
    el.style.color = '';
    setTimeout(() => el.style.transition = '', 300);
  }, 50);
}

function revealAnswers(correctIndex, mySelectedIndex) {
  const btns = ANSWER_IDS.map(id => $(id));
  btns.forEach((btn, i) => {
    btn.disabled = true;
    btn.classList.remove('selected');
    btn.removeAttribute('style');
    if (i === correctIndex) {
      btn.classList.add('correct');
    } else if (i === mySelectedIndex && i !== correctIndex) {
      btn.classList.add('wrong');
    } else {
      btn.classList.add('dimmed');
    }
  });
}

function showFeedback(type, points, extraMsg) {
  const overlay = $('feedbackOverlay');
  const box     = $('feedbackBox');
  const icon    = $('feedbackIcon');
  const title   = $('feedbackTitle');
  const pts     = $('feedbackPoints');
  const correct = $('feedbackCorrect');

  box.className = 'feedback-box';
  if (type === 'correct') {
    box.classList.add('correct-box');
    icon.textContent  = '✅';
    title.textContent = 'ACERTO!';
    pts.textContent   = `+${points} pts`;
    correct.textContent = extraMsg || '';
  } else if (type === 'wrong') {
    box.classList.add('wrong-box');
    icon.textContent  = '❌';
    title.textContent = 'ERROU!';
    pts.textContent   = '+0 pts';
    correct.textContent = extraMsg || '';
  } else {
    box.classList.add('timeout-box');
    icon.textContent  = '⏰';
    title.textContent = 'TEMPO!';
    pts.textContent   = '+0 pts';
    correct.textContent = extraMsg || '';
  }

  overlay.classList.remove('hidden');
}

function hideFeedback() {
  $('feedbackOverlay').classList.add('hidden');
}

function renderResultScreen(data) {
  const sorted  = [...data.players].sort((a, b) => b.score - a.score);
  const winner  = sorted[0];
  const loser   = sorted[1] || sorted[0];
  const isDraw  = data.isDraw;
  const iAmWinner = winner && winner.id === State.myId;

  if (iAmWinner && !isDraw) {
    Sound.victory();
    Confetti.start();
  }

  // Gravar Estatísticas do Jogador
  const outcome = isDraw ? 'draw' : (iAmWinner ? 'win' : 'loss');
  Stats.recordMatch(outcome, State.bestStreak);

  $('resultTrophy').textContent  = isDraw ? '🤝' : (iAmWinner ? '🏆' : '😔');
  $('resultTitle').textContent   = isDraw ? 'EMPATE!' : (iAmWinner ? 'VITÓRIA!' : 'DERROTA!');
  $('resultSubtitle').textContent = isDraw
    ? 'Duelo equilibrado! Ninguém levou a melhor!'
    : (iAmWinner ? 'Incrível! Você dominou o duelo 1v1!' : 'Não desanime! Desafie seu oponente novamente!');

  if (winner) {
    $('resultWinnerAvatar').textContent = getAvatar(winner.avatar);
    $('resultWinnerName').textContent   = winner.name;
    $('resultWinnerScore').textContent  = winner.score + ' pts';
    $('resultWinnerCorrect').textContent = `✅ ${winner.totalCorrect} acertos`;
    $('resultWinnerWrong').textContent   = `❌ ${winner.totalWrong} erros`;
    $('resultWinnerAvgTime').textContent = `⚡ ${winner.avgResponseTime}s médio`;
  }
  if (loser) {
    $('resultLoserAvatar').textContent = getAvatar(loser.avatar);
    $('resultLoserName').textContent   = loser.name;
    $('resultLoserScore').textContent  = loser.score + ' pts';
    $('resultLoserCorrect').textContent = `✅ ${loser.totalCorrect} acertos`;
    $('resultLoserWrong').textContent   = `❌ ${loser.totalWrong} erros`;
    $('resultLoserAvgTime').textContent = `⚡ ${loser.avgResponseTime}s médio`;
  }

  $('btnPlayAgain').disabled = false;
  $('btnPlayAgain').textContent = '🔄 Jogar Novamente';
  $('rematchStatus').classList.add('hidden');

  showScreen('screen-result');
}

// ─── Timer Visual ────────────────────────────────────────────────────────────
function startClientTimer(seconds) {
  clearClientTimer();
  State.timerRemaining = seconds;
  updateTimerDisplay(seconds, seconds);
}

function clearClientTimer() {
  clearInterval(State.timerInterval);
  State.timerInterval = null;
}

function updateTimerDisplay(secondsLeft, total) {
  $('timerNumber').textContent = secondsLeft;
  const ratio = Math.max(0, secondsLeft / total);
  const dashoffset = TIMER_CIRCUMFERENCE * (1 - ratio);
  $('timerCircle').style.strokeDashoffset = dashoffset;
}

// ─── API Pública (App) ───────────────────────────────────────────────────────
const App = {

  init() {
    // Carregar Avatar salvo
    const savedAvatar = localStorage.getItem('quizbattle_avatar');
    if (savedAvatar !== null) {
      State.selectedAvatar = parseInt(savedAvatar, 10) || 0;
    }

    // Carregar Nome salvo
    const savedName = localStorage.getItem('quizbattle_player_name');
    if (savedName) {
      $('playerName').value = savedName;
    }

    // Renderizar linha de seleção de avatar
    const sel = $('avatarSelector');
    if (sel) {
      sel.innerHTML = AVATARS.map((emoji, idx) => `
        <button type="button" class="avatar-opt ${idx === State.selectedAvatar ? 'selected' : ''}"
             data-idx="${idx}" onclick="App.selectAvatar(${idx})">
          ${emoji}
        </button>
      `).join('');
    }
    this.updateCurrentAvatarDisplay();

    // Configurar cliques nos seletores tipo Pílula
    this.setupPillSelectors();

    // Configurar chips de categoria
    this.setupCategoryChips();

    // Verificar se a URL contém código de sala (?room=ABCD)
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room') || urlParams.get('join');
    if (roomFromUrl && roomFromUrl.length === 4) {
      $('roomCodeInput').value = roomFromUrl.toUpperCase();
      setTimeout(() => {
        $('modal-join').classList.remove('hidden');
        showToast(`🔗 Convite para a sala ${roomFromUrl.toUpperCase()}! Digite seu nome e clique em Entrar.`);
      }, 500);
    }

    // Limpar qualquer estado antigo de rotação forçada
    document.body.classList.remove('mode-rotated-landscape');
    localStorage.removeItem('quizbattle_rotate');

    // Carregar preferência de som
    const savedMuted = localStorage.getItem('quizbattle_sound_muted');
    if (savedMuted === '1') {
      Sound.muted = true;
    }
    Sound.updateIcon();

    // Renderizar estatísticas do jogador
    Stats.render();
  },

  showAvatarModal() {
    Sound.click();
    $('modal-avatar').classList.remove('hidden');
  },

  selectAvatar(index) {
    Sound.click();
    State.selectedAvatar = index;
    localStorage.setItem('quizbattle_avatar', index);

    document.querySelectorAll('.avatar-opt').forEach((btn, i) => {
      btn.classList.toggle('selected', i === index);
    });
    this.updateCurrentAvatarDisplay();

    // Fecha o modal de avatares com segurança
    this.closeModal('modal-avatar');
  },

  updateCurrentAvatarDisplay() {
    const icon = $('currentAvatarIcon');
    if (icon) icon.textContent = getAvatar(State.selectedAvatar);
  },

  setupPillSelectors() {
    const setupGroup = (containerId) => {
      const container = $(containerId);
      if (!container) return;
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.pill-btn');
        if (!btn) return;
        Sound.click();
        container.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    };
    setupGroup('roundsSelector');
    setupGroup('timeSelector');
    setupGroup('diffSelector');
  },

  setupCategoryChips() {
    const grid = $('categoriesGrid');
    if (!grid) return;
    grid.addEventListener('click', (e) => {
      const chip = e.target.closest('.cat-chip');
      if (!chip) return;
      Sound.click();
      chip.classList.toggle('active');
      this.updateCategoryCount();
    });
  },

  setCategoryMode(mode) {
    Sound.click();
    State.categoryMode = mode;
    const btnAll = $('btnCatModeAll');
    const btnCustom = $('btnCatModeCustom');
    const box = $('categoriesCustomBox');

    if (mode === 'all') {
      if (btnAll) btnAll.classList.add('active');
      if (btnCustom) btnCustom.classList.remove('active');
      if (box) box.classList.add('hidden');
    } else {
      if (btnAll) btnAll.classList.remove('active');
      if (btnCustom) btnCustom.classList.add('active');
      if (box) box.classList.remove('hidden');
      this.updateCategoryCount();
    }
  },

  selectAllCategories(select) {
    Sound.click();
    const chips = document.querySelectorAll('#categoriesGrid .cat-chip');
    chips.forEach(c => {
      if (select) c.classList.add('active');
      else c.classList.remove('active');
    });
    this.updateCategoryCount();
  },

  updateCategoryCount() {
    const active = document.querySelectorAll('#categoriesGrid .cat-chip.active');
    const countEl = $('catSelectedCount');
    if (countEl) countEl.textContent = active.length;
  },

  showCreateRoomModal() {
    Sound.click();
    const name = $('playerName').value.trim();
    if (!name) { showToast('⚠️ Digite seu nome de jogador primeiro!'); $('playerName').focus(); return; }
    State.myName = name;
    localStorage.setItem('quizbattle_player_name', name);

    // Abre no modo 'Todas' por padrão para a interface ficar sempre limpa
    this.setCategoryMode('all');
    this.updateCategoryCount();

    $('modal-create-room').classList.remove('hidden');
  },

  createCustomRoom() {
    Sound.click();
    const name = $('playerName').value.trim();
    if (!name) { showToast('⚠️ Digite seu nome primeiro!'); return; }
    State.myName = name;
    localStorage.setItem('quizbattle_player_name', name);

    // Ler opções selecionadas
    const roomName = $('cfgRoomName').value.trim() || `Sala de ${name}`;
    const activeRoundsBtn = document.querySelector('#roundsSelector .pill-btn.active');
    const activeTimeBtn   = document.querySelector('#timeSelector .pill-btn.active');
    const activeDiffBtn   = document.querySelector('#diffSelector .pill-btn.active');

    const totalRounds  = activeRoundsBtn ? parseInt(activeRoundsBtn.dataset.val, 10) : 10;
    const questionTime = activeTimeBtn ? parseInt(activeTimeBtn.dataset.val, 10) : 15;
    const difficulty   = activeDiffBtn ? activeDiffBtn.dataset.val : 'todas';

    // Categorias selecionadas
    let categories = [];
    if (State.categoryMode === 'custom') {
      const catChips = document.querySelectorAll('#categoriesGrid .cat-chip.active');
      categories = Array.from(catChips).map(c => c.dataset.cat);
      if (categories.length === 0) {
        showToast('⚠️ Selecione pelo menos 1 categoria na lista!');
        return;
      }
    } else {
      // Modo Todas as Categorias
      const allChips = document.querySelectorAll('#categoriesGrid .cat-chip');
      categories = Array.from(allChips).map(c => c.dataset.cat);
    }

    const isPublic = $('cfgIsPublic').checked;

    const settings = {
      roomName,
      totalRounds,
      questionTime,
      difficulty,
      categories,
      isPublic,
    };

    State.roomSettings = settings;

    connectSocket();
    State.socket.emit('create_custom_room', {
      playerName: name,
      avatar: State.selectedAvatar,
      settings,
    });

    this.closeModal('modal-create-room');
  },

  showPublicRoomsModal() {
    Sound.click();
    const name = $('playerName').value.trim();
    if (name) {
      State.myName = name;
      localStorage.setItem('quizbattle_player_name', name);
    }
    connectSocket();
    State.socket.emit('get_public_rooms');
    $('modal-public-rooms').classList.remove('hidden');
  },

  refreshPublicRooms() {
    Sound.click();
    if (State.socket) State.socket.emit('get_public_rooms');
  },

  joinPublicRoom(code) {
    Sound.click();
    const name = $('playerName').value.trim();
    if (!name) {
      showToast('⚠️ Digite seu nome de jogador antes de entrar!');
      $('playerName').focus();
      this.closeModal('modal-public-rooms');
      return;
    }
    State.myName = name;
    localStorage.setItem('quizbattle_player_name', name);

    connectSocket();
    State.myId = State.socket.id;
    State.socket.emit('join_room', {
      roomCode: code,
      playerName: name,
      avatar: State.selectedAvatar,
    });

    this.closeModal('modal-public-rooms');
  },

  showJoinRoom() {
    Sound.click();
    const name = $('playerName').value.trim();
    if (!name) { showToast('⚠️ Digite seu nome de jogador primeiro!'); $('playerName').focus(); return; }
    State.myName = name;
    localStorage.setItem('quizbattle_player_name', name);

    $('modal-join').classList.remove('hidden');
    $('roomCodeInput').value = '';
    setTimeout(() => $('roomCodeInput').focus(), 100);
  },

  joinRoom() {
    Sound.click();
    const name = $('playerName').value.trim();
    if (!name) { showToast('⚠️ Digite seu nome de jogador!'); return; }
    State.myName = name;
    localStorage.setItem('quizbattle_player_name', name);

    const code = $('roomCodeInput').value.trim().toUpperCase();
    if (!code || code.length !== 4) { showToast('⚠️ O código deve ter 4 caracteres!'); return; }

    connectSocket();
    State.myId = State.socket.id;
    State.socket.emit('join_room', {
      roomCode: code,
      playerName: name,
      avatar: State.selectedAvatar,
    });

    this.closeModal('modal-join');
  },

  toggleReady() {
    Sound.click();
    State.isMyReady = !State.isMyReady;
    if (State.socket) {
      State.socket.emit('set_player_ready', { ready: State.isMyReady });
    }
    renderLobby();
  },

  startMatchAsHost() {
    Sound.click();
    if (!State.socket || !State.isHost) return;
    if (State.players.length < 2) {
      showToast('⚠️ Aguarde o segundo jogador entrar na sala!');
      return;
    }
    State.socket.emit('start_match');
  },

  showDeviceModal() {
    Sound.click();
    const modal = $('modal-device');
    if (!modal) return;

    // Se já temos a URL de rede do socket ou rota local
    let base = State.networkUrl;
    if (!base) {
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol.startsWith('http')) {
        base = `${window.location.protocol}//${window.location.host}`;
      } else {
        base = 'http://10.0.0.109:3000';
      }
    }

    $('deviceUrlDisplay').textContent = base;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(base)}`;
    $('deviceQrCode').src = qrUrl;

    modal.classList.remove('hidden');

    // Tenta sincronizar via API também
    if (window.location.protocol.startsWith('http')) {
      fetch('/api/network-info')
        .then(r => r.json())
        .then(data => {
          if (data && data.networkUrl) {
            State.networkUrl = data.networkUrl;
            $('deviceUrlDisplay').textContent = data.networkUrl;
            $('deviceQrCode').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.networkUrl)}`;
          }
        })
        .catch(() => {});
    }
  },

  copyNetworkUrl() {
    Sound.click();
    const url = $('deviceUrlDisplay').textContent || State.networkUrl || 'http://10.0.0.109:3000';
    navigator.clipboard.writeText(url)
      .then(() => showToast('📋 Link copiado! Abra no navegador do celular.'))
      .catch(() => showToast(`Acesse: ${url}`));
  },

  copyInviteLink() {
    Sound.click();
    if (!State.roomCode) return;

    let base = window.location.origin;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.location.protocol.startsWith('http')) {
      if (State.networkUrl) {
        base = State.networkUrl;
      } else {
        base = 'http://10.0.0.109:3000';
      }
    }

    const path = window.location.pathname.endsWith('.html') ? '/' : window.location.pathname;
    const link = `${base}${path}?room=${State.roomCode}`;
    navigator.clipboard.writeText(link)
      .then(() => showToast('🔗 Link copiado! Envie para o celular/amigo entrar!'))
      .catch(() => showToast(`Link: ${link}`));
  },

  shareWhatsApp() {
    Sound.click();
    if (!State.roomCode) return;
    let base = window.location.origin;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.location.protocol.startsWith('http')) {
      base = State.networkUrl || 'http://10.0.0.109:3000';
    }
    const path = window.location.pathname.endsWith('.html') ? '/' : window.location.pathname;
    const link = `${base}${path}?room=${State.roomCode}`;
    const text = `⚔️ Bora jogar um duelo no QuizBattle? Entre na minha sala:\n${link}\nCódigo da sala: ${State.roomCode}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  },

  copyRoomCode() {
    Sound.click();
    if (!State.roomCode) return;
    navigator.clipboard.writeText(State.roomCode)
      .then(() => showToast('📋 Código copiado!'))
      .catch(() => showToast(`Código: ${State.roomCode}`));
  },

  leaveRoom() {
    Sound.click();
    if (State.socket) {
      State.socket.emit('leave_room');
    }
    this.backToMenu();
  },

  confirmQuitMatch() {
    Sound.click();
    $('modal-quit-match').classList.remove('hidden');
  },

  quitMatchConfirmed() {
    Sound.click();
    this.closeModal('modal-quit-match');
    if (State.socket) {
      State.socket.emit('leave_room');
    }
    clearClientTimer();
    hideFeedback();
    State.currentStreak = 0;
    const cb = $('comboBadge');
    if (cb) cb.classList.add('hidden');
    this.backToMenu();
  },

  toggleSound() {
    Sound.toggle();
  },

  startMatchmaking() {
    Sound.click();
    const name = $('playerName').value.trim();
    if (!name) { showToast('⚠️ Digite seu nome primeiro!'); $('playerName').focus(); return; }
    State.myName = name;
    localStorage.setItem('quizbattle_player_name', name);

    connectSocket();
    State.myId = State.socket.id;
    State.socket.emit('matchmaking', { playerName: name, avatar: State.selectedAvatar });
  },

  showBotModal() {
    Sound.click();
    const name = $('playerName').value.trim();
    if (!name) { showToast('⚠️ Digite seu nome primeiro!'); $('playerName').focus(); return; }
    State.myName = name;
    localStorage.setItem('quizbattle_player_name', name);

    $('modal-bot').classList.remove('hidden');
  },

  startBotGame(difficulty) {
    Sound.click();
    this.closeModal('modal-bot');
    connectSocket();
    const emit = () => {
      State.myId = State.socket.id;
      State.socket.emit('create_bot_game', {
        playerName: State.myName,
        avatar: State.selectedAvatar,
        difficulty,
      });
    };
    if (State.socket.connected) emit();
    else State.socket.once('connect', emit);
  },

  cancelMatchmaking() {
    Sound.click();
    if (State.socket) State.socket.emit('cancel_matchmaking');
    showScreen('screen-menu');
  },

  closeModal(id) {
    Sound.click();
    $(id).classList.add('hidden');
  },

  selectAnswer(index) {
    if (State.answered) return;
    if (!State.socket) return;

    Sound.click();
    State.answered    = true;
    State.selectedIndex = index;

    ANSWER_IDS.forEach((id, i) => {
      const btn = $(id);
      if (i === index) {
        btn.classList.add('selected');
      } else {
        btn.classList.add('dimmed');
      }
      btn.disabled = true;
    });

    const myBadgeId = State.myPlayerIndex === 0 ? 'badge1' : 'badge2';
    $(myBadgeId).classList.remove('hidden');

    State.socket.emit('player_answer', { answerIndex: index });
  },

  playAgain() {
    Sound.click();
    if (State.socket) State.socket.emit('play_again');
  },

  backToMenu() {
    clearClientTimer();
    hideFeedback();
    if (State.socket) {
      State.socket.disconnect();
      State.socket = null;
    }
    State.myId       = null;
    State.roomCode   = null;
    State.players    = [];
    State.answered   = false;
    State.currentRound = 0;
    State.isHost     = false;
    State.isMyReady  = false;

    showScreen('screen-menu');
  },

  async toggleFullscreen() {
    Sound.click();
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const label = document.getElementById('btnRotateLabel');
    const icon = document.getElementById('btnRotateIcon');

    if (!isFs) {
      try {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen();
        }

        // Tenta travar em paisagem se suportado pelo navegador
        if (screen.orientation && screen.orientation.lock) {
          try {
            await screen.orientation.lock('landscape');
          } catch (e) {
            // Em dispositivos móveis sem permissão direta, basta virar o aparelho
          }
        }

        if (label) label.textContent = 'Sair';
        if (icon) icon.textContent = '✕';
        showToast('🖥️ Tela cheia ativada!');
      } catch (err) {
        showToast('🔄 Gire o celular para jogar na horizontal!');
      }
    } else {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        }
        if (screen.orientation && screen.orientation.unlock) {
          try { screen.orientation.unlock(); } catch (e) {}
        }
      } catch (e) {}

      if (label) label.textContent = 'Tela Cheia';
      if (icon) icon.textContent = '⛶';
      showToast('📱 Tela cheia desativada');
    }
  },

  toggleRotateScreen() {
    this.toggleFullscreen();
  },
};

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  showScreen('screen-menu');

  // Enter no código da sala
  $('roomCodeInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') App.joinRoom();
  });

  // Auto-uppercase no input de código
  $('roomCodeInput').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  // Enter no nome
  $('playerName').addEventListener('keydown', e => {
    if (e.key === 'Enter') App.showCreateRoomModal();
  });

  // Fechar modal ao clicar no overlay
  ['modal-join', 'modal-bot', 'modal-create-room', 'modal-public-rooms', 'modal-device', 'modal-avatar', 'modal-quit-match'].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener('click', e => {
        if (e.target === el) App.closeModal(id);
      });
    }
  });

  // Atualizar botão de tela cheia se o usuário sair pelo atalho do sistema
  const updateFsButton = () => {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const label = $('btnRotateLabel');
    const icon = $('btnRotateIcon');
    if (label) label.textContent = isFs ? 'Sair' : 'Tela Cheia';
    if (icon) icon.textContent = isFs ? '✕' : '⛶';
  };
  document.addEventListener('fullscreenchange', updateFsButton);
  document.addEventListener('webkitfullscreenchange', updateFsButton);

  // Atalhos de Teclado no PC
  window.addEventListener('keydown', e => {
    // Tecla ESC: fechar qualquer modal aberto
    if (e.key === 'Escape') {
      ['modal-join', 'modal-bot', 'modal-create-room', 'modal-public-rooms', 'modal-device', 'modal-avatar', 'modal-quit-match'].forEach(id => {
        App.closeModal(id);
      });
      return;
    }

    // Se estiver digitando em um input de texto, não capturar teclas de jogo
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      return;
    }

    // Atalhos durante a tela de jogo: 1-4 ou A-D
    const gameScreen = $('screen-game');
    if (gameScreen && gameScreen.classList.contains('active')) {
      const key = e.key.toUpperCase();
      let answerIndex = -1;

      if (key === '1' || key === 'A') answerIndex = 0;
      else if (key === '2' || key === 'B') answerIndex = 1;
      else if (key === '3' || key === 'C') answerIndex = 2;
      else if (key === '4' || key === 'D') answerIndex = 3;

      if (answerIndex !== -1) {
        e.preventDefault();
        App.selectAnswer(answerIndex);
      }
    }
  });

  console.log('🎮 QuizBattle 1v1 pronto com suporte a PC / Celular / Tablet!');
});

