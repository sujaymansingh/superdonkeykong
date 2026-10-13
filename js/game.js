const { init, Sprite, SpriteSheet, GameLoop, initKeys, keyPressed, load, imageAssets } = kontra;

const { canvas, context } = init('game');
initKeys();

const W = canvas.width;
const H = canvas.height;

// Sprites are drawn at native SNES size and scaled up.
const SCALE = 2;
const WALK_SPEED = 1.5;
const CLIMB_SPEED = 1;
const JUMP_VELOCITY = -3.6;
const GRAVITY = 0.2;
const HAMMER_SECONDS = 30;

const BARREL_RADIUS = 8;
const BARREL_SPEED = 2;
const THROW_INTERVAL = [1.8, 3.5]; // seconds, min/max

// Mario's collision box, relative to his feet (sprite anchor).
const MARIO_W = 16;
const MARIO_H = 48;
const HAMMER_REACH = 36;

// ---------------------------------------------------------------------------
// Level layout. Platform y is the walking surface; gaps alternate ends so
// barrels zig-zag down. Ladders join the platform at `bottom` to the one at `top`.

const GIRDER_HEIGHT = 10;
const PLATFORMS = [
  { y: 496, x1: 0,  x2: 448 },   // ground
  { y: 396, x1: 56, x2: 448 },   // gap on the left
  { y: 296, x1: 0,  x2: 392 },   // gap on the right
  { y: 196, x1: 56, x2: 448 },
  { y: 96,  x1: 0,  x2: 392 }    // top, with the gorilla
];

const LADDER_WIDTH = 20;
// Kept well away from the gaps, so barrels don't drop onto the top of a ladder.
const LADDERS = [
  { x: 260, bottom: 496, top: 396 },
  { x: 160, bottom: 396, top: 296 },
  { x: 290, bottom: 296, top: 196 },
  { x: 220, bottom: 196, top: 96 }
];

const GORILLA = { x: 16, y: 32, w: 64, h: 64 };
const START = { x: 24, y: PLATFORMS[0].y };
const HAMMER_SPOTS = [
  { x: 420, platformY: 396 },
  { x: 100, platformY: 196 }
];

// ---------------------------------------------------------------------------
// Helpers

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function onPlatform(p, x) {
  return x >= p.x1 && x <= p.x2;
}

function randomBetween([min, max]) {
  return min + Math.random() * (max - min);
}

// Keys that act once per press rather than while held. pollKeys() runs once per
// frame so a key's previous state is always current, whatever state the game is in.
const ONE_SHOT_KEYS = ['space', 'enter'];
const wasDown = {};
const justPressed = {};
function pollKeys() {
  for (const key of ONE_SHOT_KEYS) {
    const down = keyPressed(key);
    justPressed[key] = down && !wasDown[key];
    wasDown[key] = down;
  }
}

// ---------------------------------------------------------------------------
// Drawing for things that don't have sprites yet

function drawPlatform(p) {
  const w = p.x2 - p.x1;
  context.fillStyle = '#c8283c';
  context.fillRect(p.x1, p.y, w, GIRDER_HEIGHT);
  // Girder cross-bracing.
  context.strokeStyle = '#6e0f1e';
  context.lineWidth = 2;
  context.beginPath();
  for (let x = p.x1; x < p.x2; x += 16) {
    context.moveTo(x, p.y + GIRDER_HEIGHT);
    context.lineTo(Math.min(x + 8, p.x2), p.y);
    context.lineTo(Math.min(x + 16, p.x2), p.y + GIRDER_HEIGHT);
  }
  context.stroke();
}

function drawLadder(l) {
  const left = l.x - LADDER_WIDTH / 2;
  const right = l.x + LADDER_WIDTH / 2;
  const top = l.top + GIRDER_HEIGHT;
  context.strokeStyle = '#3cc8dc';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(left, l.bottom);
  context.moveTo(right, top);
  context.lineTo(right, l.bottom);
  for (let y = top + 8; y < l.bottom; y += 10) {
    context.moveTo(left, y);
    context.lineTo(right, y);
  }
  context.stroke();
}

function drawGorilla() {
  const { x, y, w, h } = GORILLA;
  context.fillStyle = '#7a3f1a';
  context.fillRect(x, y, w, h);
  context.fillStyle = '#e8b080';
  context.fillRect(x + 16, y + 12, 32, 24);
  context.fillStyle = '#000';
  context.fillRect(x + 22, y + 18, 6, 6);
  context.fillRect(x + 36, y + 18, 6, 6);
  context.fillStyle = '#fff';
  context.font = 'bold 14px monospace';
  context.textAlign = 'center';
  context.fillText('DK', x + w / 2, y + 56);
}

function drawHammerPickup(h) {
  const { x, y } = hammerBox(h);
  context.fillStyle = '#b07040';
  context.fillRect(x + 6, y + 6, 4, 14);
  context.fillStyle = '#e0b030';
  context.fillRect(x, y, 16, 8);
}

function drawBarrel(b) {
  context.save();
  context.translate(b.x, b.y);
  context.rotate(b.angle);
  context.fillStyle = '#c06a28';
  context.beginPath();
  context.arc(0, 0, BARREL_RADIUS, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#5a2a08';
  context.lineWidth = 2;
  context.stroke();
  context.beginPath();
  context.moveTo(-BARREL_RADIUS, 0);
  context.lineTo(BARREL_RADIUS, 0);
  context.stroke();
  context.restore();
}

function drawMessage(lines) {
  context.fillStyle = 'rgba(0, 0, 0, 0.7)';
  context.fillRect(0, H / 2 - 40, W, 80);
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.font = 'bold 24px monospace';
  context.fillText(lines[0], W / 2, H / 2 - 4);
  context.font = '14px monospace';
  context.fillText(lines[1], W / 2, H / 2 + 22);
}

function hammerBox(h) {
  // Floats at head height above its platform; walk into it (or jump) to grab it.
  return { x: h.x - 8, y: h.platformY - 52, w: 16, h: 20 };
}

// ---------------------------------------------------------------------------

load('assets/mario.png').then(() => {
  // assets/mario.png is generated by tools/build_mario_sheet.py: 48x48 cells,
  // Mario's body centred and feet on the bottom row, all frames facing right.
  const sheet = SpriteSheet({
    image: imageAssets['assets/mario.png'],
    frameWidth: 48,
    frameHeight: 48,
    animations: {
      idle:      { frames: 0 },
      walk:      { frames: [1, 0, 2, 0], frameRate: 10 },
      climb:     { frames: [3, 4], frameRate: 6 },
      climbIdle: { frames: 3 },
      hammer:    { frames: [5, 6], frameRate: 6 },
      jump:      { frames: 7 },
      fall:      { frames: 8 }
    }
  });

  const mario = Sprite({
    anchor: { x: 0.5, y: 1 },
    scaleX: SCALE,
    scaleY: SCALE,
    animations: sheet.animations
  });

  // Game state, (re)initialised by reset().
  let state;          // 'playing' | 'dead' | 'won'
  let facing;
  let platform;       // platform Mario is standing on, or null in the air / on a ladder
  let ladder;         // ladder Mario is on, or null
  let vy;
  let jumpDx;
  let hammerTime;     // seconds of hammer left; 0 = no hammer
  let hammers;
  let barrels;
  let throwTimer;

  function reset() {
    state = 'playing';
    mario.x = START.x;
    mario.y = START.y;
    facing = 1;
    platform = PLATFORMS[0];
    ladder = null;
    vy = 0;
    jumpDx = 0;
    hammerTime = 0;
    hammers = HAMMER_SPOTS.map(h => ({ ...h }));
    barrels = [];
    throwTimer = 1;
  }

  function play(name) {
    // playAnimation restarts the animation, so only call it on a change.
    if (mario.currentAnimation !== mario.animations[name]) {
      mario.playAnimation(name);
    }
  }

  function marioBox() {
    return { x: mario.x - MARIO_W / 2, y: mario.y - MARIO_H, w: MARIO_W, h: MARIO_H };
  }

  function ladderAt(feetY, end) {
    return LADDERS.find(l => l[end] === feetY && Math.abs(mario.x - l.x) <= 8);
  }

  // Lands anything falling from prevY to y on the first platform it crosses.
  function landingPlatform(x, prevY, y) {
    return PLATFORMS.find(p => prevY <= p.y && y >= p.y && onPlatform(p, x));
  }

  function updateMario(dt) {
    const hasHammer = hammerTime > 0;
    const inputDx = (keyPressed('arrowright') ? 1 : 0) - (keyPressed('arrowleft') ? 1 : 0);
    const inputDy = (keyPressed('arrowdown') ? 1 : 0) - (keyPressed('arrowup') ? 1 : 0);

    if (hasHammer) {
      hammerTime = Math.max(0, hammerTime - dt);
    }

    if (platform) {
      // Standing: walk, jump, or get on a ladder (not while holding the hammer).
      const up = !hasHammer && inputDy < 0 && ladderAt(platform.y, 'bottom');
      const down = !hasHammer && inputDy > 0 && ladderAt(platform.y, 'top');
      if (up || down) {
        ladder = up || down;
        platform = null;
        mario.x = ladder.x;
      } else if (justPressed.space && !hasHammer) {
        // Straight up, or sideways if moving. No steering once in the air.
        platform = null;
        vy = JUMP_VELOCITY;
        jumpDx = inputDx;
      } else {
        if (inputDx) facing = inputDx;
        mario.x = Math.max(MARIO_W / 2, Math.min(W - MARIO_W / 2, mario.x + inputDx * WALK_SPEED));
        if (!onPlatform(platform, mario.x)) {
          // Walked off the end into a gap.
          platform = null;
          vy = 0;
          jumpDx = inputDx;
        }
      }
    }

    if (ladder) {
      mario.y += inputDy * CLIMB_SPEED;
      if (mario.y <= ladder.top || mario.y >= ladder.bottom) {
        mario.y = mario.y <= ladder.top ? ladder.top : ladder.bottom;
        platform = PLATFORMS.find(p => p.y === mario.y);
        ladder = null;
      }
    } else if (!platform) {
      // In the air: jumping or falling.
      if (jumpDx) facing = jumpDx;
      const prevY = mario.y;
      vy += GRAVITY;
      mario.x = Math.max(MARIO_W / 2, Math.min(W - MARIO_W / 2, mario.x + jumpDx * WALK_SPEED));
      mario.y += vy;
      const landed = vy > 0 && landingPlatform(mario.x, prevY, mario.y);
      if (landed) {
        platform = landed;
        mario.y = landed.y;
        vy = 0;
      }
    }

    mario.scaleX = facing * SCALE;
    if (ladder) {
      play(inputDy ? 'climb' : 'climbIdle');
    } else if (hammerTime > 0) {
      play('hammer');
    } else if (!platform) {
      play(vy < 0 ? 'jump' : 'fall');
    } else {
      play(inputDx ? 'walk' : 'idle');
    }
    mario.update();
  }

  function updateBarrels(dt) {
    throwTimer -= dt;
    if (throwTimer <= 0) {
      throwTimer = randomBetween(THROW_INTERVAL);
      const top = PLATFORMS[PLATFORMS.length - 1];
      barrels.push({
        x: GORILLA.x + GORILLA.w + BARREL_RADIUS,
        y: top.y - BARREL_RADIUS,
        vx: BARREL_SPEED,
        vy: 0,
        platform: top,
        angle: 0
      });
    }

    for (const b of barrels) {
      b.angle += b.vx / BARREL_RADIUS;
      if (b.platform) {
        b.x += b.vx;
        if (!onPlatform(b.platform, b.x)) {
          b.platform = null;
          b.vy = 0;
        }
      } else {
        const prevBottom = b.y + BARREL_RADIUS;
        b.vy += GRAVITY;
        b.y += b.vy;
        const landed = landingPlatform(b.x, prevBottom, b.y + BARREL_RADIUS);
        if (landed) {
          // Each level rolls the opposite way to the one above.
          b.platform = landed;
          b.y = landed.y - BARREL_RADIUS;
          b.vx = -b.vx;
        }
      }
    }

    barrels = barrels.filter(b => b.y - BARREL_RADIUS < H && b.x > -BARREL_RADIUS && b.x < W + BARREL_RADIUS);
  }

  function checkCollisions() {
    const body = marioBox();

    for (const h of hammers) {
      if (!h.taken && !ladder && overlaps(body, hammerBox(h))) {
        h.taken = true;
        hammerTime = HAMMER_SECONDS;
      }
    }

    // The hammer only protects the side Mario is facing.
    const smash = {
      x: facing > 0 ? mario.x : mario.x - HAMMER_REACH,
      y: body.y,
      w: HAMMER_REACH,
      h: body.h
    };
    barrels = barrels.filter(b => {
      const box = { x: b.x - BARREL_RADIUS, y: b.y - BARREL_RADIUS, w: BARREL_RADIUS * 2, h: BARREL_RADIUS * 2 };
      if (hammerTime > 0 && (b.x - mario.x) * facing >= 0 && overlaps(smash, box)) {
        return false;
      }
      if (overlaps(body, box)) {
        state = 'dead';
      }
      return true;
    });

    if (overlaps(body, GORILLA)) {
      state = 'won';
    }
  }

  reset();

  const loop = GameLoop({
    update(dt) {
      pollKeys();
      if (state !== 'playing') {
        if (justPressed.enter) reset();
        return;
      }
      updateMario(dt);
      updateBarrels(dt);
      checkCollisions();
    },
    render() {
      LADDERS.forEach(drawLadder);
      PLATFORMS.forEach(drawPlatform);
      drawGorilla();
      hammers.filter(h => !h.taken).forEach(drawHammerPickup);
      barrels.forEach(drawBarrel);
      mario.render();

      if (hammerTime > 0) {
        context.fillStyle = '#e0b030';
        context.font = 'bold 14px monospace';
        context.textAlign = 'right';
        context.fillText(`HAMMER ${Math.ceil(hammerTime)}`, W - 8, 20);
      }
      if (state === 'dead') drawMessage(['OUCH!', 'Press Enter to try again']);
      if (state === 'won') drawMessage(['YOU WIN!', 'Press Enter to play again']);
    }
  });

  loop.start();
});
