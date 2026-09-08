const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// ─── Configurações Gerais Padrão ───────────────────────────────────────────
const DEFAULT_ROUNDS = 10;
const DEFAULT_QUESTION_TIME = 15; // segundos por pergunta
const RESULT_DISPLAY_TIME = 4000; // ms para mostrar resultado antes da próxima
const BASE_POINTS = 10;
const SPEED_BONUS_MAX = 10;
const PORT = process.env.PORT || 3000;

// ─── Configurações do Bot ──────────────────────────────────────────────────
const BOT_NAMES    = ['QuizBot 🤖', 'MegaBrain 🧠', 'RoboQuiz ⚡', 'AceBot 🎯', 'NerdBot 📚'];
const BOT_AVATARS  = [6, 7]; // índices de 🤖 e 👾
const BOT_DIFFICULTY = {
  fácil:   { accuracy: 0.45, minDelay: 8000,  maxDelay: 13000 },
  médio:   { accuracy: 0.65, minDelay: 4000,  maxDelay: 9000  },
  difícil: { accuracy: 0.85, minDelay: 1500,  maxDelay: 4500  },
};

// ─── Banco de Perguntas ────────────────────────────────────────────────────
const allQuestions = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'questions.json'), 'utf8')
);

// ─── Estado das Salas ──────────────────────────────────────────────────────
// roomCode => RoomState
const rooms = new Map();
// socket.id => roomCode
const playerRoom = new Map();
// Fila de matchmaking
let matchmakingQueue = [];

// ─── Estrutura de Sala ─────────────────────────────────────────────────────
function createRoom(code, customSettings = {}, hostSocketId = null) {
  const totalRounds = [5, 10, 15, 20].includes(Number(customSettings.totalRounds))
    ? Number(customSettings.totalRounds)
    : DEFAULT_ROUNDS;

  const questionTime = [10, 15, 20, 30].includes(Number(customSettings.questionTime))
    ? Number(customSettings.questionTime)
    : DEFAULT_QUESTION_TIME;

  const difficulty = ['todas', 'fácil', 'médio', 'difícil'].includes(customSettings.difficulty)
    ? customSettings.difficulty
    : 'todas';

  const categories = Array.isArray(customSettings.categories) && customSettings.categories.length > 0
    ? customSettings.categories
    : [];

  const isPublic = customSettings.isPublic !== undefined ? !!customSettings.isPublic : true;
  const roomName = (customSettings.roomName && typeof customSettings.roomName === 'string' && customSettings.roomName.trim())
    ? customSettings.roomName.trim().slice(0, 30)
    : `Sala #${code}`;

  return {
    code,
    hostId: hostSocketId,
    settings: {
      roomName,
      totalRounds,
      questionTime,
      categories,
      difficulty,
      isPublic,
    },
    players: [], // [{id, name, avatar, score, isReady, isHost, totalCorrect, totalWrong, totalTime}]
    questions: [],
    currentRound: 0,
    phase: 'waiting', // waiting | starting | question | result | finished
    timer: null,
    roundStartTime: null,
    roundAnswers: {}, // socketId => {answerIndex, elapsed}
    playAgainVotes: new Set(),
    createdAt: Date.now(),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function selectQuestions(settings = {}) {
  let pool = [...allQuestions];

  // Filtro de categorias se especificado
  if (settings.categories && settings.categories.length > 0) {
    const filtered = pool.filter(q => settings.categories.includes(q.category));
    if (filtered.length >= 3) {
      pool = filtered;
    }
  }

  // Filtro de dificuldade se especificado
  if (settings.difficulty && settings.difficulty !== 'todas') {
    const diffFiltered = pool.filter(q => q.difficulty === settings.difficulty);
    if (diffFiltered.length >= 3) {
      pool = diffFiltered;
    }
  }

  const shuffled = shuffleArray(pool);
  const needed = settings.totalRounds || DEFAULT_ROUNDS;

  if (shuffled.length >= needed) {
    return shuffled.slice(0, needed);
  } else {
    // Se a seleção filtrada for menor que o número de rodadas pedido, complementa sem quebrar
    const result = [...shuffled];
    const remaining = shuffleArray(allQuestions.filter(q => !result.some(r => r.id === q.id)));
    while (result.length < needed && remaining.length > 0) {
      result.push(remaining.pop());
    }
    return result.slice(0, needed);
  }
}

function getAvatarIndex(name) {
  const avatars = ['🧙', '🦸', '🦊', '🐯', '🦁', '🐸', '🤖', '👾', '🦄', '🐉'];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return Math.abs(hash) % avatars.length;
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function sanitizeRoomForClient(room, forSocketId) {
  return {
    code: room.code,
    hostId: room.hostId,
    isHost: room.hostId === forSocketId,
    settings: room.settings,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      isReady: !!p.isReady,
      isHost: p.id === room.hostId,
      totalCorrect: p.totalCorrect,
      totalWrong: p.totalWrong,
    })),
    currentRound: room.currentRound,
    totalRounds: room.settings.totalRounds,
    questionTime: room.settings.questionTime,
    phase: room.phase,
  };
}

function getPublicRooms() {
  const list = [];
  for (const [code, room] of rooms.entries()) {
    if (room.settings.isPublic && room.phase === 'waiting' && room.players.length === 1) {
      const host = room.players[0];
      list.push({
        code,
        roomName: room.settings.roomName,
        hostName: host ? host.name : 'Jogador',
        hostAvatar: host ? host.avatar : 0,
        totalRounds: room.settings.totalRounds,
        questionTime: room.settings.questionTime,
        difficulty: room.settings.difficulty,
        categories: room.settings.categories,
        playersCount: room.players.length,
      });
    }
  }
  return list;
}

function broadcastPublicRooms() {
  io.emit('public_rooms_updated', getPublicRooms());
}

// ─── Lógica de Rodada ──────────────────────────────────────────────────────
function startRound(room) {
  const totalRounds = room.settings.totalRounds;
  const questionTime = room.settings.questionTime;

  if (room.currentRound >= totalRounds) {
    endGame(room);
    return;
  }

  room.phase = 'question';
  room.roundAnswers = {};
  room.roundStartTime = Date.now();

  const q = room.questions[room.currentRound];
  const questionData = {
    round: room.currentRound + 1,
    totalRounds,
    question: q.question,
    options: q.options,
    category: q.category,
    difficulty: q.difficulty,
    timeLimit: questionTime,
  };

  io.to(room.code).emit('new_question', questionData);

  // Agendar resposta do bot (se houver)
  scheduleBotAnswer(room);

  // Cronômetro autoritativo no servidor
  let secondsLeft = questionTime;
  clearInterval(room.timer);
  room.timer = setInterval(() => {
    secondsLeft--;
    io.to(room.code).emit('timer_tick', { secondsLeft });
    if (secondsLeft <= 0) {
      clearInterval(room.timer);
      resolveRound(room);
    }
  }, 1000);
}

function resolveRound(room) {
  if (room.phase !== 'question') return;
  room.phase = 'result';
  clearInterval(room.timer);

  const questionTime = room.settings.questionTime;
  const q = room.questions[room.currentRound];
  const correctIndex = q.correct;

  // Calcular pontos e atualizar estado
  const results = {};
  for (const player of room.players) {
    const ans = room.roundAnswers[player.id];
    let points = 0;
    let isCorrect = false;
    let answered = !!ans;

    if (ans !== undefined) {
      if (ans.answerIndex === correctIndex) {
        isCorrect = true;
        const timeRatio = Math.max(0, 1 - ans.elapsed / (questionTime * 1000));
        const speedBonus = Math.round(timeRatio * SPEED_BONUS_MAX);
        points = BASE_POINTS + speedBonus;
        player.totalCorrect++;
        player.totalTime += ans.elapsed;
      } else {
        player.totalWrong++;
      }
    }

    player.score += points;
    results[player.id] = { answered, isCorrect, points, answerIndex: ans ? ans.answerIndex : null };
  }

  const roundResult = {
    correctIndex,
    correctLabel: q.options[correctIndex],
    results,
    scores: room.players.map(p => ({ id: p.id, score: p.score })),
  };

  io.to(room.code).emit('round_result', roundResult);

  room.currentRound++;

  // Passa para próxima rodada após delay
  setTimeout(() => {
    if (room.players.length === 2) {
      startRound(room);
    }
  }, RESULT_DISPLAY_TIME);
}

function endGame(room) {
  room.phase = 'finished';
  clearInterval(room.timer);

  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const loser = sorted[1] || sorted[0];

  const gameResult = {
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      totalCorrect: p.totalCorrect,
      totalWrong: p.totalWrong,
      avgResponseTime: p.totalCorrect > 0 ? Math.round(p.totalTime / p.totalCorrect / 100) / 10 : 0,
    })),
    winnerId: winner.id,
    isDraw: winner.score === loser.score,
    settings: room.settings,
  };

  io.to(room.code).emit('game_end', gameResult);
  broadcastPublicRooms();
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  clearInterval(room.timer);
  for (const p of room.players) {
    playerRoom.delete(p.id);
  }
  rooms.delete(code);
  broadcastPublicRooms();
}

function removeFromMatchmaking(socketId) {
  matchmakingQueue = matchmakingQueue.filter(id => id !== socketId);
}

// ─── Funções de Sala ───────────────────────────────────────────────────────
function joinRoom(socket, room, playerName, customAvatar = null) {
  if (room.players.length >= 2) {
    socket.emit('error', { message: 'Sala cheia!' });
    return false;
  }

  const avatarIndex = (typeof customAvatar === 'number' && customAvatar >= 0 && customAvatar <= 9)
    ? customAvatar
    : getAvatarIndex(playerName + socket.id);

  const isHost = room.players.length === 0;
  const player = {
    id: socket.id,
    name: playerName.slice(0, 20),
    avatar: avatarIndex,
    score: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalTime: 0,
    isReady: isHost, // Host já começa pronto
    isHost,
  };

  room.players.push(player);
  playerRoom.set(socket.id, room.code);
  socket.join(room.code);

  return true;
}

function startGameMatch(room) {
  if (room.players.length !== 2 || room.phase !== 'waiting') return;

  room.questions = selectQuestions(room.settings);
  room.phase = 'starting';

  const gameStart = {
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
    })),
    totalRounds: room.settings.totalRounds,
    questionTime: room.settings.questionTime,
    settings: room.settings,
  };

  io.to(room.code).emit('game_start', gameStart);
  broadcastPublicRooms();

  // Iniciar primeira rodada após breve delay para animação (3s)
  setTimeout(() => startRound(room), 3000);
}

// ─── Bot ───────────────────────────────────────────────────────────────────
function addBotToRoom(room, difficultyKey) {
  const diff = BOT_DIFFICULTY[difficultyKey] || BOT_DIFFICULTY['médio'];
  const botId   = 'bot_' + uuidv4().slice(0, 8);
  const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const botAvatar = BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)];

  const bot = {
    id: botId,
    name: botName,
    avatar: botAvatar,
    score: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalTime: 0,
    isBot: true,
    isReady: true,
    difficulty: difficultyKey,
    _diff: diff,
  };

  room.players.push(bot);
  room._botId = botId;
  return bot;
}

function scheduleBotAnswer(room) {
  const bot = room.players.find(p => p.isBot);
  if (!bot) return;

  const q = room.questions[room.currentRound];
  const diff = bot._diff;
  const questionTime = room.settings.questionTime;

  const delay = diff.minDelay + Math.random() * (diff.maxDelay - diff.minDelay);
  const safeDelay = Math.min(delay, (questionTime - 1) * 1000);

  setTimeout(() => {
    if (room.phase !== 'question') return;
    if (room.roundAnswers[bot.id] !== undefined) return;

    const willBeCorrect = Math.random() < diff.accuracy;
    let answerIndex;

    if (willBeCorrect) {
      answerIndex = q.correct;
    } else {
      const wrongOptions = [0, 1, 2, 3].filter(i => i !== q.correct);
      answerIndex = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
    }

    const elapsed = safeDelay;
    room.roundAnswers[bot.id] = { answerIndex, elapsed };

    for (const p of room.players) {
      if (!p.isBot) {
        io.to(p.id).emit('opponent_answered', { playerId: bot.id });
      }
    }

    const humanPlayers = room.players.filter(p => !p.isBot);
    const allAnswered  = humanPlayers.every(p => room.roundAnswers[p.id] !== undefined);
    if (allAnswered && room.roundAnswers[bot.id] !== undefined) {
      clearInterval(room.timer);
      resolveRound(room);
    }
  }, safeDelay);
}

// ─── Socket.IO ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Conectado: ${socket.id}`);

  // Enviar informações de rede e lista atualizada de salas públicas ao conectar
  const localIp = getLocalIpAddress();
  socket.emit('server_network_info', {
    localIp,
    port: PORT,
    networkUrl: `http://${localIp}:${PORT}`
  });
  socket.emit('public_rooms_updated', getPublicRooms());

  // ── Obter salas públicas ──
  socket.on('get_public_rooms', () => {
    socket.emit('public_rooms_updated', getPublicRooms());
  });

  // ── Criar Sala Customizada ──
  socket.on('create_custom_room', ({ playerName, avatar, settings }) => {
    if (!playerName || typeof playerName !== 'string') return;
    const code = generateRoomCode();
    const room = createRoom(code, settings || {}, socket.id);
    rooms.set(code, room);

    joinRoom(socket, room, playerName, avatar);
    socket.emit('room_created', {
      code,
      player: room.players[0],
      settings: room.settings,
      isHost: true,
    });

    console.log(`[Sala 1v1] Criada: ${code} (${room.settings.roomName}) por ${playerName}`);
    broadcastPublicRooms();
  });

  // ── Criar Sala Básica (Retrocompatibilidade) ──
  socket.on('create_room', ({ playerName, avatar }) => {
    if (!playerName || typeof playerName !== 'string') return;
    const code = generateRoomCode();
    const room = createRoom(code, {}, socket.id);
    rooms.set(code, room);

    joinRoom(socket, room, playerName, avatar);
    socket.emit('room_created', {
      code,
      player: room.players[0],
      settings: room.settings,
      isHost: true,
    });

    console.log(`[Sala] Criada: ${code} por ${playerName}`);
    broadcastPublicRooms();
  });

  // ── Jogar vs Bot ──
  socket.on('create_bot_game', ({ playerName, avatar, difficulty }) => {
    if (!playerName || typeof playerName !== 'string') return;
    const diff = ['fácil', 'médio', 'difícil'].includes(difficulty) ? difficulty : 'médio';

    const code = generateRoomCode();
    const room = createRoom(code, {
      roomName: `Treino vs Bot (${diff})`,
      totalRounds: DEFAULT_ROUNDS,
      questionTime: DEFAULT_QUESTION_TIME,
      isPublic: false,
      difficulty: diff,
    }, socket.id);
    rooms.set(code, room);

    joinRoom(socket, room, playerName, avatar);
    playerRoom.set(socket.id, code);

    const bot = addBotToRoom(room, diff);
    console.log(`[Bot] ${playerName} vs ${bot.name} (${diff}) — Sala: ${code}`);

    room.questions = selectQuestions(room.settings);
    room.phase = 'starting';

    const gameStart = {
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        isBot: !!p.isBot,
      })),
      totalRounds: room.settings.totalRounds,
      questionTime: room.settings.questionTime,
      settings: room.settings,
    };

    socket.emit('game_start', gameStart);
    setTimeout(() => startRound(room), 3000);
  });

  // ── Entrar em Sala ──
  socket.on('join_room', ({ roomCode, playerName, avatar }) => {
    if (!playerName || !roomCode) return;
    const code = roomCode.toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error', { message: 'Sala não encontrada!' });
      return;
    }
    if (room.phase !== 'waiting') {
      socket.emit('error', { message: 'Partida já em andamento!' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error', { message: 'A sala já está cheia!' });
      return;
    }
    if (room.players.find(p => p.id === socket.id)) {
      socket.emit('error', { message: 'Você já está nesta sala!' });
      return;
    }

    const ok = joinRoom(socket, room, playerName, avatar);
    if (!ok) return;

    const me = room.players.find(p => p.id === socket.id);
    socket.emit('room_joined', {
      code,
      player: me,
      settings: room.settings,
      isHost: false,
    });

    io.to(code).emit('player_joined', {
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isReady: !!p.isReady,
        isHost: p.id === room.hostId,
      })),
      settings: room.settings,
    });

    console.log(`[Sala] ${playerName} entrou em ${code}`);
    broadcastPublicRooms();
  });

  // ── Alterar Estado de Pronto (Ready) ──
  socket.on('set_player_ready', ({ ready }) => {
    const code = playerRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.phase !== 'waiting') return;

    const p = room.players.find(x => x.id === socket.id);
    if (!p) return;

    p.isReady = !!ready;
    io.to(code).emit('players_ready_update', {
      players: room.players.map(pl => ({
        id: pl.id,
        isReady: !!pl.isReady,
        isHost: pl.id === room.hostId,
      })),
      allReady: room.players.length === 2 && room.players.every(pl => pl.isReady),
    });
  });

  // ── Iniciar Partida pelo Host ──
  socket.on('start_match', () => {
    const code = playerRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.phase !== 'waiting') return;

    // Apenas o host pode iniciar
    if (room.hostId !== socket.id) {
      socket.emit('error', { message: 'Apenas o criador da sala pode iniciar a partida.' });
      return;
    }

    if (room.players.length < 2) {
      socket.emit('error', { message: 'Aguardando o segundo jogador entrar!' });
      return;
    }

    startGameMatch(room);
  });

  // ── Matchmaking Rápido ──
  socket.on('matchmaking', ({ playerName, avatar }) => {
    if (!playerName) return;
    socket.data.playerName = playerName.slice(0, 20);
    socket.data.avatar = avatar;

    removeFromMatchmaking(socket.id);

    if (matchmakingQueue.length > 0) {
      const opponentId = matchmakingQueue.shift();
      const opponentSocket = io.sockets.sockets.get(opponentId);

      if (!opponentSocket) {
        matchmakingQueue.push(socket.id);
        socket.emit('matchmaking_waiting');
        return;
      }

      const code = generateRoomCode();
      const room = createRoom(code, {
        roomName: 'Matchmaking 1v1',
        totalRounds: DEFAULT_ROUNDS,
        questionTime: DEFAULT_QUESTION_TIME,
        isPublic: false,
      }, opponentSocket.id);
      rooms.set(code, room);

      joinRoom(opponentSocket, room, opponentSocket.data.playerName || 'Jogador', opponentSocket.data.avatar);
      joinRoom(socket, room, playerName, avatar);

      const p1 = room.players[0];
      const p2 = room.players[1];

      opponentSocket.emit('matchmaking_found', { code, player: p1, opponent: p2, settings: room.settings });
      socket.emit('matchmaking_found', { code, player: p2, opponent: p1, settings: room.settings });

      startGameMatch(room);
      console.log(`[Matchmaking] ${p1.name} vs ${p2.name} — Sala: ${code}`);
    } else {
      matchmakingQueue.push(socket.id);
      socket.emit('matchmaking_waiting');
      console.log(`[Matchmaking] ${playerName} na fila (${matchmakingQueue.length} esperando)`);
    }
  });

  // ── Cancelar Matchmaking ──
  socket.on('cancel_matchmaking', () => {
    removeFromMatchmaking(socket.id);
    socket.emit('matchmaking_cancelled');
  });

  // ── Resposta do Jogador ──
  socket.on('player_answer', ({ answerIndex }) => {
    const code = playerRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.phase !== 'question') return;
    if (room.roundAnswers[socket.id] !== undefined) return;

    const elapsed = Date.now() - room.roundStartTime;
    room.roundAnswers[socket.id] = { answerIndex, elapsed };

    for (const p of room.players) {
      if (p.id !== socket.id) {
        io.to(p.id).emit('opponent_answered', { playerId: socket.id });
      }
    }

    if (Object.keys(room.roundAnswers).length === room.players.length) {
      clearInterval(room.timer);
      resolveRound(room);
    }
  });

  // ── Jogar Novamente (Rematch) ──
  socket.on('play_again', () => {
    const code = playerRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.phase !== 'finished') return;

    if (!room.playAgainVotes) room.playAgainVotes = new Set();
    room.playAgainVotes.add(socket.id);

    const hasBot = room.players.some(p => p.isBot);
    if (hasBot || room.playAgainVotes.size === 2) {
      room.playAgainVotes = new Set();
      room.currentRound = 0;
      room.phase = 'waiting';
      room.roundAnswers = {};
      room.questions = selectQuestions(room.settings);
      for (const p of room.players) {
        p.score = 0;
        p.totalCorrect = 0;
        p.totalWrong = 0;
        p.totalTime = 0;
      }

      const gameStart = {
        players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, score: 0, isBot: !!p.isBot })),
        totalRounds: room.settings.totalRounds,
        questionTime: room.settings.questionTime,
        settings: room.settings,
      };

      room.phase = 'starting';
      io.to(code).emit('game_start', gameStart);
      setTimeout(() => startRound(room), 3000);
    } else {
      for (const p of room.players) {
        if (p.id !== socket.id) {
          io.to(p.id).emit('opponent_wants_rematch');
        }
      }
      socket.emit('waiting_rematch');
    }
  });

  // ── Sair da Sala Voluntariamente ──
  socket.on('leave_room', () => {
    const code = playerRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    playerRoom.delete(socket.id);
    socket.leave(code);

    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) {
      cleanupRoom(code);
    } else {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
      room.players[0].isReady = true;
      io.to(code).emit('player_left', {
        remainingPlayers: room.players.map(p => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isReady: !!p.isReady,
          isHost: true,
        })),
        settings: room.settings,
        message: 'O outro jogador saiu da sala.',
      });
      broadcastPublicRooms();
    }
  });

  // ── Desconexão ──
  socket.on('disconnect', () => {
    console.log(`[-] Desconectado: ${socket.id}`);
    removeFromMatchmaking(socket.id);

    const code = playerRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    playerRoom.delete(socket.id);
    room.players = room.players.filter(p => p.id !== socket.id);

    for (const p of room.players) {
      if (!p.isBot) {
        io.to(p.id).emit('opponent_disconnected', { message: 'Seu adversário desconectou da partida.' });
      }
    }

    if (room.players.length === 0) {
      cleanupRoom(code);
    } else {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
      room.players[0].isReady = true;
      io.to(code).emit('player_left', {
        remainingPlayers: room.players.map(p => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isReady: !!p.isReady,
          isHost: true,
        })),
        settings: room.settings,
        message: 'O adversário se desconectou.',
      });
      broadcastPublicRooms();
    }
  });
});

// ─── Servir Arquivos Estáticos e API de Rede ──────────────────────────────
app.get('/api/network-info', (_, res) => {
  const localIp = getLocalIpAddress();
  res.json({
    localIp,
    port: PORT,
    networkUrl: `http://${localIp}:${PORT}`
  });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── Iniciar Servidor ──────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log(`\n🎮 QuizBattle rodando com suporte Multi-Device (PC / Mobile / Tablet)!`);
  console.log(`📚 Banco de perguntas: ${allQuestions.length} perguntas carregadas!`);
  console.log(`💻 Local (PC):         http://localhost:${PORT}`);
  console.log(`📱 Rede (Celular/Tab):  http://${localIp}:${PORT}\n`);
});
