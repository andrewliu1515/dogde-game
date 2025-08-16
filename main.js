// === 行動裝置視窗高度鎖定（避免 100vh 問題） ===
(function lockViewportHeightSetup(){
  function lockViewportHeight(){
    const vh = (window.visualViewport && window.visualViewport.height)
      ? Math.floor(window.visualViewport.height)
      : Math.floor(window.innerHeight);
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
  lockViewportHeight();
  window.addEventListener('resize', lockViewportHeight, {passive:true});
  window.addEventListener('orientationchange', lockViewportHeight, {passive:true});
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', lockViewportHeight, {passive:true});
    window.visualViewport.addEventListener('scroll', lockViewportHeight, {passive:true});
  }
})();

(() => {
  // 取得元素（全部必定存在）
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const stateEl = document.getElementById('state');
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  const btnJump = document.getElementById('btnJump');

  // 畫布尺寸
  let W=0, H=0, dpr = Math.min(window.devicePixelRatio||1, 2);
  function resize(){
    const box = canvas.parentElement.getBoundingClientRect();
    W = Math.floor(box.width);
    H = Math.floor(box.height);
    canvas.width  = Math.floor(W*dpr);
    canvas.height = Math.floor(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize', resize);
  resize();

  // 煙霧測試版：一顆玩家球 + 簡易跳躍 + 兩顆敵球彈跳
  const player = { x: W*0.5, y: H-40, r: 16, vx: 0, vy: 0, onGround: true, jumps: 2 };
  const keys = new Set();
  const vkeys = { left:false, right:false };
  let killed = 0;

  const enemies = [];
  function spawnEnemy(){
    const r = 12;
    const e = {
      x: r + Math.random()*(W-2*r),
      y: r + Math.random()*H*0.4,
      r,
      vx: (Math.random()<0.5?-1:1)*(160+Math.random()*60),
      vy: 120+Math.random()*80
    };
    enemies.push(e);
  }
  // 先放兩顆
  spawnEnemy(); spawnEnemy();

  // 控制鍵（鍵盤）
  window.addEventListener('keydown', (e)=>{
    const c = e.code;
    if(c==='ArrowLeft'||c==='KeyA')  keys.add('L');
    if(c==='ArrowRight'||c==='KeyD') keys.add('R');
    if(c==='Space'){
      e.preventDefault();
      if(player.onGround || player.jumps>0){
        player.vy = -520;
        player.onGround = false;
        if(!player.onGround) player.jumps--;
      }
    }
  }, {passive:false});
  window.addEventListener('keyup', (e)=>{
    const c = e.code;
    if(c==='ArrowLeft'||c==='KeyA')  keys.delete('L');
    if(c==='ArrowRight'||c==='KeyD') keys.delete('R');
  }, {passive:true});

  // 控制鍵（觸控）
  function bindHold(btn, key){
    const start = ev => { ev.preventDefault(); vkeys[key]=true; };
    const end   = ev => { ev.preventDefault(); vkeys[key]=false; };
    btn.addEventListener('touchstart', start, {passive:false});
    btn.addEventListener('touchend',   end,   {passive:false});
    btn.addEventListener('touchcancel',end,   {passive:false});
    btn.addEventListener('mousedown',  start);
    btn.addEventListener('mouseup',    end);
    btn.addEventListener('mouseleave', end);
  }
  bindHold(btnLeft, 'L'); bindHold(btnRight, 'R');
  btnJump.addEventListener('touchstart', (e)=>{ e.preventDefault(); jump(); }, {passive:false});
  btnJump.addEventListener('mousedown', (e)=>{ e.preventDefault(); jump(); });
  function jump(){
    if(player.onGround || player.jumps>0){
      player.vy = -520;
      player.onGround = false;
      if(!player.onGround) player.jumps--;
    }
  }

  // 更新
  function update(dt){
    // 水平輸入
    const left  = keys.has('L') || vkeys.L;
    const right = keys.has('R') || vkeys.R;
    if(left && !right) player.vx = -320;
    else if(right && !left) player.vx = 320;
    else player.vx = 0;

    // 玩家物理
    player.vy += 1600*dt;
    player.x  += player.vx*dt;
    player.y  += player.vy*dt;

    // 邊界與地面
    if(player.x < player.r) player.x = player.r;
    if(player.x > W - player.r) player.x = W - player.r;

    const ground = H - player.r - 8;
    if(player.y >= ground){
      player.y = ground;
      player.vy = 0;
      if(!player.onGround){ player.onGround = true; player.jumps = 2; }
    } else {
      if(player.y < player.r + 8){
        player.y = player.r + 8;
        if(player.vy < 0) player.vy = 0;
      }
      if(player.onGround) player.onGround = false;
    }

    // 敵球
    for(const e of enemies){
      e.x += e.vx*dt;
      e.y += e.vy*dt;
      if(e.x - e.r < 0){ e.x=e.r; e.vx = -e.vx; }
      if(e.x + e.r > W){ e.x=W-e.r; e.vx = -e.vx; }
      if(e.y - e.r < 0){ e.y=e.r; e.vy = -e.vy; }
      if(e.y + e.r > H){ e.y=H-e.r; e.vy = -e.vy; }
    }

    // 從上掠過 → 消滅
    for(let i=enemies.length-1;i>=0;i--){
      const e = enemies[i];
      const dx = e.x - player.x;
      const playerBottom = player.y + player.r;
      const enemyTop = e.y - e.r;
      if(Math.abs(dx) <= (e.r + player.r) && playerBottom <= enemyTop){
        enemies.splice(i,1);
        killed++;
        if(enemies.length<2) spawnEnemy();
      }
    }

    // 碰撞死亡（此煙霧版只重置分數）
    for(const e of enemies){
      const dx=e.x-player.x, dy=e.y-player.y, rr=(e.r+player.r)**2;
      if(dx*dx+dy*dy <= rr){
        killed = 0; // 重置
      }
    }

    scoreEl.textContent = killed.toString();
  }

  // 繪圖
  function draw(){
    // 背景
    const g = ctx.createLinearGradient(0,0,W,H);
    g.addColorStop(0,'#071018'); g.addColorStop(1,'#0b1420');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

    // 玩家
    drawBall(player.x, player.y, player.r, '#a3d9ff', '#58d0ff');

    // 敵球
    for(const e of enemies) drawBall(e.x,e.y,e.r,'#ff9b9b','#ff3b3b');
  }

  function drawBall(x,y,r,c1,c2){
    const grd = ctx.createRadialGradient(x-r*0.4, y-r*0.6, r*0.2, x, y, r);
    grd.addColorStop(0, c1); grd.addColorStop(1, c2);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }

  // 主迴圈
  let last=0;
  function loop(ts){
    const dt = Math.min((ts - last)/1000, 1/60); last = ts;
    update(dt); draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // TODO：確認此煙霧測試版在手機/桌機均無捲動、可左右/跳後
  // 再把你完整遊戲版 main.js 的邏輯，取代「update/draw/碰撞/敵球生成」區塊即可。
})();
