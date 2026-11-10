export const SUPER_ADMIN_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Super Admin</title>
<style>
  body { background:#0f0a18; color:#e0d0b0; font-family: system-ui, sans-serif; margin:0; padding:1rem; }
  h1 { font-size:1.3rem; } h3 { margin:1rem 0 .4rem; color:#ffd978; }
  .box { max-width:1100px; margin:0 auto; }
  .tabs button { background:#1c122b; color:#e0d0b0; border:1px solid #4a2d6e; padding:.5rem 1rem; cursor:pointer; border-radius:6px 6px 0 0; }
  .tabs button.active { background:#4a2d6e; }
  .panel { display:none; background:#130d20; border:1px solid #4a2d6e; padding:1rem; border-radius:0 8px 8px 8px; }
  .panel.active { display:block; }
  input, select, textarea { background:#1c122b; color:#e0d0b0; border:1px solid #4a2d6e; padding:.4rem; border-radius:4px; width:100%; box-sizing:border-box; }
  textarea { font-family: monospace; min-height:420px; }
  label { font-size:.75rem; color:#a894c4; display:block; margin-top:.5rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:.6rem; }
  button.act { background:#287a4c; color:#fff; border:none; padding:.5rem 1rem; border-radius:6px; cursor:pointer; margin-top:.8rem; }
  button.sec { background:#4a2d6e; }
  table { width:100%; border-collapse:collapse; font-size:.85rem; }
  td, th { border-bottom:1px solid #2a1c40; padding:.3rem .4rem; text-align:left; }
  tr.row:hover { background:#1c122b; cursor:pointer; }
  img.th { height:36px; image-rendering:pixelated; }
  #msg { position:fixed; bottom:1rem; right:1rem; background:#287a4c; padding:.6rem 1rem; border-radius:6px; display:none; }
  #msg.err { background:#a82828; }
  #login { max-width:320px; margin:20vh auto; }
</style>
</head>
<body>
<div id="login">
  <h1>🔐 Super Admin</h1>
  <input type="password" id="pw" placeholder="Senha (SUPER_ADMIN_PASSWORD)">
  <button class="act" onclick="doLogin()">Entrar</button>
</div>

<div class="box" id="app" style="display:none">
  <h1>🛠️ Super Admin <button class="act sec" style="float:right;margin:0" onclick="reloadAll()">♻️ Recarregar catálogo</button></h1>
  <div class="tabs">
    <button class="active" data-p="p-texts">📝 Textos &amp; Emojis</button>
    <button data-p="p-plants">🌱 Plantas</button>
    <button data-p="p-decors">🏛️ Enfeites</button>
    <button data-p="p-consumables">⚗️ Consumíveis</button>
  </div>

  <div class="panel active" id="p-texts">
    <p style="font-size:.8rem;color:#a894c4">Edite o JSON (nome do jogo, subtítulos, emojis, tooltips). Placeholders: {gameName}, {gameEmoji}, {ecosystem}, {coins}, {harvests}, {time}, {username}. O bot atualiza em até 1 minuto.</p>
    <textarea id="texts-json"></textarea>
    <button class="act" onclick="saveTexts()">💾 Salvar textos</button>
  </div>

  <div class="panel" id="p-plants">
    <table id="plants-table"></table>
    <h3 id="plant-form-title">Nova planta</h3>
    <div class="grid">
      <div><label>ID (a-z0-9_)</label><input id="pl-id"></div>
      <div><label>Nome</label><input id="pl-name"></div>
      <div><label>Categoria</label><select id="pl-category"><option>economia</option><option>pesca</option><option>cassino</option><option>waifus</option></select></div>
      <div><label>Preço semente</label><input id="pl-seedPrice" type="number" value="100"></div>
      <div><label>Preço venda</label><input id="pl-sellPrice" type="number" value="50"></div>
      <div><label>Crescimento (s)</label><input id="pl-growthTimeSeconds" type="number" value="3600"></div>
      <div><label>Apodrece após (s)</label><input id="pl-witherTimeSeconds" type="number" value="10800"></div>
      <div><label>Recompensa Petalitas</label><input id="pl-coinReward" type="number" value="200"></div>
      <div><label>Tipo de bônus</label><input id="pl-bonusType" value="coins"></div>
      <div><label>Descrição do bônus</label><input id="pl-bonusDescription"></div>
      <div><label>Limite de compra/dia</label><input id="pl-dailyLimit" type="number" value="10"></div>
      <div><label>Sacola diária (tier)</label><select id="pl-dailyBagTier"><option value="none">Nunca cai na sacola</option><option value="common">common (garantida, 3x)</option><option value="uncommon">uncommon (20%)</option><option value="rare">rare (10%)</option><option value="epic">epic (3%)</option></select></div>
    </div>
    <div class="grid">
      <div><label>Sprite semente (PNG)</label><input type="file" id="pl-seed" accept="image/*"></div>
      <div><label>Sprite crescendo (PNG)</label><input type="file" id="pl-growing" accept="image/*"></div>
      <div><label>Sprite pronta (PNG)</label><input type="file" id="pl-ready" accept="image/*"></div>
    </div>
    <p style="font-size:.75rem;color:#a894c4">Sprites são recortados (margens transparentes) e limitados a 600px automaticamente. Ao editar, só envie os sprites que quiser trocar.</p>
    <button class="act" onclick="savePlant()">💾 Salvar planta</button>
    <button class="act sec" onclick="clearPlantForm()">Limpar</button>
  </div>

  <div class="panel" id="p-decors">
    <table id="decors-table"></table>
    <h3 id="decor-form-title">Novo enfeite</h3>
    <div class="grid">
      <div><label>ID (a-z0-9_)</label><input id="dc-id"></div>
      <div><label>Nome</label><input id="dc-name"></div>
      <div><label>Tier</label><select id="dc-tier"><option>simples</option><option>medio</option><option>complexo</option><option value="oculto">oculto (não vendido na loja)</option></select></div>
      <div><label>Preço</label><input id="dc-price" type="number" value="500000"></div>
      <div><label>Preço venda</label><input id="dc-sellPrice" type="number" value="250000"></div>
      <div><label>Sprite (PNG)</label><input type="file" id="dc-sprite" accept="image/*"></div>
    </div>
    <button class="act" onclick="saveDecor()">💾 Salvar enfeite</button>
    <button class="act sec" onclick="clearDecorForm()">Limpar</button>
  </div>

  <div class="panel" id="p-consumables">
    <table id="consumables-table"></table>
    <h3 id="consumable-form-title">Novo consumível</h3>
    <div class="grid">
      <div><label>ID (a-z0-9_)</label><input id="cs-id"></div>
      <div><label>Nome</label><input id="cs-name"></div>
      <div><label>Cor</label><input id="cs-color"></div>
      <div><label>Preço Loja (0 = não vende)</label><input id="cs-price" type="number" value="1000"></div>
      <div><label>Limite/dia (0 = não vende)</label><input id="cs-dailyLimit" type="number" value="5"></div>
      <div><label>Efeito</label><input id="cs-effect" value="none"></div>
      <div><label>Descrição</label><input id="cs-description"></div>
      <div><label>Sprite (PNG)</label><input type="file" id="cs-sprite" accept="image/*"></div>
    </div>
    <button class="act" onclick="saveConsumable()">💾 Salvar consumível</button>
    <button class="act sec" onclick="clearConsumableForm()">Limpar</button>
  </div>
</div>
<div id="msg"></div>

<script>
var PW = sessionStorage.getItem('sa_pw') || '';
var DATA = null;

function toast(m, err) {
  var el = document.getElementById('msg');
  el.textContent = m; el.className = err ? 'err' : ''; el.style.display = 'block';
  setTimeout(function () { el.style.display = 'none'; }, 3500);
}

function api(method, url, body) {
  return fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json', 'x-admin-password': PW },
    body: body ? JSON.stringify(body) : undefined
  }).then(function (r) {
    return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || 'Erro'); return j; });
  });
}

function doLogin() {
  PW = document.getElementById('pw').value;
  load().then(function () { sessionStorage.setItem('sa_pw', PW); }).catch(function (e) { toast(e.message, true); });
}

function load() {
  return api('GET', '/super-admin/api/data').then(function (d) {
    DATA = d;
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('texts-json').value = JSON.stringify(d.texts, null, 2);
    renderPlants(); renderDecors(); renderConsumables();
  });
}

function reloadAll() {
  api('POST', '/super-admin/api/reload').then(function (r) { toast('Recarregado: ' + r.plants + ' plantas, ' + r.decorations + ' enfeites'); return load(); }).catch(function (e) { toast(e.message, true); });
}

function saveTexts() {
  var parsed;
  try { parsed = JSON.parse(document.getElementById('texts-json').value); } catch (e) { return toast('JSON inválido: ' + e.message, true); }
  api('PUT', '/super-admin/api/texts', parsed).then(function () { toast('Textos salvos!'); }).catch(function (e) { toast(e.message, true); });
}

function fileToB64(id) {
  var f = document.getElementById(id).files[0];
  if (!f) return Promise.resolve(null);
  return new Promise(function (res, rej) {
    var fr = new FileReader();
    fr.onload = function () { res(fr.result); };
    fr.onerror = rej;
    fr.readAsDataURL(f);
  });
}

function v(id) { return document.getElementById(id).value; }
function setv(id, val) { document.getElementById(id).value = val == null ? '' : val; }

var PLANT_FIELDS = ['id', 'name', 'category', 'seedPrice', 'sellPrice', 'growthTimeSeconds', 'witherTimeSeconds', 'coinReward', 'bonusType', 'bonusDescription', 'dailyLimit', 'dailyBagTier'];

function renderPlants() {
  var h = '<tr><th></th><th>#</th><th>ID</th><th>Nome</th><th>Cat.</th><th>Semente</th><th>Venda</th><th>Cresce (s)</th><th>Sacola</th></tr>';
  DATA.plants.forEach(function (p) {
    h += '<tr class="row" onclick="editPlant(\\'' + p.id + '\\')"><td><img class="th" src="/farm/sprites/plants/' + p.spriteBaseName + '_ready.png?t=' + Date.now() + '"></td><td>' + p.index + '</td><td>' + p.id + '</td><td>' + p.name + '</td><td>' + p.category + '</td><td>' + p.seedPrice + '</td><td>' + p.sellPrice + '</td><td>' + p.growthTimeSeconds + '</td><td>' + (p.dailyBagTier || '-') + '</td></tr>';
  });
  document.getElementById('plants-table').innerHTML = h;
}

function editPlant(id) {
  var p = DATA.plants.filter(function (x) { return x.id === id; })[0];
  PLANT_FIELDS.forEach(function (f) { setv('pl-' + f, f === 'dailyBagTier' ? (p[f] || 'none') : (f === 'dailyLimit' ? (p[f] || 10) : p[f])); });
  document.getElementById('pl-id').readOnly = true;
  document.getElementById('plant-form-title').textContent = 'Editando: ' + p.name;
  window.scrollTo(0, document.body.scrollHeight);
}

function clearPlantForm() {
  PLANT_FIELDS.forEach(function (f) { if (f !== 'category' && f !== 'bonusType' && f !== 'dailyLimit' && f !== 'dailyBagTier') setv('pl-' + f, ''); });
  ['pl-seed', 'pl-growing', 'pl-ready'].forEach(function (i) { setv(i, ''); });
  document.getElementById('pl-id').readOnly = false;
  document.getElementById('plant-form-title').textContent = 'Nova planta';
}

function savePlant() {
  Promise.all([fileToB64('pl-seed'), fileToB64('pl-growing'), fileToB64('pl-ready')]).then(function (f) {
    var body = { sprites: {} };
    PLANT_FIELDS.forEach(function (k) { body[k] = v('pl-' + k); });
    if (f[0]) body.sprites.seed = f[0];
    if (f[1]) body.sprites.growing = f[1];
    if (f[2]) body.sprites.ready = f[2];
    return api('POST', '/super-admin/api/plants', body);
  }).then(function () { toast('Planta salva!'); clearPlantForm(); return load(); }).catch(function (e) { toast(e.message, true); });
}

var DECOR_FIELDS = ['id', 'name', 'tier', 'price', 'sellPrice'];

function renderDecors() {
  var h = '<tr><th></th><th>#</th><th>ID</th><th>Nome</th><th>Tier</th><th>Preço</th></tr>';
  DATA.decorations.forEach(function (d) {
    h += '<tr class="row" onclick="editDecor(\\'' + d.id + '\\')"><td><img class="th" src="/farm/sprites/decorations/' + d.spriteName + '.png?t=' + Date.now() + '"></td><td>' + d.index + '</td><td>' + d.id + '</td><td>' + d.name + '</td><td>' + d.tier + '</td><td>' + d.price + '</td></tr>';
  });
  document.getElementById('decors-table').innerHTML = h;
}

function editDecor(id) {
  var d = DATA.decorations.filter(function (x) { return x.id === id; })[0];
  DECOR_FIELDS.forEach(function (f) { setv('dc-' + f, d[f]); });
  document.getElementById('dc-id').readOnly = true;
  document.getElementById('decor-form-title').textContent = 'Editando: ' + d.name;
  window.scrollTo(0, document.body.scrollHeight);
}

function clearDecorForm() {
  ['id', 'name'].forEach(function (f) { setv('dc-' + f, ''); });
  setv('dc-sprite', '');
  document.getElementById('dc-id').readOnly = false;
  document.getElementById('decor-form-title').textContent = 'Novo enfeite';
}

function saveDecor() {
  fileToB64('dc-sprite').then(function (s) {
    var body = {};
    DECOR_FIELDS.forEach(function (k) { body[k] = v('dc-' + k); });
    if (s) body.sprite = s;
    return api('POST', '/super-admin/api/decorations', body);
  }).then(function () { toast('Enfeite salvo!'); clearDecorForm(); return load(); }).catch(function (e) { toast(e.message, true); });
}

var CONSUMABLE_FIELDS = ['id', 'name', 'color', 'price', 'dailyLimit', 'effect', 'description'];

function renderConsumables() {
  var h = '<tr><th></th><th>#</th><th>ID</th><th>Nome</th><th>Cor</th><th>Preço</th><th>Limite/dia</th><th>Efeito</th></tr>';
  (DATA.consumables || []).forEach(function (c) {
    h += '<tr class="row" onclick="editConsumable(\\'' + c.id + '\\')"><td><img class="th" src="/farm/sprites/consumables/' + c.spriteName + '.png?t=' + Date.now() + '"></td><td>' + c.index + '</td><td>' + c.id + '</td><td>' + c.name + '</td><td>' + (c.color || '-') + '</td><td>' + (c.price > 0 ? c.price : 'Não vende') + '</td><td>' + (c.dailyLimit > 0 ? c.dailyLimit : 'Não vende') + '</td><td>' + (c.effect || '-') + '</td></tr>';
  });
  document.getElementById('consumables-table').innerHTML = h;
}

function editConsumable(id) {
  var c = (DATA.consumables || []).filter(function (x) { return x.id === id; })[0];
  if (!c) return;
  CONSUMABLE_FIELDS.forEach(function (f) { setv('cs-' + f, c[f]); });
  document.getElementById('cs-id').readOnly = true;
  document.getElementById('consumable-form-title').textContent = 'Editando: ' + c.name;
  window.scrollTo(0, document.body.scrollHeight);
}

function clearConsumableForm() {
  CONSUMABLE_FIELDS.forEach(function (f) { setv('cs-' + f, ''); });
  setv('cs-sprite', '');
  document.getElementById('cs-id').readOnly = false;
  document.getElementById('consumable-form-title').textContent = 'Novo consumível';
}

function saveConsumable() {
  fileToB64('cs-sprite').then(function (s) {
    var body = {};
    CONSUMABLE_FIELDS.forEach(function (k) { body[k] = v('cs-' + k); });
    if (s) body.sprite = s;
    return api('POST', '/super-admin/api/consumables', body);
  }).then(function () { toast('Consumível salvo!'); clearConsumableForm(); return load(); }).catch(function (e) { toast(e.message, true); });
}

document.querySelectorAll('.tabs button').forEach(function (b) {
  b.addEventListener('click', function () {
    document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.remove('active'); });
    document.querySelectorAll('.panel').forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active');
    document.getElementById(b.getAttribute('data-p')).classList.add('active');
  });
});

if (PW) load().catch(function () { sessionStorage.removeItem('sa_pw'); });
</script>
</body>
</html>`;
