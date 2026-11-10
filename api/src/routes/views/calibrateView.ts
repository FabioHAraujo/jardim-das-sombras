export function renderCalibrateHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Afinador de Coordenadas Isométricas — Jardim das Sombras</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🥀</text></svg>">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0e0a14;
      color: #dfd7cc;
      font-family: monospace, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.5rem;
    }
    h1 { color: #e8d8be; font-size: 1.5rem; margin-bottom: 0.5rem; }
    .instructions { color: #9f8fb3; font-size: 0.85rem; margin-bottom: 1rem; max-width: 1024px; text-align: center; }
    
    .slot-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      background: #181222;
      padding: 0.75rem 1.25rem;
      border-radius: 8px;
      border: 1px solid #4a2e6e;
    }
    .slot-bar label {
      font-weight: bold;
      color: #ffd978;
      font-size: 14px;
    }
    .slot-btn {
      background: #2a1b3d;
      color: #dfd7cc;
      border: 1px solid #6b419c;
      width: 40px;
      height: 40px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 15px;
      font-weight: bold;
      transition: all 0.2s;
    }
    .slot-btn:hover {
      background: #542b82;
      color: #fff;
      transform: translateY(-2px);
    }
    .slot-btn.active {
      background: #ffd978;
      color: #0e0a14;
      border-color: #fff;
      box-shadow: 0 0 12px #ffd978;
    }

    .hud-bar {
      background: #130c1e;
      border: 1px solid #6b419c;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      color: #55f3a0;
      font-size: 13px;
      margin-bottom: 1rem;
      width: 1024px;
      text-align: center;
    }

    .workspace {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      justify-content: center;
      max-width: 1500px;
      width: 100%;
    }
    .canvas-container {
      position: relative;
      width: 1024px;
      height: 1024px;
      background-image: url('/farm/bg/farm_bg_day.png');
      background-size: cover;
      border: 3px solid #6b419c;
      border-radius: 8px;
      box-shadow: 0 0 35px rgba(107, 65, 156, 0.4);
      user-select: none;
      overflow: hidden;
    }
    .slot-pin {
      position: absolute;
      transform: translate(-50%, -100%);
      cursor: grab;
      display: flex;
      flex-direction: column;
      align-items: center;
      user-select: none;
      transition: filter 0.2s;
    }
    .slot-pin:active { cursor: grabbing; filter: drop-shadow(0 0 12px #ffea78); }
    .slot-pin.active { filter: drop-shadow(0 0 15px #ffd978); }
    .slot-img {
      max-width: 160px;
      max-height: 160px;
      image-rendering: pixelated;
      pointer-events: none;
    }
    .slot-badge {
      background: rgba(18, 12, 28, 0.95);
      color: #ffd978;
      border: 1px solid #ffba00;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 4px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.8);
      pointer-events: none;
      white-space: nowrap;
    }
    .slot-base-marker {
      width: 14px;
      height: 14px;
      background: #ff3366;
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 8px #ff3366;
      pointer-events: none;
      margin-top: -7px;
    }
    .sidebar {
      background: #191224;
      border: 1px solid #482f63;
      border-radius: 8px;
      padding: 1.25rem;
      width: 400px;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .slot-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem;
      background: #110c1a;
      border-radius: 6px;
      border: 1px solid #2d1c42;
      transition: all 0.2s;
    }
    .slot-row.active {
      border-color: #ffd978;
      background: #25163a;
      box-shadow: 0 0 8px rgba(255, 217, 120, 0.3);
    }
    .actions-bar {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .btn {
      background: #542b82;
      color: #fff;
      border: none;
      padding: 0.6rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      font-size: 13px;
      transition: background 0.2s;
    }
    .btn:hover { background: #7138b0; }
    .btn-secondary {
      background: #291a38;
      border: 1px solid #5a3682;
    }
    .btn-secondary:hover { background: #3b2552; }
    pre {
      background: #09060d;
      padding: 0.75rem;
      border-radius: 6px;
      font-size: 12px;
      color: #55f3a0;
      overflow-x: auto;
      max-height: 250px;
    }
    .mode-nav {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .mode-btn {
      background: #181222;
      color: #9f8fb3;
      border: 1px solid #4a2e6e;
      padding: 0.6rem 1.25rem;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }
    .mode-btn.active {
      background: #542b82;
      color: #ffd978;
      border-color: #ffd978;
      box-shadow: 0 0 10px rgba(255, 217, 120, 0.4);
    }
  </style>
</head>
<body>
  <h1>🦇 Afinador Isométrico — Jardim das Sombras</h1>
  <div class="instructions">
    Alterne entre os <strong>9 Canteiros de Plantio</strong> ou os <strong>Slots de Enfeites / Decorações</strong>. Arraste diretamente no canvas para calibrar ou digite nos campos. Para os jogadores comuns, é recomendável posicionar enfeites livremente usando <code>!fazenda-admin</code>!
  </div>

  <div class="mode-nav">
    <button class="mode-btn active" id="btn-mode-plants">🌱 Canteiros de Cultivo (1 a 9)</button>
    <button class="mode-btn" id="btn-mode-decors">🏛️ Slots de Enfeites (1 a 4)</button>
  </div>

  <div class="slot-bar" id="slot-bar-container">
    <label id="slot-bar-label">Selecionar Canteiro:</label>
    <div id="quick-slot-buttons" style="display: flex; gap: 0.4rem;"></div>
  </div>

  <div class="hud-bar" id="hud">📍 Selecione um item ou arraste diretamente na tela.</div>

  <div class="workspace">
    <div class="canvas-container" id="canvas"></div>

    <div class="sidebar">
      <h3 id="sidebar-title">Coordenadas dos 9 Canteiros</h3>
      <div id="slots-list"></div>

      <div style="background:#110c1a; border:1px solid #482f63; border-radius:6px; padding:0.75rem; display:flex; flex-direction:column; gap:0.5rem;">
        <h4 style="color:#ffd978; margin:0; font-size:13px;">🛡️ Ajuste da Área Proibida (Losango)</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:12px;">
          <span>Centro X: <input type="number" id="input-area-cx" value="512" style="width:58px; background:#0a0710; color:#ffd978; border:1px solid #482f63; padding:2px 4px; border-radius:4px;"></span>
          <span>Centro Y: <input type="number" id="input-area-cy" value="530" style="width:58px; background:#0a0710; color:#ffd978; border:1px solid #482f63; padding:2px 4px; border-radius:4px;"></span>
          <span>Raio X (Largura): <input type="number" id="input-area-rx" value="480" style="width:58px; background:#0a0710; color:#ffd978; border:1px solid #482f63; padding:2px 4px; border-radius:4px;"></span>
          <span>Raio Y (Altura): <input type="number" id="input-area-ry" value="270" style="width:58px; background:#0a0710; color:#ffd978; border:1px solid #482f63; padding:2px 4px; border-radius:4px;"></span>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px; margin-top:0.25rem;">
          <span>Opacidade do Fundo:</span>
          <input type="range" id="input-area-opacity" min="10" max="90" value="65" style="width:140px; cursor:pointer;">
          <span id="label-area-opacity" style="color:#ffd978; font-weight:bold;">65%</span>
        </div>
      </div>
      
      <div class="actions-bar">
        <button class="btn" id="btn-random-all">🎲 Sortear Plantas</button>
        <button class="btn btn-secondary" id="btn-toggle-forbidden">👁️ Alternar Área Proibida</button>
        <button class="btn btn-secondary" id="btn-reset">🔄 Resetar Coordenadas Padrão</button>
        <button class="btn" id="btn-copy">📋 Copiar Configuração JSON Ativa</button>
      </div>

      <h4>Configuração Gerada:</h4>
      <pre id="output"></pre>
    </div>
  </div>

  <script>
    const defaultPlantCoords = {
      1: { x: 512, y: 350, scale: 0.35, zIndex: 1 },
      2: { x: 345, y: 440, scale: 0.38, zIndex: 2 },
      3: { x: 679, y: 440, scale: 0.38, zIndex: 2 },
      4: { x: 178, y: 530, scale: 0.40, zIndex: 3 },
      5: { x: 512, y: 530, scale: 0.40, zIndex: 3 },
      6: { x: 846, y: 530, scale: 0.40, zIndex: 3 },
      7: { x: 345, y: 620, scale: 0.42, zIndex: 4 },
      8: { x: 679, y: 620, scale: 0.42, zIndex: 4 },
      9: { x: 512, y: 710, scale: 0.45, zIndex: 5 },
    };

    const defaultDecorCoords = {
      1: { x: 220, y: 310, layer: 'back' },
      2: { x: 850, y: 380, layer: 'back' },
      3: { x: 160, y: 830, layer: 'front' },
      4: { x: 750, y: 840, layer: 'front' },
    };

    const plantSprites = [
      '01_nightshade_seed.png', '01_nightshade_growing.png', '01_nightshade_ready.png',
      '02_tomb_shroom_seed.png', '02_tomb_shroom_growing.png', '02_tomb_shroom_ready.png',
      '03_corpse_lily_seed.png', '03_corpse_lily_growing.png', '03_corpse_lily_ready.png',
      '04_black_lotus_seed.png', '04_black_lotus_growing.png', '04_black_lotus_ready.png',
      '05_mist_crawler_v2_seed.png', '05_mist_crawler_v2_growing.png', '05_mist_crawler_v2_ready.png',
      '06_styx_kelp_v2_seed.png', '06_styx_kelp_v2_growing.png', '06_styx_kelp_v2_ready.png',
      '07_spectral_gourd_v2_seed.png', '07_spectral_gourd_v2_growing.png', '07_spectral_gourd_v2_ready.png',
      '08_devouring_root_v2_seed.png', '08_devouring_root_v2_growing.png', '08_devouring_root_v2_ready.png',
      '09_obsidian_clover_seed.png', '09_obsidian_clover_growing.png', '09_obsidian_clover_ready.png',
      '10_golden_clover_seed.png', '10_golden_clover_growing.png', '10_golden_clover_ready.png',
      '11_purple_heart_seed.png', '11_purple_heart_growing.png', '11_purple_heart_ready.png',
      '12_blood_rose_seed.png', '12_blood_rose_growing.png', '12_blood_rose_ready.png',
    ];

    const decorSprites = [
      'decor_gargoyle.png', 'decor_gothic_fence.png', 'decor_tombstone.png', 'decor_blood_fountain.png'
    ];

    let currentMode = 'plants';
    let plantCoords = JSON.parse(JSON.stringify(defaultPlantCoords));
    let decorCoords = JSON.parse(JSON.stringify(defaultDecorCoords));
    let activeSlot = 1;
    let isDragging = false;

    const container = document.getElementById('canvas');
    const slotsList = document.getElementById('slots-list');
    const output = document.getElementById('output');
    const hud = document.getElementById('hud');
    const quickSlotBar = document.getElementById('quick-slot-buttons');
    const sidebarTitle = document.getElementById('sidebar-title');
    const slotBarLabel = document.getElementById('slot-bar-label');

    function getRandomSprite() {
      return plantSprites[Math.floor(Math.random() * plantSprites.length)];
    }

    function selectSlot(slotIndex, randomize = false) {
      activeSlot = slotIndex;
      document.querySelectorAll('.slot-pin').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.slot-row').forEach(r => r.classList.remove('active'));
      document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));

      const activePin = document.getElementById('pin-' + slotIndex);
      const activeRow = document.getElementById('row-' + slotIndex);
      const activeBtn = document.getElementById('btn-slot-' + slotIndex);

      if (activePin) activePin.classList.add('active');
      if (activeRow) activeRow.classList.add('active');
      if (activeBtn) activeBtn.classList.add('active');

      if (randomize && activePin && currentMode === 'plants') {
        const rand = getRandomSprite();
        const img = activePin.querySelector('.slot-img');
        if (img) {
          img.src = '/farm/sprites/plants/' + rand;
          const stageMult = rand.includes('_seed') ? 0.45 : rand.includes('_growing') ? 0.75 : 1.0;
          img.style.transform = 'scale(' + (plantCoords[slotIndex].scale * 2.2 * stageMult) + ')';
        }
      }

      const c = currentMode === 'plants' ? plantCoords[slotIndex] : decorCoords[slotIndex];
      hud.innerText = '📍 ' + (currentMode === 'plants' ? 'Canteiro ' : 'Slot de Enfeite ') + slotIndex + ' selecionado: X=' + c.x + ', Y=' + c.y;
    }

    let forbiddenArea = { cx: 512, cy: 530, rx: 480, ry: 270, opacity: 0.65 };

    function getForbiddenPoints() {
      const topX = forbiddenArea.cx;
      const topY = forbiddenArea.cy - forbiddenArea.ry;
      const rightX = forbiddenArea.cx + forbiddenArea.rx;
      const rightY = forbiddenArea.cy;
      const bottomX = forbiddenArea.cx;
      const bottomY = forbiddenArea.cy + forbiddenArea.ry;
      const leftX = forbiddenArea.cx - forbiddenArea.rx;
      const leftY = forbiddenArea.cy;
      return topX + ',' + topY + ' ' + rightX + ',' + rightY + ' ' + bottomX + ',' + bottomY + ' ' + leftX + ',' + leftY;
    }

    function updateForbiddenOverlay() {
      const polygon = document.getElementById('forbidden-polygon');
      const overlay = document.getElementById('forbidden-overlay');
      if (polygon) {
        polygon.setAttribute('points', getForbiddenPoints());
        polygon.setAttribute('fill', 'rgba(255, 40, 70, ' + (forbiddenArea.opacity * 0.45) + ')');
      }
      if (overlay) {
        overlay.style.opacity = forbiddenArea.opacity;
      }
      updateOutput();
    }

    function renderPins() {
      container.innerHTML = \`
        <svg id="forbidden-overlay" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:2; transition:opacity 0.3s; opacity:\${forbiddenArea.opacity};" viewBox="0 0 1024 1024">
          <polygon id="forbidden-polygon" points="\${getForbiddenPoints()}" fill="rgba(255, 40, 70, \${forbiddenArea.opacity * 0.45})" stroke="#ff3366" stroke-width="3" stroke-dasharray="8,8" />
        </svg>
      \`;
      slotsList.innerHTML = '';
      quickSlotBar.innerHTML = '';

      if (currentMode === 'plants') {
        sidebarTitle.innerText = 'Coordenadas dos 9 Canteiros';
        slotBarLabel.innerText = 'Selecionar Canteiro:';

        for (let i = 1; i <= 9; i++) {
          const btn = document.createElement('button');
          btn.className = 'slot-btn' + (i === activeSlot ? ' active' : '');
          btn.id = 'btn-slot-' + i;
          btn.innerText = i;
          btn.addEventListener('click', () => selectSlot(i, true));
          quickSlotBar.appendChild(btn);

          const c = plantCoords[i];
          const pin = document.createElement('div');
          pin.className = 'slot-pin' + (i === activeSlot ? ' active' : '');
          pin.id = 'pin-' + i;
          pin.style.left = c.x + 'px';
          pin.style.top = c.y + 'px';
          pin.style.zIndex = c.zIndex * 10;

          const initialSprite = plantSprites[(i - 1) * 3 + 2] || plantSprites[0];
          const stageMult = initialSprite.includes('_seed') ? 0.45 : initialSprite.includes('_growing') ? 0.75 : 1.0;

          pin.innerHTML = \`
            <div class="slot-badge">Slot \${i} (\${c.x}, \${c.y})</div>
            <img class="slot-img" src="/farm/sprites/plants/\${initialSprite}" style="transform: scale(\${c.scale * 2.2 * stageMult}); transform-origin: bottom center;" />
            <div class="slot-base-marker"></div>
          \`;

          pin.addEventListener('mousedown', (e) => startDrag(i, e));
          container.appendChild(pin);

          const row = document.createElement('div');
          row.className = 'slot-row' + (i === activeSlot ? ' active' : '');
          row.id = 'row-' + i;
          row.innerHTML = \`
            <span><strong>Canteiro \${i}</strong></span>
            <span>X: <input type="number" id="input-x-\${i}" value="\${c.x}" style="width:58px; background:#0a0710; color:#ffd978; border:1px solid #482f63; padding:2px 4px; border-radius:4px;"></span>
            <span>Y: <input type="number" id="input-y-\${i}" value="\${c.y}" style="width:58px; background:#0a0710; color:#ffd978; border:1px solid #482f63; padding:2px 4px; border-radius:4px;"></span>
          \`;
          slotsList.appendChild(row);

          row.querySelector('#input-x-' + i).addEventListener('input', (e) => updateVal(i, 'x', e.target.value));
          row.querySelector('#input-y-' + i).addEventListener('input', (e) => updateVal(i, 'y', e.target.value));
          row.addEventListener('click', () => selectSlot(i, false));
        }
      } else {
        sidebarTitle.innerText = 'Slots Padrão de Enfeites (1 a 4)';
        slotBarLabel.innerText = 'Selecionar Enfeite:';

        for (let i = 1; i <= 4; i++) {
          const btn = document.createElement('button');
          btn.className = 'slot-btn' + (i === activeSlot ? ' active' : '');
          btn.id = 'btn-slot-' + i;
          btn.innerText = i;
          btn.addEventListener('click', () => selectSlot(i, false));
          quickSlotBar.appendChild(btn);

          const c = decorCoords[i];
          const pin = document.createElement('div');
          pin.className = 'slot-pin' + (i === activeSlot ? ' active' : '');
          pin.id = 'pin-' + i;
          pin.style.left = c.x + 'px';
          pin.style.top = c.y + 'px';
          pin.style.zIndex = c.y < 520 ? 15 : 60;

          const spriteName = decorSprites[i - 1] || 'decor_gargoyle.png';

          pin.innerHTML = \`
            <div class="slot-badge" style="border-color:#b25aff; color:#dfb2ff;">Enfeite \${i} (\${c.x}, \${c.y})</div>
            <img class="slot-img" src="/farm/sprites/decorations/\${spriteName}" style="max-width:110px; max-height:110px; object-fit:contain;" />
            <div class="slot-base-marker" style="background:#b25aff; box-shadow:0 0 8px #b25aff;"></div>
          \`;

          pin.addEventListener('mousedown', (e) => startDrag(i, e));
          container.appendChild(pin);

          const row = document.createElement('div');
          row.className = 'slot-row' + (i === activeSlot ? ' active' : '');
          row.id = 'row-' + i;
          row.innerHTML = \`
            <span><strong>Enfeite \${i}</strong></span>
            <span>X: <input type="number" id="input-x-\${i}" value="\${c.x}" style="width:58px; background:#0a0710; color:#ffd978; border:1px solid #482f63; padding:2px 4px; border-radius:4px;"></span>
            <span>Y: <input type="number" id="input-y-\${i}" value="\${c.y}" style="width:58px; background:#0a0710; color:#ffd978; border:1px solid #482f63; padding:2px 4px; border-radius:4px;"></span>
          \`;
          slotsList.appendChild(row);

          row.querySelector('#input-x-' + i).addEventListener('input', (e) => updateVal(i, 'x', e.target.value));
          row.querySelector('#input-y-' + i).addEventListener('input', (e) => updateVal(i, 'y', e.target.value));
          row.addEventListener('click', () => selectSlot(i, false));
        }
      }

      updateOutput();
    }

    function startDrag(slotIndex, e) {
      selectSlot(slotIndex, false);
      isDragging = true;
      e.preventDefault();
    }

    window.addEventListener('mousemove', (e) => {
      if (!isDragging || activeSlot === null) return;
      const rect = container.getBoundingClientRect();
      let x = Math.round(e.clientX - rect.left);
      let y = Math.round(e.clientY - rect.top);

      x = Math.max(0, Math.min(1024, x));
      y = Math.max(0, Math.min(1024, y));

      const targetCoords = currentMode === 'plants' ? plantCoords : decorCoords;
      if (!targetCoords[activeSlot]) return;

      targetCoords[activeSlot].x = x;
      targetCoords[activeSlot].y = y;

      const pin = document.getElementById('pin-' + activeSlot);
      if (pin) {
        pin.style.left = x + 'px';
        pin.style.top = y + 'px';
        const badgeLabel = currentMode === 'plants' ? 'Slot ' : 'Enfeite ';
        pin.querySelector('.slot-badge').innerText = badgeLabel + activeSlot + ' (' + x + ', ' + y + ')';
      }

      const inputX = document.getElementById('input-x-' + activeSlot);
      const inputY = document.getElementById('input-y-' + activeSlot);
      if (inputX) inputX.value = x;
      if (inputY) inputY.value = y;

      const itemLabel = currentMode === 'plants' ? 'Slot ' : 'Enfeite ';
      hud.innerText = '📍 Arrastando ' + itemLabel + activeSlot + ': (' + x + ', ' + y + ')';

      updateOutput();
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        const targetCoords = currentMode === 'plants' ? plantCoords : decorCoords;
        const c = targetCoords[activeSlot];
        const itemLabel = currentMode === 'plants' ? 'Canteiro ' : 'Slot de Enfeite ';
        if (c) {
          hud.innerText = '✅ ' + itemLabel + activeSlot + ' alocado em: (' + c.x + ', ' + c.y + ')';
        }
      }
    });

    function updateVal(slot, axis, val) {
      const targetCoords = currentMode === 'plants' ? plantCoords : decorCoords;
      if (!targetCoords[slot]) return;
      targetCoords[slot][axis] = parseInt(val) || 0;
      const pin = document.getElementById('pin-' + slot);
      if (pin) {
        pin.style[axis === 'x' ? 'left' : 'top'] = targetCoords[slot][axis] + 'px';
        const badgeLabel = currentMode === 'plants' ? 'Slot ' : 'Enfeite ';
        pin.querySelector('.slot-badge').innerText = badgeLabel + slot + ' (' + targetCoords[slot].x + ', ' + targetCoords[slot].y + ')';
      }
      const itemLabel = currentMode === 'plants' ? 'Canteiro ' : 'Slot de Enfeite ';
      hud.innerText = '📍 ' + itemLabel + slot + ' editado: (' + targetCoords[slot].x + ', ' + targetCoords[slot].y + ')';
      updateOutput();
    }

    function randomizeAllSprites() {
      if (currentMode !== 'plants') {
        hud.innerText = '⚠️ O sorteio de plantas só está disponível no modo Canteiros.';
        return;
      }
      for (let i = 1; i <= 9; i++) {
        const pin = document.getElementById('pin-' + i);
        if (pin) {
          const rand = getRandomSprite();
          const img = pin.querySelector('.slot-img');
          if (img) img.src = '/farm/sprites/plants/' + rand;
        }
      }
      hud.innerText = '🎲 Todos os 9 canteiros foram sorteados com plantas e fases aleatórias!';
    }

    function resetDefaultCoords() {
      if (currentMode === 'plants') {
        plantCoords = JSON.parse(JSON.stringify(defaultPlantCoords));
        hud.innerText = '🔄 Coordenadas dos canteiros restauradas para os padrões.';
      } else {
        decorCoords = JSON.parse(JSON.stringify(defaultDecorCoords));
        hud.innerText = '🔄 Coordenadas padrão de enfeites restauradas.';
      }
      renderPins();
      selectSlot(1, false);
    }

    function updateOutput() {
      if (currentMode === 'plants') {
        output.innerText = JSON.stringify({
          plantCoordinates: plantCoords,
          forbiddenArea: {
            cx: forbiddenArea.cx,
            cy: forbiddenArea.cy,
            rx: forbiddenArea.rx,
            ry: forbiddenArea.ry,
            points: getForbiddenPoints()
          }
        }, null, 2);
      } else {
        output.innerText = JSON.stringify({
          defaultDecorCoordinates: decorCoords,
          notice: "Você também pode posicionar enfeites livremente usando a interface do admin (!fazenda-admin)"
        }, null, 2);
      }
    }

    function copyConfig() {
      navigator.clipboard.writeText(output.innerText);
      hud.innerText = '📋 JSON copiado para a área de transferência!';
      alert('Configuração copiada com sucesso! Cole aqui no chat para aplicarmos.');
    }

    // Register mode button listeners
    document.getElementById('btn-mode-plants').addEventListener('click', () => {
      currentMode = 'plants';
      document.getElementById('btn-mode-plants').classList.add('active');
      document.getElementById('btn-mode-decors').classList.remove('active');
      activeSlot = 1;
      renderPins();
      selectSlot(1, false);
    });

    document.getElementById('btn-mode-decors').addEventListener('click', () => {
      currentMode = 'decors';
      document.getElementById('btn-mode-decors').classList.add('active');
      document.getElementById('btn-mode-plants').classList.remove('active');
      activeSlot = 1;
      renderPins();
      selectSlot(1, false);
    });

    // Register button listeners cleanly (CSP safe)
    document.getElementById('btn-random-all').addEventListener('click', randomizeAllSprites);
    document.getElementById('btn-reset').addEventListener('click', resetDefaultCoords);
    document.getElementById('btn-copy').addEventListener('click', copyConfig);
    document.getElementById('btn-toggle-forbidden').addEventListener('click', () => {
      const ov = document.getElementById('forbidden-overlay');
      if (ov) {
        ov.style.display = (ov.style.display === 'none' ? 'block' : 'none');
      }
    });

    // Forbidden area inputs
    document.getElementById('input-area-cx').addEventListener('input', (e) => {
      forbiddenArea.cx = parseInt(e.target.value) || 512;
      updateForbiddenOverlay();
    });
    document.getElementById('input-area-cy').addEventListener('input', (e) => {
      forbiddenArea.cy = parseInt(e.target.value) || 530;
      updateForbiddenOverlay();
    });
    document.getElementById('input-area-rx').addEventListener('input', (e) => {
      forbiddenArea.rx = parseInt(e.target.value) || 480;
      updateForbiddenOverlay();
    });
    document.getElementById('input-area-ry').addEventListener('input', (e) => {
      forbiddenArea.ry = parseInt(e.target.value) || 270;
      updateForbiddenOverlay();
    });
    document.getElementById('input-area-opacity').addEventListener('input', (e) => {
      const val = parseInt(e.target.value) || 65;
      forbiddenArea.opacity = val / 100;
      document.getElementById('label-area-opacity').innerText = val + '%';
      updateForbiddenOverlay();
    });

    renderPins();
    selectSlot(1, false);
  </script>
</body>
</html>`;
}
