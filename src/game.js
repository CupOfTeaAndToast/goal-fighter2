(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const FLOOR = 612;
  const LEFT_GOAL_X = 58;
  const RIGHT_GOAL_X = W - 58;
  const GOAL_TOP = 430;
  const GOAL_BOTTOM = 590;
  const GRAVITY = 1850;
  const FRICTION = 0.86;
  const BALL_FRICTION = 0.991;
  const MATCH_TIME = 99;
  const ROUND_GOALS = 3;

  const palette = {
    ink: '#09060c',
    outline: '#150b12',
    cream: '#f7e9c4',
    amber: '#f6c14b',
    red: '#ef315a',
    cyan: '#55d9ff',
    blue: '#2d69e0',
    green: '#24b46d',
    purple: '#8137c9',
    asphalt: '#282939',
    dust: '#b8864d'
  };

  const state = {
    mode: 'title',
    last: 0,
    accumulator: 0,
    time: MATCH_TIME,
    paused: false,
    shake: 0,
    flash: 0,
    banner: 'PRESS KICK',
    bannerTime: 999,
    slow: 0,
    particles: [],
    afterimages: [],
    crowd: [],
    camera: { x: 0, y: 0 },
    winner: null,
    goalLock: false,
    debug: false
  };

  const input = {
    down: new Set(),
    pressed: new Set()
  };

  const controls = {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    kick: ['KeyJ', 'KeyZ', 'Space'],
    slide: ['KeyK', 'KeyX', 'ShiftLeft', 'ShiftRight'],
    pause: ['KeyP']
  };

  const keyFor = action => controls[action].some(code => input.down.has(code));
  const pressedFor = action => controls[action].some(code => input.pressed.has(code));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const sign = value => (value < 0 ? -1 : 1);
  const rand = (min, max) => min + Math.random() * (max - min);

  class AudioArcade {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.enabled = false;
      this.step = 0;
      this.nextNote = 0;
      this.tempo = 124;
      this.notes = [55, 55, 82.41, 73.42, 65.41, 55, 98, 82.41, 55, 73.42, 65.41, 49, 55, 82.41, 110, 98];
      this.lead = [220, 246.94, 261.63, 329.63, 293.66, 261.63, 246.94, 196];
    }

    start() {
      if (this.enabled) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.musicGain.gain.value = 0.13;
      this.musicGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.enabled = true;
      this.nextNote = this.ctx.currentTime;
    }

    update() {
      if (!this.enabled || state.paused) return;
      const now = this.ctx.currentTime;
      const beat = 60 / this.tempo / 2;
      while (this.nextNote < now + 0.08) {
        this.sequence(this.nextNote, this.step);
        this.nextNote += beat;
        this.step = (this.step + 1) % 32;
      }
    }

    tone(freq, time, duration, type = 'square', gain = 0.18, destination = this.master, slideTo = null) {
      if (!this.enabled) return;
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), time + duration);
      amp.gain.setValueAtTime(0.0001, time);
      amp.gain.exponentialRampToValueAtTime(gain, time + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      osc.connect(amp);
      amp.connect(destination);
      osc.start(time);
      osc.stop(time + duration + 0.02);
    }

    noise(time, duration, gain = 0.2, filterFreq = 1600) {
      if (!this.enabled) return;
      const samples = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, samples, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const amp = this.ctx.createGain();
      source.buffer = buffer;
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq;
      amp.gain.setValueAtTime(gain, time);
      amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      source.connect(filter);
      filter.connect(amp);
      amp.connect(this.master);
      source.start(time);
      source.stop(time + duration);
    }

    sequence(time, step) {
      const bass = this.notes[step % this.notes.length];
      this.tone(bass, time, 0.09, 'sawtooth', step % 4 === 0 ? 0.18 : 0.1, this.musicGain);
      if (step % 4 === 2) this.noise(time, 0.045, 0.04, 4200);
      if (step % 8 === 0) this.tone(this.lead[(step / 8) % this.lead.length], time, 0.11, 'square', 0.08, this.musicGain);
      if (step % 16 === 12) this.tone(this.lead[(step / 4) % this.lead.length] * 2, time, 0.07, 'triangle', 0.05, this.musicGain);
    }

    sfx(name) {
      if (!this.enabled) return;
      const t = this.ctx.currentTime;
      if (name === 'kick') {
        this.tone(170, t, 0.08, 'square', 0.34, this.master, 72);
        this.tone(92, t, 0.11, 'sawtooth', 0.16, this.master, 48);
        this.noise(t, 0.055, 0.2, 1050);
      } else if (name === 'slide') {
        this.noise(t, 0.15, 0.23, 520);
        this.tone(120, t, 0.11, 'sawtooth', 0.15, this.master, 54);
      } else if (name === 'hit') {
        this.tone(280, t, 0.08, 'square', 0.24, this.master, 70);
        this.tone(58, t, 0.13, 'sawtooth', 0.2, this.master, 38);
        this.noise(t, 0.095, 0.25, 1450);
      } else if (name === 'goal') {
        [196, 246.94, 293.66, 392, 587.33].forEach((f, i) => this.tone(f, t + i * 0.075, 0.14, 'square', 0.22, this.master));
        this.noise(t, 0.45, 0.12, 2400);
      } else if (name === 'select') {
        this.tone(440, t, 0.05, 'square', 0.12, this.master);
        this.tone(660, t + 0.05, 0.06, 'square', 0.1, this.master);
      } else if (name === 'bounce') {
        this.tone(220, t, 0.045, 'triangle', 0.12, this.master, 150);
      }
    }
  }

  const audio = new AudioArcade();

  const spriteSheets = {
    columns: 3,
    rows: 3,
    frameWidth: 1376 / 3,
    frameHeight: 768 / 3,
    actions: ['idle1', 'idle2', 'run1', 'run2', 'kick1', 'kick2', 'slide1', 'jump1', 'stun1'],
    images: {}
  };

  const artAssets = {
    background: new Image(),
    hud: new Image(),
    effects: new Image()
  };
  artAssets.background.src = 'assets/generated/street-futsal-arena-background.jpg';
  artAssets.hud.src = 'assets/generated/soccer-fighter-hud-ui-sheet.jpg';
  artAssets.effects.src = 'assets/generated/soccer-fighter-effects-sprite-sheet.jpg';

  function loadSpriteSheet(key, src) {
    const image = new Image();
    image.src = src;
    spriteSheets.images[key] = image;
  }

  loadSpriteSheet('rivet', 'rivet-character-sprite-sheet.png');
  loadSpriteSheet('blaze', 'blaze-character-sprite-sheet.png');

  const spritePoses = {
    idle: [
      { bob: 0, torso: 0, head: 0, arms: [[-58, -124, -82, -78], [58, -124, 84, -82]], legs: [[-32, -64, -54, -6], [30, -64, 48, -6]], chest: 1 },
      { bob: -3, torso: -2, head: -2, arms: [[-58, -126, -88, -84], [58, -126, 88, -88]], legs: [[-34, -64, -58, -8], [32, -64, 52, -8]], chest: 1.04 },
      { bob: 1, torso: 1, head: 1, arms: [[-58, -123, -80, -76], [58, -123, 82, -78]], legs: [[-31, -64, -52, -5], [28, -64, 46, -5]], chest: 0.98 }
    ],
    run: [
      { bob: -2, torso: -6, head: -4, arms: [[-58, -124, -94, -72], [56, -123, 78, -154]], legs: [[-30, -64, -82, -10], [30, -64, 72, -4]], chest: 1.02 },
      { bob: 3, torso: 4, head: 2, arms: [[-58, -124, -80, -154], [58, -123, 96, -72]], legs: [[-28, -64, -54, -4], [28, -64, 50, -8]], chest: 0.98 },
      { bob: -2, torso: 6, head: 4, arms: [[-58, -124, -78, -154], [58, -123, 92, -74]], legs: [[-30, -64, -74, -5], [30, -64, 82, -12]], chest: 1.03 },
      { bob: 2, torso: -2, head: 0, arms: [[-58, -124, -96, -80], [58, -123, 80, -150]], legs: [[-28, -64, -50, -8], [28, -64, 54, -4]], chest: 0.97 }
    ],
    kick: [
      { bob: -5, torso: -12, head: -8, arms: [[-62, -126, -98, -92], [58, -126, 78, -170]], legs: [[-28, -64, -58, -4], [30, -64, 58, -38]], chest: 1.08 },
      { bob: -9, torso: -16, head: -10, arms: [[-62, -126, -102, -86], [56, -126, 92, -156]], legs: [[-30, -64, -68, -8], [30, -64, 122, -62]], chest: 1.12 },
      { bob: -5, torso: -8, head: -6, arms: [[-62, -126, -92, -78], [58, -126, 86, -142]], legs: [[-28, -64, -58, -6], [30, -64, 94, -24]], chest: 1.06 }
    ],
    slide: [
      { bob: 44, torso: -28, head: -20, arms: [[-62, -120, -104, -82], [52, -120, 88, -96]], legs: [[-30, -58, -92, -14], [32, -58, 118, -10]], chest: 1.08 },
      { bob: 50, torso: -34, head: -24, arms: [[-64, -118, -108, -78], [50, -118, 96, -92]], legs: [[-30, -58, -110, -12], [32, -58, 136, -8]], chest: 1.1 }
    ],
    jump: [
      { bob: -18, torso: 8, head: 4, arms: [[-58, -126, -88, -162], [58, -126, 86, -164]], legs: [[-32, -64, -66, -30], [30, -64, 64, -30]], chest: 1.04 },
      { bob: -25, torso: 12, head: 8, arms: [[-58, -126, -90, -168], [58, -126, 90, -166]], legs: [[-32, -64, -76, -24], [30, -64, 78, -26]], chest: 1.06 }
    ],
    stun: [
      { bob: 8, torso: 18, head: 14, arms: [[-58, -122, -104, -126], [58, -122, 104, -126]], legs: [[-34, -62, -62, -8], [30, -62, 60, -10]], chest: 0.95 },
      { bob: 10, torso: -18, head: -12, arms: [[-58, -122, -98, -90], [58, -122, 98, -88]], legs: [[-34, -62, -58, -8], [30, -62, 64, -8]], chest: 0.96 }
    ]
  };

  function makePlayer(id, x, team) {
    return {
      id,
      team,
      x,
      y: FLOOR,
      vx: 0,
      vy: 0,
      w: 112,
      h: 190,
      face: id === 0 ? 1 : -1,
      onGround: true,
      kicking: 0,
      sliding: 0,
      stun: 0,
      stamina: 100,
      super: 0,
      score: 0,
      aiKickCooldown: 0,
      anim: 0,
      name: id === 0 ? 'RIVET' : 'BLAZE',
      spriteKey: id === 0 ? 'rivet' : 'blaze',
      jersey: id === 0 ? '09' : '10',
      primary: id === 0 ? '#2d69e0' : '#ef315a',
      secondary: id === 0 ? '#67e7ff' : '#f6c14b',
      skin: id === 0 ? '#c9804c' : '#8f563b',
      hair: id === 0 ? '#16101c' : '#f0c35a'
    };
  }

  const players = [makePlayer(0, 322, 'blue'), makePlayer(1, W - 322, 'red')];
  const ball = { x: W / 2, y: FLOOR - 36, vx: 0, vy: 0, r: 22, spin: 0, lastTouch: null, hot: 0 };

  function initCrowd() {
    state.crowd.length = 0;
    for (let i = 0; i < 56; i++) {
      state.crowd.push({
        x: 120 + i * 21 + rand(-4, 4),
        y: 198 + rand(-18, 20),
        h: rand(12, 28),
        phase: rand(0, Math.PI * 2),
        shirt: ['#ef315a', '#2d69e0', '#f6c14b', '#24b46d', '#8137c9'][i % 5]
      });
    }
  }

  function resetRound(serving = 0) {
    players[0].x = 322;
    players[0].y = FLOOR;
    players[0].vx = 0;
    players[0].vy = 0;
    players[0].face = 1;
    players[0].stun = 0;
    players[0].kicking = 0;
    players[0].sliding = 0;
    players[0].stamina = Math.max(80, players[0].stamina);

    players[1].x = W - 322;
    players[1].y = FLOOR;
    players[1].vx = 0;
    players[1].vy = 0;
    players[1].face = -1;
    players[1].stun = 0;
    players[1].kicking = 0;
    players[1].sliding = 0;
    players[1].stamina = Math.max(80, players[1].stamina);

    ball.x = W / 2 + (serving === 0 ? -70 : 70);
    ball.y = FLOOR - 38;
    ball.vx = serving === 0 ? 90 : -90;
    ball.vy = -80;
    ball.spin = 0;
    ball.hot = 0;
    ball.lastTouch = null;
    state.goalLock = false;
    state.time = MATCH_TIME;
    state.winner = null;
    state.banner = 'ROUND START';
    state.bannerTime = 1.35;
    state.flash = 0.4;
    state.slow = 0;
  }

  function startGame() {
    audio.start();
    audio.sfx('select');
    players[0].score = 0;
    players[1].score = 0;
    players[0].super = 0;
    players[1].super = 0;
    state.mode = 'play';
    state.paused = false;
    resetRound(0);
  }

  function addParticle(x, y, vx, vy, life, color, size = 4, gravity = 0) {
    state.particles.push({ x, y, vx, vy, life, max: life, color, size, gravity });
  }

  function burst(x, y, color, count = 16, power = 260) {
    for (let i = 0; i < count; i++) {
      const a = rand(-Math.PI, Math.PI);
      const p = rand(power * 0.3, power);
      addParticle(x, y, Math.cos(a) * p, Math.sin(a) * p, rand(0.25, 0.65), color, rand(2, 7), 420);
    }
  }

  function dust(x, y, count = 6) {
    for (let i = 0; i < count; i++) {
      addParticle(x + rand(-10, 10), y + rand(-4, 8), rand(-80, 80), rand(-180, -40), rand(0.22, 0.48), palette.dust, rand(3, 9), 680);
    }
  }

  function distRectCircle(player, cx, cy, r) {
    const left = player.x - player.w / 2;
    const right = player.x + player.w / 2;
    const top = player.y - player.h;
    const bottom = player.y;
    const closestX = clamp(cx, left, right);
    const closestY = clamp(cy, top, bottom);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return { hit: dx * dx + dy * dy < r * r, dx, dy, closestX, closestY };
  }

  function updatePlayerHuman(p, dt) {
    if (p.stun > 0) {
      p.stun -= dt;
      p.vx *= 0.94;
      return;
    }

    let move = 0;
    if (keyFor('left')) move -= 1;
    if (keyFor('right')) move += 1;
    if (move) p.face = move;

    const speed = p.sliding > 0 ? 380 : 650;
    p.vx += move * speed * dt;
    p.vx = clamp(p.vx, -360, 360);

    if (pressedFor('up') && p.onGround) {
      p.vy = -780;
      p.onGround = false;
      dust(p.x, p.y, 8);
    }

    if (pressedFor('kick') && p.kicking <= 0 && p.stamina >= 12) {
      p.kicking = 0.22;
      p.stamina -= 12;
      audio.sfx('kick');
    }

    if (pressedFor('slide') && p.sliding <= 0 && p.onGround && p.stamina >= 18) {
      p.sliding = 0.38;
      p.stamina -= 18;
      p.vx = p.face * 640;
      dust(p.x, p.y, 12);
      audio.sfx('slide');
    }
  }

  function updatePlayerAI(p, opponent, dt) {
    if (p.stun > 0) {
      p.stun -= dt;
      p.vx *= 0.94;
      return;
    }

    p.aiKickCooldown -= dt;
    const defend = ball.x < W * 0.58 && ball.vx < 0;
    const target = defend ? clamp(ball.x + 95, W * 0.54, W - 220) : clamp(ball.x - 34, W * 0.22, W - 142);
    const dx = target - p.x;
    const move = Math.abs(dx) > 24 ? sign(dx) : 0;
    if (move) p.face = move;
    p.vx += move * 590 * dt;
    p.vx = clamp(p.vx, -340, 340);

    const nearBall = Math.abs(ball.x - p.x) < 112 && Math.abs(ball.y - (p.y - 72)) < 120;
    if (nearBall && p.aiKickCooldown <= 0 && p.stamina >= 10) {
      p.kicking = 0.24;
      p.stamina -= 10;
      p.aiKickCooldown = rand(0.26, 0.64);
      audio.sfx('kick');
    }

    if (ball.y < p.y - 112 && Math.abs(ball.x - p.x) < 92 && p.onGround && Math.random() < 0.04) {
      p.vy = -710;
      p.onGround = false;
    }

    if (opponent.x > p.x - 100 && opponent.x < p.x + 100 && p.onGround && p.stamina > 22 && Math.random() < 0.015) {
      p.sliding = 0.34;
      p.stamina -= 18;
      p.vx = -520;
      audio.sfx('slide');
    }
  }

  function updatePlayerPhysics(p, dt) {
    p.anim += dt * (Math.abs(p.vx) > 30 ? 11 : 4);
    p.kicking = Math.max(0, p.kicking - dt);
    p.sliding = Math.max(0, p.sliding - dt);
    p.stamina = clamp(p.stamina + dt * 18, 0, 100);
    p.super = clamp(p.super, 0, 100);

    p.vy += GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.y >= FLOOR) {
      if (!p.onGround && p.vy > 260) dust(p.x, FLOOR, 8);
      p.y = FLOOR;
      p.vy = 0;
      p.onGround = true;
    }

    p.x = clamp(p.x, 92, W - 92);
    if (p.onGround && p.sliding <= 0) p.vx *= FRICTION;
    if (Math.abs(p.vx) < 7) p.vx = 0;
  }

  function collidePlayers(dt) {
    const a = players[0];
    const b = players[1];
    const overlap = a.w / 2 + b.w / 2 - Math.abs(a.x - b.x);
    if (overlap > 0 && Math.abs(a.y - b.y) < 120) {
      const push = overlap * 0.5 * sign(a.x - b.x || -1);
      a.x += push;
      b.x -= push;
      a.vx += push * 15;
      b.vx -= push * 15;
    }

    for (const p of players) {
      const other = p === a ? b : a;
      const footX = p.x + p.face * (p.kicking > 0 ? 78 : 46);
      const footY = p.y - (p.kicking > 0 ? 64 : 26);
      const attack = p.kicking > 0 || p.sliding > 0;
      if (!attack || other.stun > 0) continue;
      const range = p.sliding > 0 ? 72 : 58;
      if (Math.abs(footX - other.x) < range && Math.abs(footY - (other.y - 75)) < 84) {
        other.stun = p.sliding > 0 ? 0.36 : 0.22;
        other.vx += p.face * (p.sliding > 0 ? 430 : 260);
        other.vy -= p.sliding > 0 ? 110 : 180;
        p.super += p.sliding > 0 ? 10 : 7;
        state.shake = 8;
        burst(other.x, other.y - 82, p.secondary, 10, 210);
        audio.sfx('hit');
      }
    }
  }

  function kickBall(p) {
    const dx = ball.x - p.x;
    const dy = ball.y - (p.y - 65);
    const d = Math.hypot(dx, dy);
    const activeKick = p.kicking > 0 || p.sliding > 0;
    const canBump = d < 70 || distRectCircle(p, ball.x, ball.y, ball.r).hit;
    if (!activeKick && !canBump) return;

    const facing = p.face;
    const towardGoal = p.id === 0 ? 1 : -1;
    const strength = activeKick ? (p.sliding > 0 ? 820 : 1040) : 220;
    const aimX = activeKick ? towardGoal : sign(dx || facing);
    const lift = activeKick ? -rand(220, 520) : -80;

    if (d < (activeKick ? 118 : 62)) {
      ball.vx += aimX * strength + p.vx * 0.55;
      ball.vy += lift + p.vy * 0.1;
      ball.spin += aimX * rand(9, 16);
      ball.hot = activeKick ? 0.45 : 0.12;
      ball.lastTouch = p.id;
      p.super += activeKick ? 12 : 2;
      state.shake = activeKick ? 9 : 3;
      burst(ball.x, ball.y, activeKick ? p.secondary : palette.cream, activeKick ? 18 : 5, activeKick ? 320 : 110);
      audio.sfx(activeKick ? 'hit' : 'bounce');
      state.afterimages.push({
        x: p.x,
        y: p.y,
        face: p.face,
        vx: p.vx,
        anim: p.anim,
        onGround: p.onGround,
        kicking: p.kicking,
        sliding: p.sliding,
        stun: p.stun,
        spriteKey: p.spriteKey,
        primary: p.primary,
        secondary: p.secondary,
        skin: p.skin,
        hair: p.hair,
        jersey: p.jersey,
        life: 0.22,
        max: 0.22
      });
    }
  }

  function updateBall(dt) {
    ball.vy += GRAVITY * dt * 0.55;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spin += ball.vx * dt * 0.035;
    ball.hot = Math.max(0, ball.hot - dt);

    if (ball.y + ball.r > FLOOR) {
      ball.y = FLOOR - ball.r;
      if (Math.abs(ball.vy) > 150) {
        audio.sfx('bounce');
        dust(ball.x, FLOOR, clamp(Math.abs(ball.vy) / 90, 3, 12));
      }
      ball.vy *= -0.66;
      ball.vx *= BALL_FRICTION;
      if (Math.abs(ball.vy) < 28) ball.vy = 0;
    }

    if (ball.y - ball.r < 142) {
      ball.y = 142 + ball.r;
      ball.vy = Math.abs(ball.vy) * 0.7;
      audio.sfx('bounce');
    }

    const goalZone = ball.y > GOAL_TOP && ball.y < GOAL_BOTTOM;
    if (ball.x - ball.r < LEFT_GOAL_X && goalZone) scoreGoal(1);
    else if (ball.x + ball.r > RIGHT_GOAL_X && goalZone) scoreGoal(0);
    else {
      if (ball.x - ball.r < 46) {
        ball.x = 46 + ball.r;
        ball.vx = Math.abs(ball.vx) * 0.72;
        audio.sfx('bounce');
      }
      if (ball.x + ball.r > W - 46) {
        ball.x = W - 46 - ball.r;
        ball.vx = -Math.abs(ball.vx) * 0.72;
        audio.sfx('bounce');
      }
    }

    ball.vx = clamp(ball.vx, -1450, 1450);
    ball.vy = clamp(ball.vy, -1250, 1250);
  }

  function scoreGoal(playerId) {
    if (state.goalLock || state.mode !== 'play') return;
    state.goalLock = true;
    ball.vx = 0;
    ball.vy = 0;
    const scorer = players[playerId];
    scorer.score += 1;
    scorer.super = clamp(scorer.super + 30, 0, 100);
    state.banner = `${scorer.name} GOAL!`;
    state.bannerTime = 2.1;
    state.flash = 1;
    state.shake = 22;
    state.slow = 0.35;
    burst(ball.x, ball.y, scorer.secondary, 48, 520);
    audio.sfx('goal');

    if (scorer.score >= ROUND_GOALS) {
      state.mode = 'gameover';
      state.winner = scorer.name;
      state.banner = `${scorer.name} WINS`;
      state.bannerTime = 999;
      return;
    }

    setTimeout(() => {
      if (state.mode === 'play') resetRound(1 - playerId);
    }, 1050);
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.afterimages.length - 1; i >= 0; i--) {
      state.afterimages[i].life -= dt;
      if (state.afterimages[i].life <= 0) state.afterimages.splice(i, 1);
    }
  }

  function update(dt) {
    audio.update();
    if (pressedFor('pause') && state.mode === 'play') state.paused = !state.paused;
    if (state.paused) return;

    if (state.mode === 'title') {
      state.bannerTime += dt;
      if (pressedFor('kick') || pressedFor('slide')) startGame();
      return;
    }

    if (state.mode === 'gameover') {
      if (pressedFor('kick') || pressedFor('slide')) startGame();
      updateParticles(dt);
      return;
    }

    const slowFactor = state.slow > 0 ? 0.42 : 1;
    const step = dt * slowFactor;
    state.slow = Math.max(0, state.slow - dt);
    state.time = Math.max(0, state.time - step);
    state.shake = Math.max(0, state.shake - dt * 32);
    state.flash = Math.max(0, state.flash - dt * 1.8);
    state.bannerTime = Math.max(0, state.bannerTime - dt);

    if (state.time <= 0) {
      if (players[0].score === players[1].score) {
        state.time = 20;
        state.banner = 'SUDDEN GOAL';
        state.bannerTime = 1.8;
      } else {
        state.mode = 'gameover';
        state.winner = players[0].score > players[1].score ? players[0].name : players[1].name;
        state.banner = `${state.winner} WINS`;
        state.bannerTime = 999;
      }
    }

    updatePlayerHuman(players[0], step);
    updatePlayerAI(players[1], players[0], step);
    for (const p of players) updatePlayerPhysics(p, step);
    collidePlayers(step);
    for (const p of players) kickBall(p);
    updateBall(step);
    updateParticles(step);

    const center = (players[0].x + players[1].x + ball.x) / 3;
    state.camera.x += (clamp(center - W / 2, -24, 24) - state.camera.x) * 0.04;
    state.camera.y = state.shake > 0 ? rand(-state.shake, state.shake) : 0;
  }

  function pixelRect(x, y, w, h, fill, stroke = palette.outline, line = 4) {
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    if (stroke && line > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = line;
      ctx.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }
  }

  function drawText(text, x, y, size, fill = palette.cream, align = 'center', stroke = palette.outline, width = 7) {
    ctx.save();
    ctx.font = `${size}px Impact, Haettenschweiler, Arial Black, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawBackground(t) {
    if (artAssets.background.complete && artAssets.background.naturalWidth > 0) {
      ctx.save();
      ctx.translate(-state.camera.x * 0.08, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(artAssets.background, -18, 0, W + 36, H);
      ctx.restore();
      drawGoal(LEFT_GOAL_X, -1);
      drawGoal(RIGHT_GOAL_X, 1);
      return;
    }

    const sky = ctx.createLinearGradient(0, 0, 0, FLOOR);
    sky.addColorStop(0, '#101730');
    sky.addColorStop(0.44, '#20162c');
    sky.addColorStop(1, '#3c2230');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-state.camera.x * 0.25, 0);
    for (let i = 0; i < 11; i++) {
      const x = i * 156 - 60;
      const h = 170 + (i % 4) * 42;
      pixelRect(x, 200 - h * 0.15, 126, h, i % 2 ? '#241f36' : '#1a2234', '#11101a', 3);
      for (let wy = 0; wy < 5; wy++) {
        for (let wx = 0; wx < 3; wx++) {
          if ((wx + wy + i) % 3 !== 0) pixelRect(x + 18 + wx * 30, 230 + wy * 34, 14, 16, '#f5b845', null, 0);
        }
      }
    }
    ctx.restore();

    ctx.save();
    ctx.translate(-state.camera.x * 0.45, 0);
    pixelRect(56, 256, W - 112, 210, '#5a2635', '#1a0d16', 5);
    for (let y = 270; y < 450; y += 26) {
      for (let x = 62 + ((y / 26) % 2) * 18; x < W - 82; x += 38) {
        ctx.fillStyle = y % 52 ? '#733142' : '#482232';
        ctx.fillRect(x, y, 34, 18);
      }
    }
    pixelRect(116, 182, 220, 82, '#1e2031', '#08060a', 5);
    drawText('NO FOULS', 226, 224, 30, palette.amber, 'center', palette.outline, 5);
    pixelRect(W - 336, 178, 226, 86, '#1e2031', '#08060a', 5);
    drawText('GOALS ONLY', W - 223, 221, 27, palette.cyan, 'center', palette.outline, 5);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = '#9ea6b8';
    ctx.lineWidth = 2;
    for (let x = 38; x < W; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, 272);
      ctx.lineTo(x + 180, 462);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 180, 272);
      ctx.lineTo(x, 462);
      ctx.stroke();
    }
    ctx.restore();

    for (const c of state.crowd) {
      const bob = Math.sin(t * 5 + c.phase) * 3;
      pixelRect(c.x, c.y + bob, 10, c.h, c.shirt, '#130b10', 2);
      pixelRect(c.x + 1, c.y - 10 + bob, 8, 8, '#b87954', '#130b10', 2);
    }

    const court = ctx.createLinearGradient(0, 460, 0, H);
    court.addColorStop(0, '#34364a');
    court.addColorStop(1, '#181a25');
    ctx.fillStyle = court;
    ctx.beginPath();
    ctx.moveTo(0, 470);
    ctx.lineTo(W, 470);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ddd6bd';
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.ellipse(W / 2, FLOOR + 10, 150, 48, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2, 470);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.globalAlpha = 1;

    for (let x = 0; x < W; x += 34) {
      ctx.fillStyle = x % 68 === 0 ? '#222434' : '#2a2c3e';
      ctx.fillRect(x, FLOOR + 22, 34, 38);
    }

    drawGoal(LEFT_GOAL_X, -1);
    drawGoal(RIGHT_GOAL_X, 1);
  }

  function drawGoal(x, side) {
    const w = 104;
    const depth = 48 * side;
    ctx.save();
    ctx.lineWidth = 7;
    ctx.strokeStyle = palette.cream;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.moveTo(x, GOAL_TOP);
    ctx.lineTo(x + depth, GOAL_TOP + 34);
    ctx.lineTo(x + depth, GOAL_BOTTOM);
    ctx.lineTo(x, GOAL_BOTTOM);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    for (let y = GOAL_TOP + 18; y < GOAL_BOTTOM; y += 22) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + depth, y + 16);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (depth / 5) * i, GOAL_TOP + i * 7);
      ctx.lineTo(x + (depth / 5) * i, GOAL_BOTTOM);
      ctx.stroke();
    }
    ctx.restore();
  }

  function getSpriteFrame(p) {
    let animation = 'idle';
    let sheetAction = 'idle1';
    if (p.stun > 0) {
      animation = 'stun';
      sheetAction = 'stun1';
    } else if (p.sliding > 0) {
      animation = 'slide';
      sheetAction = 'slide1';
    } else if (p.kicking > 0) {
      animation = 'kick';
      sheetAction = Math.floor(p.anim * 18) % 2 === 0 ? 'kick1' : 'kick2';
    } else if (!p.onGround) {
      animation = 'jump';
      sheetAction = 'jump1';
    } else if (Math.abs(p.vx) > 45) {
      animation = 'run';
      sheetAction = Math.floor(p.anim * 13) % 2 === 0 ? 'run1' : 'run2';
    } else {
      sheetAction = Math.floor(p.anim * 5) % 2 === 0 ? 'idle1' : 'idle2';
    }
    const frames = spritePoses[animation];
    const speed = animation === 'run' ? 13 : animation === 'idle' ? 5 : 16;
    return { animation, sheetAction, frame: frames[Math.floor(p.anim * speed) % frames.length] };
  }

  function drawPlayer(p, alpha = 1) {
    const x = p.x;
    const y = p.y;
    const f = p.face;
    const { animation, sheetAction, frame } = getSpriteFrame(p);
    if (drawPlayerSpriteSheet(p, animation, sheetAction, frame, alpha)) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y + frame.bob));
    ctx.scale(f, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 14 - frame.bob * 0.15, animation === 'slide' ? 92 : 64, animation === 'slide' ? 15 : 17, 0, 0, Math.PI * 2);
    ctx.fill();

    drawSpriteLimb(frame.legs[0], 26, '#1f202b', p.secondary, true);
    drawSpriteLimb(frame.legs[1], 27, '#1f202b', p.secondary, true);
    drawSpriteLimb(frame.arms[0], 25, p.skin, p.secondary, false);
    drawSpriteLimb(frame.arms[1], 25, p.skin, p.secondary, false);

    ctx.save();
    ctx.translate(0, frame.torso);
    drawTorso(p, frame);
    drawHead(p, frame);
    ctx.restore();

    if (p.kicking > 0) drawKickArc(p);
    if (p.sliding > 0) drawSlideTrail(p);
    if (p.stun > 0) drawStunStars();

    ctx.restore();
  }

  function drawPlayerSpriteSheet(p, animation, sheetAction, frame, alpha) {
    const image = spriteSheets.images[p.spriteKey];
    if (!image || !image.complete || image.naturalWidth === 0) return false;
    const frameIndex = spriteSheets.actions.indexOf(sheetAction);
    if (frameIndex < 0) return false;

    const drawW = 210;
    const drawH = 236;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(p.x), Math.round(p.y - drawH + frame.bob + 8));
    ctx.scale(p.face, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(0, drawH - 4 - frame.bob * 0.15, animation === 'slide' ? 92 : 64, animation === 'slide' ? 15 : 17, 0, 0, Math.PI * 2);
    ctx.fill();
    const sourceX = (frameIndex % spriteSheets.columns) * spriteSheets.frameWidth;
    const sourceY = Math.floor(frameIndex / spriteSheets.columns) * spriteSheets.frameHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      spriteSheets.frameWidth,
      spriteSheets.frameHeight,
      -drawW / 2,
      0,
      drawW,
      drawH
    );
    if (p.kicking > 0) drawKickArc(p);
    if (p.sliding > 0) drawSlideTrail(p);
    if (p.stun > 0) drawStunStars();
    ctx.restore();
    return true;
  }

  function drawTorso(p, frame) {
    ctx.save();
    ctx.scale(frame.chest, 1);
    pixelRect(-50, -154, 100, 34, p.primary, palette.outline, 6);
    pixelRect(-44, -124, 88, 62, p.primary, palette.outline, 6);
    pixelRect(-38, -147, 76, 14, p.secondary, null, 0);
    pixelRect(-49, -116, 16, 42, shade(p.primary, -28), null, 0);
    pixelRect(30, -116, 16, 42, shade(p.primary, 20), null, 0);
    pixelRect(-62, -143, 28, 44, p.primary, palette.outline, 5);
    pixelRect(34, -143, 28, 44, p.primary, palette.outline, 5);
    pixelRect(-38, -63, 35, 34, '#191a25', palette.outline, 5);
    pixelRect(4, -63, 35, 34, '#191a25', palette.outline, 5);
    pixelRect(-21, -64, 8, 34, p.secondary, null, 0);
    pixelRect(19, -64, 8, 34, p.secondary, null, 0);
    drawText(p.jersey, 0, -101, 30, '#ffffff', 'center', palette.outline, 4);
    ctx.restore();
  }

  function drawHead(p, frame) {
    ctx.save();
    ctx.translate(0, frame.head);
    pixelRect(-28, -190, 56, 17, p.hair, palette.outline, 5);
    pixelRect(-25, -178, 52, 42, p.skin, palette.outline, 5);
    pixelRect(-18, -182, 42, 9, shade(p.hair, 30), null, 0);
    pixelRect(4, -164, 9, 7, '#fff7db', palette.outline, 2);
    pixelRect(16, -153, 17, 6, '#3b1514', null, 0);
    pixelRect(-26, -155, 9, 10, shade(p.skin, -35), null, 0);
    pixelRect(-17, -136, 34, 9, shade(p.skin, -20), palette.outline, 3);
    ctx.restore();
  }

  function drawSpriteLimb(limb, width, color, accent, hasSock) {
    const [x1, y1, x2, y2] = limb;
    drawLimb(x1, y1, x2, y2, width, color);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const nx = dx / length;
    const ny = dy / length;
    if (hasSock) {
      drawLimb(x1 + dx * 0.58, y1 + dy * 0.58, x2 - nx * 15, y2 - ny * 15, width * 0.72, accent);
      pixelRect(x2 - 22, y2 - 8, 44, 16, accent, palette.outline, 4);
      pixelRect(x2 + 2, y2 - 3, 18, 8, '#101018', null, 0);
    } else {
      drawLimb(x1 + dx * 0.55, y1 + dy * 0.55, x2, y2, width * 0.58, accent);
      pixelRect(x2 - 12, y2 - 10, 24, 20, accent, palette.outline, 4);
    }
  }

  function drawLimb(x1, y1, x2, y2, width, color) {
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = width + 9;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(Math.round(x1), Math.round(y1));
    ctx.lineTo(Math.round(x2), Math.round(y2));
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(Math.round(x1), Math.round(y1));
    ctx.lineTo(Math.round(x2), Math.round(y2));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = Math.max(3, width * 0.18);
    ctx.beginPath();
    ctx.moveTo(Math.round(x1 - 3), Math.round(y1 - 4));
    ctx.lineTo(Math.round(x2 - 3), Math.round(y2 - 4));
    ctx.stroke();
  }

  function drawKickArc(p) {
    ctx.strokeStyle = p.secondary;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(70, -66, 72, -0.95, 0.45);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(74, -66, 52, -0.75, 0.25);
    ctx.stroke();
  }

  function drawSlideTrail(p) {
    ctx.globalAlpha *= 0.75;
    pixelRect(-132, -24, 70, 10, p.secondary, null, 0);
    pixelRect(-152, -10, 96, 8, palette.cream, null, 0);
    ctx.globalAlpha /= 0.75;
  }

  function drawStunStars() {
    drawText('★', -22, -218, 27, palette.amber, 'center', palette.outline, 3);
    drawText('★', 22, -226, 22, palette.cyan, 'center', palette.outline, 3);
    drawText('★', 2, -244, 18, palette.red, 'center', palette.outline, 3);
  }

  function shade(hex, amount) {
    const value = hex.replace('#', '');
    const num = parseInt(value, 16);
    const r = clamp((num >> 16) + amount, 0, 255);
    const g = clamp(((num >> 8) & 255) + amount, 0, 255);
    const b = clamp((num & 255) + amount, 0, 255);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function drawBall() {
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.spin);
    if (ball.hot > 0) {
      ctx.globalAlpha = ball.hot * 1.4;
      ctx.strokeStyle = palette.amber;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, ball.r + 14, 0.3, 5.3);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = palette.outline;
    ctx.beginPath();
    ctx.arc(0, 0, ball.r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f1df';
    ctx.beginPath();
    ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#15151d';
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(8, 0);
      ctx.lineTo(4, 11);
      ctx.lineTo(-7, 7);
      ctx.lineTo(-9, -3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHUD() {
    pixelRect(24, 18, 430, 60, '#1c1623', palette.outline, 5);
    pixelRect(W - 454, 18, 430, 60, '#1c1623', palette.outline, 5);
    pixelRect(W / 2 - 96, 14, 192, 72, '#11121d', palette.outline, 6);

    drawMeter(110, 38, 314, 18, players[0].stamina, palette.cyan, '#20202e');
    drawMeter(W - 424, 38, 314, 18, players[1].stamina, palette.red, '#20202e', true);
    drawMeter(110, 63, 314, 9, players[0].super, palette.amber, '#20202e');
    drawMeter(W - 424, 63, 314, 9, players[1].super, palette.amber, '#20202e', true);

    drawPortrait(players[0], 32, 28);
    drawPortrait(players[1], W - 88, 28);
    drawText(players[0].name, 164, 100, 23, palette.cyan, 'left', palette.outline, 4);
    drawText(players[1].name, W - 164, 100, 23, palette.red, 'right', palette.outline, 4);
    drawText(`${players[0].score} - ${players[1].score}`, W / 2, 42, 38, palette.amber, 'center', palette.outline, 5);
    drawText(`${Math.ceil(state.time)}`, W / 2, 73, 25, palette.cream, 'center', palette.outline, 4);

    if (state.bannerTime > 0) {
      const scale = 1 + Math.sin(state.bannerTime * 14) * 0.03;
      ctx.save();
      ctx.translate(W / 2, 220);
      ctx.scale(scale, scale);
      drawText(state.banner, 0, 0, 74, palette.amber, 'center', palette.outline, 9);
      ctx.restore();
    }

    if (state.paused) drawText('PAUSED', W / 2, H / 2, 76, palette.cyan, 'center', palette.outline, 9);
  }

  function drawMeter(x, y, w, h, value, fill, bg, reverse = false) {
    pixelRect(x, y, w, h, bg, '#07060b', 3);
    const fw = Math.round((w - 8) * clamp(value, 0, 100) / 100);
    ctx.fillStyle = fill;
    if (reverse) ctx.fillRect(x + w - 4 - fw, y + 4, fw, h - 8);
    else ctx.fillRect(x + 4, y + 4, fw, h - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    if (reverse) ctx.fillRect(x + w - 4 - fw, y + 4, fw, 4);
    else ctx.fillRect(x + 4, y + 4, fw, 4);
  }

  function drawPortrait(p, x, y) {
    pixelRect(x, y, 56, 56, '#21192b', palette.outline, 4);
    pixelRect(x + 14, y + 12, 28, 28, p.skin, palette.outline, 3);
    pixelRect(x + 10, y + 8, 36, 13, p.hair, palette.outline, 3);
    pixelRect(x + 28, y + 27, 7, 5, '#fff', palette.outline, 1);
    pixelRect(x + 18, y + 42, 22, 8, p.primary, palette.outline, 2);
  }

  function render() {
    const t = performance.now() / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(Math.round(-state.camera.x + rand(-state.shake, state.shake)), Math.round(state.camera.y));

    drawBackground(t);

    for (const img of state.afterimages) {
      try {
        drawPlayer(img, img.life / img.max * 0.35);
      } catch (error) {
        img.life = 0;
      }
    }
    const ordered = [...players].sort((a, b) => a.y - b.y);
    drawBall();
    for (const p of ordered) drawPlayer(p);

    for (const p of state.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      pixelRect(p.x, p.y, p.size, p.size, p.color, null, 0);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
    drawHUD();

    if (state.mode === 'title') drawTitle();
    if (state.mode === 'gameover') drawGameOver();

    if (state.flash > 0) {
      ctx.globalAlpha = state.flash * 0.34;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.lineWidth = 24;
    ctx.strokeRect(12, 12, W - 24, H - 24);
  }

  function drawTitle() {
    ctx.save();
    ctx.fillStyle = 'rgba(5, 5, 10, 0.58)';
    ctx.fillRect(0, 0, W, H);
    drawText('GOAL FIGHTER', W / 2, 225, 112, palette.amber, 'center', palette.outline, 12);
    drawText('WORLD STREET CUP', W / 2, 304, 42, palette.cyan, 'center', palette.outline, 7);
    drawText('Score 3 goals before Blaze does.', W / 2, 398, 34, palette.cream, 'center', palette.outline, 5);
    drawText('Kick the ball. Slide the rival. Own the alley.', W / 2, 444, 30, palette.cream, 'center', palette.outline, 5);
    drawText('Press J / Z / SPACE to start', W / 2, 544 + Math.sin(performance.now() / 170) * 7, 42, palette.red, 'center', palette.outline, 7);
    ctx.restore();
  }

  function drawGameOver() {
    ctx.save();
    ctx.fillStyle = 'rgba(5, 5, 10, 0.62)';
    ctx.fillRect(0, 0, W, H);
    drawText(`${state.winner} WINS`, W / 2, 282, 104, palette.amber, 'center', palette.outline, 12);
    drawText(`FINAL SCORE ${players[0].score} - ${players[1].score}`, W / 2, 380, 46, palette.cream, 'center', palette.outline, 7);
    drawText('Press kick to run it back', W / 2, 502, 42, palette.cyan, 'center', palette.outline, 7);
    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - state.last) / 1000 || 0);
    state.last = now;
    update(dt);
    render();
    input.pressed.clear();
    requestAnimationFrame(loop);
  }

  function boot() {
    initCrowd();
    resetRound(0);
    state.mode = 'title';
    window.addEventListener('keydown', e => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!input.down.has(e.code)) input.pressed.add(e.code);
      input.down.add(e.code);
    });
    window.addEventListener('keyup', e => input.down.delete(e.code));
    window.addEventListener('pointerdown', () => {
      audio.start();
      if (state.mode !== 'play') startGame();
      else input.pressed.add('Space');
    });
    requestAnimationFrame(loop);
  }

  boot();
})();
