import { t } from '../../utils/texts.js';
import { config } from '../../config.js';

export function renderPublicFarmHtml(status: any, uuid: string): string {
  const imageUrl = `/farm/share/image?id=${encodeURIComponent(uuid)}`;
  const readyCount = status.slots.filter((s: any) => s.stage === 'ready').length;
  const growingCount = status.slots.filter((s: any) => s.stage === 'growing' || s.stage === 'seed').length;
  const farmSubtitle = status.farmName
    ? `Santuário de Cultivo '${status.farmName}'`
    : `Santuário de Cultivo de ${status.playerName || 'Jardineiro'}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('publicPage.title')}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🥀</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;800;900&family=Metamorphous&family=MedievalSharp&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <meta property="og:title" content="${t('publicPage.ogTitle')}">
  <meta property="og:description" content="${t('publicPage.ogDescription', { coins: status.coins.toLocaleString('pt-BR'), harvests: status.stats.totalHarvested })}">
  <meta property="og:image" content="${config.PUBLIC_URL}${imageUrl}">
  <meta name="theme-color" content="#120c18">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background: radial-gradient(circle at center, #161124 0%, #0c0814 60%, #050408 100%);
      color: #dfd7cc;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      overflow-x: hidden;
    }
    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      max-width: 960px;
      width: 100%;
      text-align: center;
      animation: fadeIn 0.8s ease-out;
    }
    .header {
      margin-bottom: 1.25rem;
    }
    .header h1 {
      font-family: 'Metamorphous', 'Cinzel', serif;
      font-size: clamp(1.6rem, 3.5vw, 2.4rem);
      letter-spacing: 2px;
      color: #e8d8be;
      text-shadow: 0 0 16px rgba(186, 137, 255, 0.45), 0 2px 4px rgba(0, 0, 0, 0.9);
      margin-bottom: 0.25rem;
    }
    .header .subtitle {
      font-size: 0.95rem;
      color: #9f8fb3;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .frame-wrapper {
      position: relative;
      padding: 12px;
      border-radius: 20px;
      background: linear-gradient(135deg, #3d2b4f 0%, #1c1426 50%, #4a2c66 100%);
      box-shadow: 
        0 0 45px rgba(119, 56, 178, 0.35),
        0 15px 35px rgba(0, 0, 0, 0.8),
        inset 0 0 15px rgba(0, 0, 0, 0.6);
      border: 1px solid rgba(220, 185, 255, 0.25);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      max-width: 100%;
    }
    .frame-wrapper:hover {
      box-shadow: 
        0 0 60px rgba(154, 76, 230, 0.5),
        0 20px 45px rgba(0, 0, 0, 0.9),
        inset 0 0 15px rgba(0, 0, 0, 0.6);
    }
    .frame-inner {
      position: relative;
      border: 3px solid #1a1324;
      border-radius: 14px;
      overflow: hidden;
      background: #06040a url('/farm/bg/farm_bg_night.png') center/cover no-repeat;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      max-width: 760px;
      aspect-ratio: 1 / 1;
      box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.9);
    }
    .frame-inner::before {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(8, 4, 14, 0.75);
      backdrop-filter: blur(1px);
      z-index: 1;
      pointer-events: none;
    }
    .loader {
      position: absolute;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.9rem;
      color: #dfd7cc;
      font-size: 1rem;
      font-weight: bold;
      letter-spacing: 1.5px;
      transition: opacity 250ms ease-in-out, visibility 250ms ease-in-out;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
    }
    .loader.hidden {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 3px solid rgba(170, 92, 238, 0.2);
      border-top-color: #ffd978;
      border-right-color: #aa5cee;
      border-radius: 50%;
      animation: spin 0.85s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite;
      box-shadow: 0 0 16px rgba(170, 92, 238, 0.45);
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .farm-image {
      position: relative;
      z-index: 3;
      width: 100%;
      height: 100%;
      aspect-ratio: 1 / 1;
      object-fit: contain;
      display: block;
      opacity: 0;
      transition: opacity 250ms ease-in-out;
    }
    .farm-image.loaded {
      opacity: 1;
    }
    .stats-bar {
      margin-top: 1.5rem;
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      justify-content: center;
      align-items: center;
      width: 100%;
      max-width: 760px;
    }
    .stat-badge {
      background: rgba(26, 18, 36, 0.85);
      border: 1px solid rgba(138, 92, 184, 0.4);
      padding: 0.6rem 1.1rem;
      border-radius: 10px;
      font-size: 0.95rem;
      color: #dfd2c4;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .stat-badge strong {
      color: #f7e1b5;
    }
    .footer {
      margin-top: 1.5rem;
      font-size: 0.85rem;
      color: #7b6f8a;
      letter-spacing: 0.5px;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(15px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 600px) {
      body { padding: 0.75rem 0.5rem; }
      .container { max-width: 100%; }
      .frame-wrapper { padding: 8px; border-radius: 14px; }
      .header h1 { font-size: 1.5rem; }
      .header .subtitle { font-size: 0.8rem; }
      .stats-bar { gap: 0.5rem; }
      .stat-badge { font-size: 0.85rem; padding: 0.45rem 0.75rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${t('publicPage.ogTitle')}</h1>
      <div class="subtitle">${farmSubtitle}</div>
    </div>

    <div class="frame-wrapper">
      <div class="frame-inner">
        <div class="loader" id="farm-loader">
          <div class="spinner"></div>
          <span>Carregando Fazenda...</span>
        </div>
        <img class="farm-image" id="farm-img" src="${imageUrl}" alt="${t('gameName')}" loading="eager" onload="revealFarm()" />
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat-badge">🌱 Petalitas: <strong>${status.coins.toLocaleString('pt-BR')} Ptl</strong></div>
      <div class="stat-badge">🌾 Colhidas: <strong>${status.stats.totalHarvested}</strong></div>
      <div class="stat-badge">🌱 Crescendo: <strong>${growingCount}</strong></div>
      <div class="stat-badge">✨ Prontas: <strong>${readyCount}</strong></div>
    </div>

    <div class="footer">
      ${t('publicPage.footer')}
    </div>
  </div>

  <script>
    // Auto-transição para o painel administrativo se houver sessão ativa salva
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const isExplicitPublic = urlParams.get('public') === '1' || urlParams.get('view') === 'public';
      if (!isExplicitPublic) {
        const savedSession = localStorage.getItem('jds_admin_session');
        if (savedSession) {
          const sess = JSON.parse(savedSession);
          if (sess && sess.farmUuid === '${uuid}' && sess.token && sess.expiresAt > (Date.now() / 1000)) {
            window.location.replace('/farm?id=' + encodeURIComponent('${uuid}') + '&token=' + encodeURIComponent(sess.token));
          }
        }
      }
    } catch (e) {}

    function revealFarm() {
      const img = document.getElementById('farm-img');
      const loader = document.getElementById('farm-loader');
      if (img) img.classList.add('loaded');
      if (loader) loader.classList.add('hidden');
    }
    const imgEl = document.getElementById('farm-img');
    if (imgEl && imgEl.complete) {
      revealFarm();
    }
  </script>
</body>
</html>`;
}

export function renderPublicFarmEmpty(): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${t('gameName')}</title>
      <style>
        body {
          background: #0b0c10;
          color: #c5a880;
          font-family: 'Cinzel', 'Courier New', monospace, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          text-align: center;
        }
        .box {
          padding: 2.5rem;
          background: #14161d;
          border: 2px solid #5a3d7a;
          border-radius: 12px;
          box-shadow: 0 0 30px rgba(90, 61, 122, 0.4);
        }
        h1 { font-size: 1.8rem; margin-bottom: 0.5rem; color: #e0d0b0; }
        p { color: #8c827a; }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>${t('publicPage.ogTitle')}</h1>
        <p>Nenhuma fazenda informada. Utilize um link de compartilhamento válido.</p>
      </div>
    </body>
    </html>
  `;
}

export function renderPublicFarmNotFound(): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Não Encontrado — ${t('gameName')}</title>
      <style>
        body { background: #0c0814; color: #a894b5; font-family: monospace; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .card { padding: 2rem; border: 1px solid #4a2c66; background: #161124; border-radius: 8px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>⚠️ Fazenda Não Encontrada</h2>
        <p>O identificador informado não pertence a nenhum cultivador ativo.</p>
      </div>
    </body>
    </html>
  `;
}
