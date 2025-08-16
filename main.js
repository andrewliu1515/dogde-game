(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // HUD
  const statKilled = document.getElementById('statKilled');
  const statState  = document.getElementById('statState');
  const statInvul  = document.getElementById('statInvul');

  // Panels & inputs
  const startPanel = document.getElementById('startPanel');
  const pausePanel = document.getElementById('pausePanel');
  const endPanel   = document.getElementById('endPanel');
  const endTitle   = document.getElementById('endTitle');
  const endMsg     = document.getElementById('endMsg');

  const startBtn   = document.getElementById('startBtn');
  const reviveBtn  = document.getElementById('reviveBtn');
  const restartBtn = document.getElementById('restartBtn');
  const quitBtn    = document.getElementById('quitBtn');

  const continueBtn  = document.getElementById('continueBtn');
  const pauseQuitBtn = document.getElementById('pauseQuitBtn');

  const inpDifficulty = document.getElementById('inpDifficulty');
  const inpBgmVol     = document.getElementById('inpBgmVol');
  const inpColorPlayer= document.getElementById('inpColorPlayer');
  const inpColorEnemy = document.getElementById('inpColorEnemy');
  const inpBgStyle    = document.getElementById('inpBgStyle');

  // Mobile controls
  const mobileControls = document.getElementById('mobileControls');
  const btnLeft  = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  const btnJump  = document.getElementById('btnJump');

  // Pause button
  const btnPause = document.getElementById('btnPause');

  // Audio
  const bgm        = document.getElementById('bgm');
  const sfxLevelUp = document.getElementById('sfxLevelUp');

  // 常數
  const BASE = {
    PLAYER_RADIUS: 16,
    PLAYER_SPEED: 320,
    JUMP_VELOCITY: 520,
    DOUBLE_JUMP_VELOCITY: 520,
    TRIPLE_JUMP_VELOCITY: 520,
    JUMP_HOLD_BOOST: 1200,
    JUMP_HOLD_TIME: 0.18,
    GRAVITY: 1600,
    ENEMY_RADIUS: 12,
    ENEMY_SPEED_MIN: 140,
    ENEMY_SPEED_MAX: 260,
    TRAIL_LENGTH: 22,
    ENEMY_TRAIL_LENGTH: 28
  };

  const DIFF = {
    1: { maxCount: 7,  speedMul0: 1.00, speedCap: 1.20, startCount: 2 },
    2: { maxCount: 10, speedMul0: 1.05, speedCap: 1.35, startCount: 3 },
    3: { maxCount: 13, speedMul0: 1.08, speedCap: 1.50, startCount: 4 },
  };

  const BUFF = {
    DROP_START_K: 25,
    DROP_EVERY_K: 10,
    RADIUS: Math.round(BASE.ENEMY_RADIUS * 1.25),
    COLOR: 'rgba(200,200,200,0.6)',

    // SPIKE（尖刺）
    SPIKE_DURATION: 7.0,   // ← 調整為 7 秒

    // AIR（無限跳＋尖刺）
    AIR_DURATION: 4.5,     // ← 調整為 4.5 秒

    // NUKE（慢動作演出參數）
    SLOWMO_SCALE: 0.15,
    SLOWMO_MIN: 0.15,
    WAVE_DURATION: 0.7
  };

  // 狀態
  let W=0, H=0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let running=false, ended=false, paused=false;
  let lastTime=0, accSpawn=0;
  let killedCount=0, enemyTrailEnabled=false, bgIntensified=false, rainbowMode=false;
  let playerColor="#58d0ff", enemyColor="#ff3b3b", bgStyle='digital';
  let diff = DIFF[2];
  let flashTimer = 0;
  const rainbow = ['#ff3b3b','#ff7f24','#ffd400','#2ecc71','#2e86ff','#3b1fff','#8e44ad'];

  const keys = new Set();
  const vkeys = { left:false, right:false };

  // 時間/公告
  let timeScale = 1.0;
  let slowmoTimer = 0;
  let announceTimer = 0;
  let announceText = '';

  // 三段跳解鎖
  let tripleUnlocked = false;

  // Buff 狀態
  let spikeTimer = 0;           // 尖刺（含被 AIR 借用）
  let airInfJumpTimer = 0;      // AIR：無限跳視窗（同時附帶尖刺）

  // 復活無敵（3 秒）
  let reviveInvulTimer = 0;

  let enemySpeedMul = 1.0;

  // 震動
  let screenShake = 0;
  const SHAKE_TIME = 0.35;
  let shakeTimer = 0;

  const player = {
    x:0, y:0, r:BASE.PLAYER_RADIUS,
    vx:0, vy:0, onGround:true,
    jumpsLeft: 2,
    jumpHolding:false, holdTime:0,
    trail: []
  };

  const enemies = [];
  const fragments = [];
  const powerUps = [];
  const shockwaves = [];

  let lastDropMilestone = -1;

  const bgState = {
    flame: { tongues: [], sparks: [] },
    digital: { glyphs: [], t: 0 }
  };

  const clamp = (v,mi,ma)=>Math.max(mi, Math.min(ma, v));
  const randRange = (a,b)=> a + Math.random()*(b-a);

  function colorStops(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if(!m) return {c1:hex,c2:hex};
    let [r,g,b] = [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)];
    const L = (v,p)=>Math.min(255, Math.round(v+(255-v)*p));
    const c1 = `#${L(r,0.35).toString(16).padStart(2,'0')}${L(g,0.35).toString(16).padStart(2,'0')}${L(b,0.35).toString(16).padStart(2,'0')}`;
    return { c1, c2: hex };
  }

  function resize(){
    const box = canvas.parentElement.getBoundingClientRect();
    W = Math.floor(box.width);
    H = Math.floor(box.height);
    canvas.width  = Math.floor(W*dpr);
    canvas.height = Math.floor(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize', ()=>{ resize(); initBg(bgStyle); });

  function placePlayer(){
    player.x = W*0.5;
    player.y = H - player.r - 8;
    player.vx=0; player.vy=0;
    player.onGround=true;
    player.jumpsLeft = tripleUnlocked ? 3 : 2;
    player.jumpHolding=false; player.holdTime=0;
    player.trail.length = 0;
  }

  // 成長曲線
  function growthFactor(k){
    const norm = clamp(k/40, 0, 1);
    return Math.log(1 + 9*norm) / Math.log(10);
  }
  function desiredEnemyCount(k){
    const f = growthFactor(k);
    return Math.min(diff.maxCount, Math.round(diff.startCount + (diff.maxCount - diff.startCount)*f));
  }
  function currentSpeedMul(k){
    const f = growthFactor(k);
    const mul = diff.speedMul0 + (diff.speedCap - diff.speedMul0)*f;
    return clamp(mul, diff.speedMul0, diff.speedCap);
  }

  function spawnEnemy(){
    const r = BASE.ENEMY_RADIUS;
    const x = r + Math.random()*(W-2*r);
    const y = r + 2;

    const spMul = currentSpeedMul(killedCount);
    const vmin = BASE.ENEMY_SPEED_MIN * spMul;
    const vmax = BASE.ENEMY_SPEED_MAX * spMul;
    const speed = randRange(vmin, vmax);

    const angle = randRange(Math.PI*0.15, Math.PI*0.85);
    const vx = Math.cos(angle)*speed*(Math.random()<0.5?-1:1);
    const vy = Math.abs(Math.sin(angle)*speed);

    const col = rainbowMode ? rainbow[Math.floor(Math.random()*rainbow.length)] : enemyColor;

    enemies.push({ x,y,vx,vy,r, color: col, trail: [], stun:0, hitA:0 });
  }

  function spawnPowerUp(){
    const types = ['SPIKE','NUKE','AIR'];
    const type = types[Math.floor(Math.random() * types.length)];
    const r = BUFF.RADIUS;
    const x = r + Math.random()*(W-2*r);
    const y = r + 2;

    const spMul = currentSpeedMul(killedCount) * 0.8;
    const vmin = BASE.ENEMY_SPEED_MIN * spMul;
    const vmax = BASE.ENEMY_SPEED_MAX * spMul;
    const speed = randRange(vmin, vmax);

    const angle = randRange(Math.PI*0.15, Math.PI*0.85);
    const vx = Math.cos(angle)*speed*(Math.random()<0.5?-1:1);
    const vy = Math.abs(Math.sin(angle)*speed);

    powerUps.push({ type, x, y, vx, vy, r, alpha: 0.9, pulse: 0 });
  }

  // 背景
  function initBg(style){
    bgIntensified = false;
    if(style==='flame'){
      const t = bgState.flame;
      t.tongues = []; t.sparks = [];
      const count = 9;
      for(let i=0;i<count;i++){
        t.tongues.push({
          x: (i+0.5)/count * W,
          w: randRange(40, 90),
          h: randRange(H*0.20, H*0.34),
          phase: Math.random()*Math.PI*2,
          speed: randRange(1.0, 1.8)
        });
      }
      for(let i=0;i<70;i++){
        t.sparks.push({
          x: Math.random()*W, y: H - Math.random()*60,
          vy: -randRange(80, 160), vx: randRange(-20, 20),
          r: randRange(1.3, 3.0), a: randRange(0.45, 0.9)
        });
      }
    }else{
      const d = bgState.digital;
      d.glyphs = []; d.t = 0;
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789';
      for (let L = 0; L < 3; L++) {
        const n = 18 + L*10;
        for(let i=0;i<n;i++){
          const dir = Math.random()<0.5 ? 1 : -1;
          d.glyphs.push({
            text: chars[Math.floor(Math.random()*chars.length)],
            x: dir===1 ? -50 - Math.random()*W : W + 50 + Math.random()*W,
            y: Math.random()*H,
            v: dir * randRange(40+L*22, 90+L*40),
            a: randRange(0.18, 0.36),
            size: 14 + L*7,
            hue: randRange(185, 205)
          });
        }
      }
    }
  }
  function intensifyBg(){
    if(bgIntensified) return;
    bgIntensified = true;
    flashTimer = 0.6;
    try{ sfxLevelUp.currentTime = 0; sfxLevelUp.play().catch(()=>{}); }catch(e){}
    if(bgStyle==='flame'){
      const t = bgState.flame;
      for(let i=0;i<4;i++){
        t.tongues.push({
          x: Math.random()*W,
          w: randRange(50, 110),
          h: randRange(H*0.28, H*0.44),
          phase: Math.random()*Math.PI*2,
          speed: randRange(1.4, 2.2)
        });
      }
      for(let i=0;i<50;i++){
        t.sparks.push({
          x: Math.random()*W, y: H - Math.random()*60,
          vy: -randRange(120, 220), vx: randRange(-35, 35),
          r: randRange(1.2, 3.2), a: randRange(0.55, 0.95)
        });
      }
    }else{
      const d = bgState.digital;
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789';
      for(let i=0;i<40;i++){
        const dir = Math.random()<0.5 ? 1 : -1;
        d.glyphs.push({
          text: chars[Math.floor(Math.random()*chars.length)],
          x: dir===1 ? -50 - Math.random()*W : W + 50 + Math.random()*W,
          y: Math.random()*H,
          v: dir * randRange(110, 200),
          a: randRange(0.22, 0.42),
          size: randRange(16, 26),
          hue: randRange(185, 205)
        });
      }
      for(const g of d.glyphs) g.v *= 1.18;
    }
  }

  // 公告 / 慢動作
  function announce(msg, duration=1.0, slow=1.0){
    announceText = msg;
    announceTimer = duration;
    timeScale = slow;
    slowmoTimer = duration;
    try{ sfxLevelUp.currentTime=0; sfxLevelUp.play().catch(()=>{}); }catch(e){}
  }

  // 三段跳解鎖（公告＋降速）
  function checkTripleUnlock(){
    if(!tripleUnlocked && killedCount >= 30){
      tripleUnlocked = true;
      if(player.onGround) player.jumpsLeft = 3;
      announce('解鎖三連跳', 1.2, 0.6);
    }
  }

  function drawBackground(ts){
    const t = ts/1000;
    if(bgStyle==='flame'){
      const g = ctx.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, '#200b06'); g.addColorStop(0.35, '#2b0f08'); g.addColorStop(1, '#0b0d12');
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
      const F = bgState.flame;
      for(const s of F.tongues){
        const sway = Math.sin(t*s.speed + s.phase)*s.w*0.35;
        const top = H - s.h - 8;
        const grd = ctx.createLinearGradient(s.x, H, s.x, top);
        grd.addColorStop(0, 'rgba(255,120,40,0.0)');
        grd.addColorStop(0.3, 'rgba(255,120,40,0.55)');
        grd.addColorStop(0.7, 'rgba(255,80,20,0.75)');
        grd.addColorStop(1, 'rgba(255,180,120,0.0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(s.x - s.w/2 + sway, H-8);
        ctx.bezierCurveTo(s.x - s.w*0.6 + sway, H - s.h*0.4,
                          s.x + s.w*0.6 + sway, H - s.h*0.7,
                          s.x + s.w/2 + sway*0.6, top);
        ctx.lineTo(s.x - s.w/2 + sway*0.6, top);
        ctx.closePath();
        ctx.fill();
      }
      ctx.save();
      for(const p of F.sparks){
        ctx.globalAlpha = p.a;
        ctx.fillStyle = '#ffcf7a';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
        p.y += p.vy * (1/60); p.x += p.vx * (1/60); p.a *= 0.992;
        if(p.y < H*0.2 || p.a < 0.05){
          p.x = Math.random()*W; p.y = H - Math.random()*60;
          p.vy = -randRange(80, 220); p.vx = randRange(-25, 35);
          p.r  = randRange(1.2, 3.2); p.a  = randRange(0.5, 0.95);
        }
      }
      ctx.restore();
      ctx.fillStyle='rgba(255,150,60,.18)'; ctx.fillRect(0, H-8, W, 8);
    }else{
      const g = ctx.createLinearGradient(0,0,W,H);
      g.addColorStop(0, '#071018'); g.addColorStop(1, '#0b1420');
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle = 'rgba(140,220,255,0.06)';
      ctx.lineWidth = 1;
      const gap = 28;
      for(let x=0;x<W;x+=gap){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for(let y=0;y<H;y+=gap){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      const D = bgState.digital; D.t += 1/60;
      ctx.save();
      for(const gph of D.glyphs){
        ctx.globalAlpha = gph.a;
        ctx.fillStyle = `hsla(${gph.hue}, 100%, 70%, ${gph.a})`;
        ctx.font = `bold ${gph.size}px Consolas, Menlo, monospace`;
        const jitter = Math.sin(D.t*4 + gph.y*0.05)*0.8;
        ctx.fillText(gph.text, gph.x, gph.y + jitter);
        gph.x += gph.v * (1/60);
        if(gph.v > 0 && gph.x > W + 80){ gph.x = -80 - Math.random()*W; gph.y = Math.random()*H; gph.a = randRange(0.18,0.42); }
        else if(gph.v < 0 && gph.x < -80){ gph.x = W + 80 + Math.random()*W; gph.y = Math.random()*H; gph.a = randRange(0.18,0.42); }
        if(Math.random()<0.02) gph.text = randomGlyph();
      }
      ctx.restore();
    }

    drawBigKillCount();

    if (flashTimer > 0){
      const a = Math.min(0.65, flashTimer);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fillRect(0,0,W,H);
    }

    if(announceTimer > 0 && announceText){
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font = `800 ${Math.floor(H*0.08)}px system-ui,-apple-system,Segoe UI,Roboto,Arial`;
      ctx.fillStyle='rgba(255,255,255,0.95)';
      ctx.shadowColor='rgba(0,0,0,0.7)'; ctx.shadowBlur=18;
      ctx.fillText(announceText, W/2, H*0.18);
      ctx.restore();
    }
  }

  function drawBigKillCount(){
    const text = String(killedCount);
    let size = Math.floor(H * 0.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    for(let i=0;i<20;i++){
      ctx.font = `900 ${size}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      const w = ctx.measureText(text).width;
      if (w <= W * 0.90) break;
      size = Math.floor(size * 0.9);
      if(size < 12) break;
    }
    ctx.save(); ctx.globalAlpha = 0.22; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 24; ctx.fillText(text, W/2, H/2); ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.12; ctx.lineWidth = Math.max(2, size*0.02); ctx.strokeText(text, W/2, H/2); ctx.restore();
  }

  function randomGlyph(){
    const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789';
    return pool[Math.floor(Math.random()*pool.length)];
  }

  function drawBall(x,y,r,c1,c2){
    const g = ctx.createRadialGradient(x - r*0.4, y - r*0.6, r*0.2, x, y, r);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }

  // 更新
  function update(dt){
    if (paused) return;

    if(slowmoTimer > 0){
      slowmoTimer -= dt;
      if(slowmoTimer <= 0) { slowmoTimer = 0; timeScale = 1.0; }
    }
    if(announceTimer > 0){
      announceTimer -= dt;
      if(announceTimer <= 0){ announceTimer = 0; announceText=''; }
    }

    if (reviveInvulTimer > 0) reviveInvulTimer = Math.max(0, reviveInvulTimer - dt);

    if (shakeTimer > 0) { shakeTimer -= dt; screenShake = Math.max(0, shakeTimer / SHAKE_TIME); }
    else screenShake = 0;

    // 計時：尖刺／無限跳
    if (spikeTimer > 0)       spikeTimer = Math.max(0, spikeTimer - dt);
    if (airInfJumpTimer > 0)  airInfJumpTimer = Math.max(0, airInfJumpTimer - dt);

    const edt = dt * clamp(timeScale, BUFF.SLOWMO_MIN, 1.0);

    // 輸入
    const left  = keys.has('ArrowLeft') || keys.has('KeyA') || vkeys.left;
    const right = keys.has('ArrowRight')|| keys.has('KeyD') || vkeys.right;
    const baseSpeed = BASE.PLAYER_SPEED;
    if(left && !right) player.vx = -baseSpeed;
    else if(right && !left) player.vx = baseSpeed;
    else player.vx = 0;

    if(player.jumpHolding && player.holdTime < BASE.JUMP_HOLD_TIME){
      player.vy -= BASE.JUMP_HOLD_BOOST*edt;
      player.holdTime += edt;
    }

    // 物理
    player.vy += BASE.GRAVITY*edt;
    player.x += player.vx*edt;
    player.y += player.vy*edt;

    // 邊界
    if(player.x<player.r) player.x=player.r;
    if(player.x>W-player.r) player.x=W-player.r;

    const ground = H - player.r - 8;

    if(player.y>=ground){
      player.y=ground; player.vy=0; 
      player.onGround=true; 
      player.jumpsLeft = tripleUnlocked ? 3 : 2;
      player.jumpHolding=false; player.holdTime=0;
    } else {
      if (player.y < player.r+8){
        player.y=player.r+8; if(player.vy<0) player.vy=0;
      }
      if (player.onGround) player.onGround=false;
    }

    // 敵球移動
    for(const b of enemies){
      const stunMul = (b.stun && b.stun > 0) ? 0.25 : 1.0;
      if (b.stun && b.stun > 0) b.stun -= dt;

      b.x += b.vx*edt*enemySpeedMul*stunMul;
      b.y += b.vy*edt*enemySpeedMul*stunMul;

      if(b.x - b.r < 0){ b.x=b.r; b.vx=-b.vx; }
      if(b.x + b.r > W){ b.x=W-b.r; b.vx=-b.vx; }
      if(b.y - b.r < 0){ b.y=b.r; b.vy=-b.vy; }
      if(b.y + b.r > H){ b.y=H-b.r; b.vy=-b.vy; }

      if(enemyTrailEnabled){
        b.trail.push({ x: b.x, y: b.y, alpha: 1 });
        if(b.trail.length > BASE.ENEMY_TRAIL_LENGTH) b.trail.shift();
        for(let i=0;i<b.trail.length;i++) b.trail[i].alpha *= 0.96;
      }

      if (b.hitA && b.hitA > 0) b.hitA *= 0.90;
    }

    // Buff 球移動
    for(const p of powerUps){
      p.x += p.vx*edt*enemySpeedMul;
      p.y += p.vy*edt*enemySpeedMul;
      if(p.x - p.r < 0){ p.x=p.r; p.vx=-p.vx; }
      if(p.x + p.r > W){ p.x=W-p.r; p.vx=-p.vx; }
      if(p.y - p.r < 0){ p.y=p.r; p.vy=-p.vy; }
      if(p.y + p.r > H){ p.y=H-p.r; p.vy=-p.vy; }
      p.pulse = (p.pulse + dt) % 1.0;
    }

    // 跳過敵球 → 消滅
    for(let i=enemies.length-1;i>=0;i--){
      const b = enemies[i];
      const dx = b.x - player.x;
      const playerBottom = player.y + player.r;
      const enemyTop = b.y - b.r;
      if (Math.abs(dx) <= (b.r + player.r) && playerBottom <= enemyTop) {
        enemies.splice(i,1);
        killedCount++;
        postKillMilestones();
      }
    }

    // 碰撞處理
    outerCollision:
    for(let i=enemies.length-1;i>=0;i--){
      const b = enemies[i];
      const dx = b.x - player.x, dy = b.y - player.y;
      const rr = (b.r + player.r)*(b.r + player.r);
      if(dx*dx + dy*dy <= rr){
        // 尖刺生效（包含 AIR 同步提供的尖刺）
        if (spikeTimer > 0){
          enemies.splice(i,1);
          killedCount++;
          postKillMilestones();
          continue outerCollision;
        } else if (reviveInvulTimer > 0) {
          const d = Math.max(1, Math.hypot(dx, dy));
          b.x += (dx/d) * 8;
          b.y += (dy/d) * 8;
          continue outerCollision;
        } else {
          triggerFragments();
          endGame(false);
          break outerCollision;
        }
      }
    }

    // 撿到 Buff
    for(let i=powerUps.length-1;i>=0;i--){
      const p = powerUps[i];
      const dx = p.x - player.x, dy = p.y - player.y;
      const rr = (p.r + player.r)*(p.r + player.r);
      if(dx*dx + dy*dy <= rr){
        applyPowerUp(p.type);
        powerUps.splice(i,1);
      }
    }

    // 生成控制
    const want = desiredEnemyCount(killedCount);
    accSpawn += dt*1000;
    while(enemies.length < want && accSpawn >= 120){
      accSpawn -= 120;
      spawnEnemy();
    }
    if(enemies.length > diff.maxCount) enemies.length = diff.maxCount;

    // 玩家軌跡
    player.trail.push({ x: player.x, y: player.y, alpha: 1 });
    if(player.trail.length > BASE.TRAIL_LENGTH) player.trail.shift();
    for(let i=0;i<player.trail.length;i++) player.trail[i].alpha *= 0.96;

    // 碎片
    for(let i=fragments.length-1;i>=0;i--){
      const f = fragments[i];
      f.vy += 1200*edt;
      f.x += f.vx*edt; f.y += f.vy*edt;
      f.rot += f.vr*edt;
      f.a *= 0.985;
      if(f.y>H+20 || f.a<0.02) fragments.splice(i,1);
    }

    // 氣波
    for(let i=shockwaves.length-1;i>=0;i--){
      const w = shockwaves[i];
      w.t += dt;
      if(w.t >= (w.dur || BUFF.WAVE_DURATION)) shockwaves.splice(i,1);
    }

    if(flashTimer>0) flashTimer = Math.max(0, flashTimer - dt*1.5);

    // HUD
    const buffs = [];
    if (airInfJumpTimer>0) buffs.push(`無限跳+尖刺${airInfJumpTimer.toFixed(1)}s`);
    else if (spikeTimer>0) buffs.push(`尖刺${spikeTimer.toFixed(1)}s`);
    if (reviveInvulTimer>0) buffs.push(`復活無敵${reviveInvulTimer.toFixed(1)}s`);
    statKilled.textContent = `消滅：${killedCount}`;
    statState.textContent  = paused ? '狀態：暫停' : (ended ? '狀態：結束' : '狀態：進行中');
    statInvul.textContent  = buffs.length ? `增益：${buffs.join(' / ')}` : '增益：—';
  }

  function postKillMilestones(){
    if(killedCount >= BUFF.DROP_START_K){
      const milestone = Math.floor((killedCount - BUFF.DROP_START_K)/BUFF.DROP_EVERY_K);
      if(milestone > lastDropMilestone){
        lastDropMilestone = milestone;
        spawnPowerUp();
      }
    }
    if(killedCount===15) enemyTrailEnabled = true;
    if(killedCount===25) intensifyBg();
    if(!rainbowMode && killedCount>=35){
      rainbowMode = true;
      for(const e of enemies){ e.color = rainbow[Math.floor(Math.random()*rainbow.length)]; }
    }
    checkTripleUnlock();
  }

  // 繪圖
  function draw(ts){
    ctx.save();
    if (screenShake > 0) {
      const m = screenShake * 8;
      const ox = (Math.random()*2-1) * m;
      const oy = (Math.random()*2-1) * m;
      ctx.translate(ox, oy);
    }

    drawBackground(ts);

    // 敵球尾跡
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for(const b of enemies){
      if(!b.trail || b.trail.length===0) continue;
      const es = colorStops(b.color);
      for(let i=0;i<b.trail.length;i++){
        const t = b.trail[i];
        const r = 6 + 0.85 * i;
        ctx.globalAlpha = 0.10 + 0.30 * (i / b.trail.length) * t.alpha;
        drawBall(t.x, t.y, r, es.c1, es.c2);
      }
    }
    ctx.restore();

    // 敵球
    for(const b of enemies){
      const es = colorStops(b.color);
      drawBall(b.x, b.y, b.r, es.c1, es.c2);
      if (b.hitA && b.hitA > 0.02) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.5, b.hitA);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r*0.9, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }

    // Buff 球（呼吸光暈）
    for(const p of powerUps){
      ctx.save();
      const pulse = 0.6 + 0.4*Math.sin(p.pulse*Math.PI*2);
      ctx.fillStyle = `rgba(200,200,200,${0.45+0.35*pulse})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4*pulse, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = BUFF.COLOR;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      if(p.type==='SPIKE'){
        ctx.beginPath(); ctx.arc(0, 0, p.r+4, 0, Math.PI*2); ctx.stroke();
        for(let i=0;i<6;i++){
          const ang = (Math.PI/3)*i;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang)*(p.r*0.4), Math.sin(ang)*(p.r*0.4));
          ctx.lineTo(Math.cos(ang)*(p.r*0.9), Math.sin(ang)*(p.r*0.9));
          ctx.stroke();
        }
      }else if(p.type==='NUKE'){
        ctx.beginPath(); ctx.arc(0, 2, p.r*0.5, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.r*0.2, -p.r*0.2); ctx.lineTo(p.r*0.8, -p.r*0.8); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.r*0.9, -p.r*0.9, 2, 0, Math.PI*2); ctx.fill();
      }else{ // AIR
        ctx.beginPath();
        ctx.moveTo(-p.r*0.7, 0);
        ctx.quadraticCurveTo(-p.r*0.2, -p.r*0.6, 0, 0);
        ctx.quadraticCurveTo(p.r*0.2, -p.r*0.6, p.r*0.7, 0);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 玩家軌跡與本體
    const ps = colorStops(playerColor);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for(let i=0;i<player.trail.length;i++){
      const t = player.trail[i];
      const r = player.r * (0.6 + 0.4 * (i / player.trail.length));
      ctx.globalAlpha = 0.12 + 0.38 * (i / player.trail.length) * t.alpha;
      drawBall(t.x, t.y, r, ps.c1, ps.c2);
    }
    ctx.restore();
    drawBall(player.x, player.y, player.r, ps.c1, ps.c2);

    // 尖刺視覺（包含 AIR 期間）
    if (spikeTimer>0){
      const t = performance.now()/200;
      const spokes = 8;
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(t);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      for(let i=0;i<spokes;i++){
        const a = (Math.PI*2/spokes)*i;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a)*(player.r+4), Math.sin(a)*(player.r+4));
        ctx.lineTo(Math.cos(a)*(player.r+14), Math.sin(a)*(player.r+14));
        ctx.stroke();
      }
      ctx.restore();
    }

    // 復活無敵圈
    if (reviveInvulTimer>0){
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = 'rgba(180,220,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(player.x, player.y, player.r+10, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    // 氣波
    for(const w of shockwaves){
      const life = w.dur || BUFF.WAVE_DURATION;
      const prog = clamp(w.t / life, 0, 1);
      const r = w.r0 + prog * w.r1;
      ctx.save();
      ctx.globalAlpha = (1 - prog) * 0.95;
      ctx.lineWidth = 4;
      const cs = colorStops(playerColor);
      ctx.strokeStyle = cs.c2;
      ctx.beginPath(); ctx.arc(w.x, w.y, r, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // Buff 應用
  function applyPowerUp(type){
    if(type==='SPIKE'){
      spikeTimer = Math.max(spikeTimer, BUFF.SPIKE_DURATION);
      announce('尖刺 7 秒', 0.5, 0.95);

    }else if(type==='NUKE'){
      // 慢動作與演出
      timeScale   = BUFF.SLOWMO_SCALE;
      slowmoTimer = Math.max(slowmoTimer, 0.8);
      flashTimer  = Math.max(flashTimer, 0.45);
      shakeTimer  = SHAKE_TIME; 
      screenShake = 1;

      // 按距離玩家排序，最多清除 7 顆
      const MAX_CLEAR = 7;
      if (enemies.length > 0) {
        // 演出衝擊波
        shockwaves.push({ x: player.x, y: player.y, r0: player.r,    r1: Math.max(W,H),     t: 0, dur: BUFF.WAVE_DURATION });
        shockwaves.push({ x: player.x, y: player.y, r0: player.r*0.8, r1: Math.max(W,H)*0.9, t: 0, dur: BUFF.WAVE_DURATION*0.9 });

        // 取最近的 N 顆，再安全地由大到小索引移除
        const byDist = enemies
          .map((e, idx) => ({ idx, d2: (e.x - player.x) ** 2 + (e.y - player.y) ** 2 }))
          .sort((a, b) => a.d2 - b.d2)
          .slice(0, MAX_CLEAR)
          .map(o => o.idx)
          .sort((a, b) => b - a);

        let cleared = 0;
        for (const idx of byDist) {
          enemies.splice(idx, 1);
          cleared++;
        }
        if (cleared > 0) {
          killedCount += cleared;
          postKillMilestones();
        }
      }

    }else if(type==='AIR'){
      // 無限跳＋尖刺 4.5 秒
      airInfJumpTimer = Math.max(airInfJumpTimer, BUFF.AIR_DURATION);
      spikeTimer      = Math.max(spikeTimer,      BUFF.AIR_DURATION);
      announce('AIR：無限跳＋尖刺 4.5 秒', 0.6, 0.95);
    }
  }

  function triggerFragments(){
    const n = 48;
    for(let i=0;i<n;i++){
      const ang = Math.random()*Math.PI*2;
      const spd = randRange(150, 420);
      fragments.push({
        x: player.x, y: player.y,
        vx: Math.cos(ang)*spd,
        vy: Math.sin(ang)*spd*0.3 - 100,
        vr: randRange(-6, 6),
        s: randRange(3, 6),
        a: randRange(0.7, 1.0),
        color: i%2 ? colorStops(playerColor).c1 : playerColor,
        rot: Math.random()*Math.PI*2
      });
    }
  }

  // 迴圈
  function frame(ts){
    if(!running) return;
    if(!lastTime) lastTime = ts;
    let dt = (ts - lastTime)/1000;
    dt = Math.min(dt, 1/60);
    lastTime = ts;

    update(dt);
    draw(ts);
    requestAnimationFrame(frame);
  }

  // 狀態切換
  function startGame(){
    const d = parseInt(inpDifficulty.value,10);
    diff = DIFF[d] || DIFF[2];
    playerColor = inpColorPlayer.value || "#58d0ff";
    enemyColor  = inpColorEnemy.value  || "#ff3b3b";
    bgStyle     = inpBgStyle.value || 'digital';

    enemies.length=0; fragments.length=0; powerUps.length=0; shockwaves.length=0;
    killedCount=0; enemyTrailEnabled=false; bgIntensified=false; rainbowMode=false;
    lastDropMilestone = -1;
    accSpawn=0; lastTime=0; flashTimer=0;
    timeScale=1.0; slowmoTimer=0; announceTimer=0; announceText='';
    tripleUnlocked = false;

    // Buff 清空
    spikeTimer=0; airInfJumpTimer=0;
    reviveInvulTimer=0;
    shakeTimer=0; screenShake=0;

    resize(); placePlayer(); initBg(bgStyle);

    try {
      bgm.volume = clamp((parseInt(inpBgmVol.value,10)||50)/100, 0, 1);
      bgm.currentTime = 0;
      bgm.play().catch(()=>{});
    } catch(e){}

    ended=false; running=true; paused=false;
    hidePanel(startPanel); hidePanel(endPanel); hidePanel(pausePanel);
    updateMobileControlsVisibility();
    statState.textContent='狀態：進行中';

    requestAnimationFrame(frame);
  }

  function revive(){
    if(!ended) return;
    ended=false; running=true; paused=false;

    placePlayer();
    reviveInvulTimer = 3.0; // 純無敵 3 秒
    hidePanel(endPanel);
    updateMobileControlsVisibility();
    statState.textContent='狀態：進行中';

    try{ if (bgm.paused) bgm.play().catch(()=>{}); }catch(e){}
    requestAnimationFrame(frame);
  }

  function endGame(){
    if(ended) return;
    ended=true; running=false;
    statState.textContent = '狀態：結束';
    endTitle.textContent  = '結束';
    endMsg.textContent    = `本回合消滅 ${killedCount} 顆。`;
    showPanel(endPanel);
    updateMobileControlsVisibility();
    try{ bgm.pause(); }catch(e){}
  }

  function togglePause(){
    if(!running || ended) return;
    paused = !paused;
    statState.textContent = paused ? '狀態：暫停' : '狀態：進行中';
    if (paused){
      showPanel(pausePanel);
      try{ bgm.pause(); }catch(e){}
    }else{
      hidePanel(pausePanel);
      try{ bgm.play().catch(()=>{}); }catch(e){}
    }
    updateMobileControlsVisibility();
  }

  function showPanel(p){ p.style.display='flex'; p.setAttribute('aria-hidden','false'); }
  function hidePanel(p){ p.setAttribute('aria-hidden','true'); p.style.display='none'; }

  function updateMobileControlsVisibility(){
    const visible = running && !ended && !paused && startPanel.getAttribute('aria-hidden')==='true';
    mobileControls.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  // 音量即時調整
  inpBgmVol?.addEventListener('input', ()=>{
    const v = clamp((parseInt(inpBgmVol.value,10)||50)/100, 0, 1);
    try{ bgm.volume = v; }catch(e){}
  });

  // 分頁切換
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const id = 'tab-' + btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
      document.getElementById(id).classList.add('active');
    });
  });

  // 暫停鍵與暫停面板按鈕
  btnPause.addEventListener('click', togglePause);
  continueBtn.addEventListener('click', togglePause);
  pauseQuitBtn.addEventListener('click', () => showStart());

  // 鍵盤
  window.addEventListener('keydown',(e)=>{
    const code = e.code;
    if(code==='Space'){
      if(!running || paused){ e.preventDefault(); return; }
      // 無限跳期間：不消耗 jumpsLeft；否則照常
      const canJump = airInfJumpTimer>0 ? true : (player.jumpsLeft > 0);
      if(canJump){
        const v0 = (airInfJumpTimer>0) ? BASE.TRIPLE_JUMP_VELOCITY
                 : (player.jumpsLeft>=3) ? BASE.TRIPLE_JUMP_VELOCITY
                 : (player.jumpsLeft===2) ? BASE.JUMP_VELOCITY
                 : BASE.DOUBLE_JUMP_VELOCITY;
        player.vy = -v0;
        player.onGround = false;
        player.jumpHolding = true; player.holdTime = 0;
        if(airInfJumpTimer<=0) player.jumpsLeft--;
        e.preventDefault();
      }
    }
    if(code==='KeyP') togglePause();
    if(code==='Enter' && !running) startGame();
    if(code==='KeyR' && ended) startGame();

    keys.add(code);
  }, {passive:false});
  window.addEventListener('keyup',(e)=>{
    if(e.code==='Space'){ player.jumpHolding=false; }
    keys.delete(e.code);
  }, {passive:true});

  // 觸控／滑鼠：左右持續、跳
  function bindHold(btn, key){
    if(!btn) return;
    const start = (ev)=>{ ev.preventDefault(); vkeys[key]=true; };
    const end   = (ev)=>{ ev.preventDefault(); vkeys[key]=false; };
    btn.addEventListener('touchstart', start, {passive:false});
    btn.addEventListener('touchend',   end,   {passive:false});
    btn.addEventListener('touchcancel',end,   {passive:false});
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup',   end);
    btn.addEventListener('mouseleave',end);
  }
  bindHold(btnLeft, 'left');
  bindHold(btnRight,'right');

  function jumpPress(ev){
    ev.preventDefault();
    if(!running || paused) return;
    const canJump = airInfJumpTimer>0 ? true : (player.jumpsLeft > 0);
    if(canJump){
      const v0 = (airInfJumpTimer>0) ? BASE.TRIPLE_JUMP_VELOCITY
               : (player.jumpsLeft>=3) ? BASE.TRIPLE_JUMP_VELOCITY
               : (player.jumpsLeft===2) ? BASE.JUMP_VELOCITY
               : BASE.DOUBLE_JUMP_VELOCITY;
      player.vy = -v0;
      player.onGround=false; player.jumpHolding=true; player.holdTime=0;
      if(airInfJumpTimer<=0) player.jumpsLeft--;
    }
  }
  function jumpRelease(ev){ ev.preventDefault(); player.jumpHolding=false; }
  btnJump?.addEventListener('touchstart', jumpPress,   {passive:false});
  btnJump?.addEventListener('touchend',   jumpRelease, {passive:false});
  btnJump?.addEventListener('touchcancel',jumpRelease, {passive:false});
  btnJump?.addEventListener('mousedown',  jumpPress);
  btnJump?.addEventListener('mouseup',    jumpRelease);
  btnJump?.addEventListener('mouseleave', jumpRelease);

  // Buttons
  startBtn?.addEventListener('click', startGame);
  reviveBtn?.addEventListener('click', revive);
  restartBtn?.addEventListener('click', startGame);
  quitBtn?.addEventListener('click', () => showStart());

  // 顯示大廳
  function showStart(){
    running=false; ended=false; paused=false;
    showPanel(startPanel); hidePanel(endPanel); hidePanel(pausePanel);
    statState.textContent='狀態：待機';
    resize(); enemies.length=0; fragments.length=0; powerUps.length=0; shockwaves.length=0;
    placePlayer(); initBg(inpBgStyle.value || 'digital'); draw(performance.now());
    updateMobileControlsVisibility();
    try{ bgm.pause(); }catch(e){}
  }

  // 迴圈啟動
  function boot(){
    resize();
    showStart();
    requestAnimationFrame(frame);
  }

  boot();
})();
