import { PLANTS, DECORATIONS, CONSUMABLES } from '../../utils/catalog.js';
import { t } from '../../utils/texts.js';

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m] || m);
}

export interface AdminViewParams {
  status: any;
  token: string;
  expiresAt: number;
  publicUrl: string;
  timeCycle: string;
  shopCatalog: any;
  slotCoordinates: Record<number, { x: number; y: number; scale: number; zIndex: number }>;
}

export function renderAdminFarmHtml(params: AdminViewParams): string {
  const { status, token, expiresAt, publicUrl, timeCycle, shopCatalog, slotCoordinates } = params;

  const buffs = status.buffs || {
    effectiveCoinMultiplier: 1.0,
    effectiveGrowthMultiplier: 1.0,
    hasActiveBonus: false,
    witherFrozen: false,
    dailySpecialItemBonus: 0,
    dailyLuckMultiplier: 1.0,
    activeBuffs: [],
  };

  // Extract inventory items with catalog metadata
  const inventoryItems = (status.inventory || []).map((inv: any) => {
    const isCrop = inv.itemId.startsWith('crop_');
    const baseId = isCrop ? inv.itemId.replace('crop_', '') : inv.itemId;
    const plant = PLANTS[baseId];
    const consumable = CONSUMABLES[baseId];
    const decor = DECORATIONS[baseId];
    return {
      itemId: inv.itemId,
      baseId,
      catalogIndex: plant ? plant.index : consumable ? consumable.index : decor ? decor.index : undefined,
      name: plant ? (isCrop ? `${plant.name} (Colhida)` : plant.name) : consumable ? consumable.name : decor ? decor.name : inv.itemId,
      type: isCrop ? 'crop' : plant ? 'seed' : consumable ? 'consumable' : decor ? 'decoration' : 'item',
      quantity: inv.quantity,
      sellPrice: plant ? (isCrop ? Math.round(plant.sellPrice * buffs.effectiveCoinMultiplier) : plant.sellPrice) : decor ? decor.sellPrice : 0,
      growthTimeSeconds: plant?.growthTimeSeconds,
      witherTimeSeconds: plant?.witherTimeSeconds,
      spriteName: plant
        ? (isCrop ? `${plant.spriteBaseName}_ready.png` : `${plant.spriteBaseName}_seed.png`)
        : consumable
        ? `${consumable.spriteName}.png`
        : decor
        ? `${decor.spriteName}.png`
        : '',
      color: consumable?.color,
      description: consumable?.description,
      effect: consumable?.effect,
    };
  });

  const plantCatalogMini: Record<string, { name: string; growthTimeSeconds: number; witherTimeSeconds: number }> = {};
  for (const [k, p] of Object.entries(PLANTS)) {
    plantCatalogMini[k] = {
      name: p.name,
      growthTimeSeconds: p.growthTimeSeconds,
      witherTimeSeconds: p.witherTimeSeconds,
    };
  }

  // Mapa id/key -> spriteName das decorações. Alguns itens têm id diferente do arquivo
  // de sprite (ex.: decor_30_fallen_angel_statues usa decor_18_fallen_angel_statues.png),
  // então o front não pode montar a URL apenas a partir do id.
  const decorSpriteMap: Record<string, string> = {};
  for (const [key, d] of Object.entries(DECORATIONS)) {
    decorSpriteMap[key] = d.spriteName;
    decorSpriteMap[d.id] = d.spriteName;
  }

  const hasActiveBuffs = buffs.hasActiveBonus;
  let bonusParts: string[] = [];
  if (buffs.effectiveGrowthMultiplier !== 1.0) {
    bonusParts.push(`⚡ Cultivo: ${buffs.effectiveGrowthMultiplier}x`);
  }
  if (buffs.effectiveCoinMultiplier !== 1.0) {
    bonusParts.push(`🌱 Petalitas: ${buffs.effectiveCoinMultiplier}x`);
  }
  if (buffs.witherFrozen) {
    bonusParts.push(`❄️ Geada Ativa`);
  }
  if (buffs.dailySpecialItemBonus > 0) {
    bonusParts.push(`🔥 Sorte Sacola: +${Math.round(buffs.dailySpecialItemBonus * 100)}%`);
  }
  if (buffs.dailyLuckMultiplier > 1.0) {
    bonusParts.push(`🌹 Sorte Sacola: ${buffs.dailyLuckMultiplier}x`);
  }
  const buffBannerText = bonusParts.length > 0 ? bonusParts.join('  |  ') : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${t('gameEmoji')} ${t('gameName')} — Painel de Gestão</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🥀</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&family=Metamorphous&family=MedievalSharp&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fira+Code:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    /*
     * Tamanho da fazenda guiado pela altura da viewport: no desktop o canvas
     * (quadrado) deve caber inteiro acima da dobra junto com o cabeçalho,
     * os botões rápidos e o banner de bônus. --chrome-h é a soma dessas
     * alturas + paddings; é reduzido em telas baixas (ex.: HD 1280x720).
     */
    :root {
      --chrome-h: 236px;
      --farm-size: clamp(460px, calc(100dvh - var(--chrome-h)), 900px);
    }
    
    body {
      background: radial-gradient(circle at center, #140d21 0%, #0a0612 60%, #040207 100%);
      color: #dfd7cc;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1rem;
      user-select: none;
    }

    h1, h2, h3, .brand h1, .section-title span, .expired-box h2 {
      font-family: 'Metamorphous', 'Cinzel', serif;
    }

    /* Top Navigation Header */
    .top-header {
      position: relative;
      width: 100%;
      max-width: 1480px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(19, 13, 31, 0.95);
      border: 1px solid #5a3a7d;
      border-radius: 12px;
      padding: 0.85rem 1.5rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
    }
    .top-header .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .top-header .brand h1 {
      font-family: 'Metamorphous', serif;
      font-size: 1.4rem;
      letter-spacing: 1px;
      color: #ffd978;
      text-shadow: 0 0 10px rgba(255, 217, 120, 0.4);
    }
    .top-header .badge-admin {
      background: #4a2175;
      color: #ffea99;
      font-size: 0.75rem;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid #8e44ad;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header-center {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .header-stats {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .stat-pill {
      background: #100a1c;
      border: 1px solid #3d235a;
      padding: 0.4rem 0.85rem;
      border-radius: 20px;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.45rem;
      color: #ffd978;
      font-weight: 600;
    }
    .stat-pill.reset-timer {
      background: rgba(26, 14, 46, 0.95);
      border: 1px solid #7c4dff;
      color: #dfd7cc;
      font-size: 0.9rem;
      letter-spacing: 0.5px;
      box-shadow: 0 0 12px rgba(124, 77, 255, 0.3);
    }
    .stat-pill.reset-timer span {
      color: #ffd978;
      font-weight: bold;
      font-family: 'Fira Code', monospace;
    }
    .stat-pill.timer {
      color: #e07a5f;
      border-color: #7a3a2d;
    }
    .stat-pill.notif-btn {
      font-family: inherit;
      background: #100a1c;
      cursor: pointer;
      user-select: none;
      color: #a894b5;
      border-color: #4a2d6e;
      transition: all 0.2s ease;
    }
    .stat-pill.notif-btn:hover {
      border-color: #ffd978;
      color: #ffd978;
      box-shadow: 0 0 10px rgba(255, 217, 120, 0.3);
    }
    .stat-pill.notif-btn.active {
      border-color: #55f3a0;
      color: #55f3a0;
      box-shadow: 0 0 10px rgba(85, 243, 160, 0.25);
    }
    .stat-pill.save-status {
      font-size: 0.8rem;
      color: #55f3a0;
      border-color: #236841;
      transition: all 0.3s ease;
    }
    .stat-pill.save-status.saving {
      color: #ffbe3b;
      border-color: #8c6312;
      animation: pulse 1s infinite alternate;
    }
    .btn-logout {
      background: rgba(122, 31, 40, 0.85);
      color: #ffccd0;
      border: 1px solid #b52b38;
      padding: 0.4rem 0.85rem;
      border-radius: 20px;
      font-size: 0.82rem;
      font-weight: 700;
      font-family: 'Plus Jakarta Sans', sans-serif;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .btn-logout:hover {
      background: #b52b38;
      color: #ffffff;
      box-shadow: 0 0 12px rgba(181, 43, 56, 0.5);
      transform: translateY(-1px);
    }

    /* Main Dashboard Layout */
    .dashboard {
      display: flex;
      gap: 1.75rem;
      width: 100%;
      max-width: 1480px;
      justify-content: center;
      align-items: flex-start;
    }
    /* Remove a dupla margem (inline margin + gap) acima do canvas */
    .top-actions-bar { margin-bottom: 0; }

    /* Left: Interactive Canvas */
    .canvas-column {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      flex: 0 0 auto;
      width: var(--farm-size);
      max-width: calc(100% - 400px - 1.75rem);
    }
    .farm-canvas-wrapper {
      position: relative;
      width: 100%;
      aspect-ratio: 1 / 1;
      container-type: inline-size;
      background: #08050e url('/farm/bg/farm_bg_${timeCycle}.png') center/cover no-repeat;
      border: 3px solid #6b419c;
      border-radius: 16px;
      box-shadow: 0 0 40px rgba(107, 65, 156, 0.4), 0 20px 40px rgba(0,0,0,0.9);
      overflow: hidden;
      user-select: none;
      touch-action: none;
    }

    /* SVG Forbidden Diamond Overlay */
    .forbidden-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      transition: opacity 0.3s ease;
      opacity: 0.45;
    }
    .forbidden-overlay.hidden {
      opacity: 0;
    }

    /* Slots (Canteiros) */
    .farm-slot {
      position: absolute;
      transform: translate(-50%, -100%);
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .slot-plant-img {
      image-rendering: pixelated;
      pointer-events: none;
    }
    .slot-badge-mini {
      background: rgba(12, 10, 18, 0.94);
      color: #dfd7cc;
      border: 1px solid #4a2e6e;
      /* Escala com o canvas (container query) para não sobrepor em telas pequenas */
      font-size: clamp(9px, 2.1cqw, 11px);
      font-weight: bold;
      padding: 2px clamp(4px, 1cqw, 7px);
      border-radius: 12px;
      margin-bottom: 3px;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.8);
    }
    .slot-badge-mini.seed {
      /* Estilo 9: Ametista / Lilás */
      background: rgba(10, 8, 16, 0.95);
      color: #ffffff;
      border: 1.5px solid #9c88ff;
      box-shadow: 0 0 8px rgba(156, 136, 255, 0.5);
    }
    .slot-badge-mini.growing {
      /* Estilo 3: Minimalista Dourado Suave */
      background: rgba(6, 4, 10, 0.92);
      color: #fceabb;
      border: 1px solid rgba(255, 217, 120, 0.6);
      box-shadow: 0 0 6px rgba(255, 217, 120, 0.3);
    }
    .slot-badge-mini.ready {
      /* Estilo 4: Esmeralda Vibrante */
      background: rgba(12, 10, 18, 0.95);
      color: #55f3a0;
      border: 1.5px solid #55f3a0;
      box-shadow: 0 0 10px rgba(85, 243, 160, 0.6);
    }
    .slot-badge-mini.withered {
      background: #1c102b;
      color: #ff6b6b;
      border: 1.5px solid #a82828;
    }

    .farm-slot.ready {
      pointer-events: auto !important;
      cursor: pointer !important;
      z-index: 95 !important;
      transition: filter 0.2s, transform 0.2s;
    }
    .farm-slot.ready:hover {
      filter: drop-shadow(0 0 16px #55f3a0);
    }
    .farm-slot.ready:active {
      transform: translate(-50%, -100%) scale(0.95);
    }
    .farm-slot.ready .slot-badge-mini.ready {
      animation: pulseGlow 1.2s infinite alternate;
    }
    @keyframes pulseGlow {
      from { box-shadow: 0 0 4px rgba(85, 243, 160, 0.4); }
      to { box-shadow: 0 0 16px rgba(85, 243, 160, 0.9); }
    }

    @keyframes harvestBounce {
      0% {
        transform: translate(-50%, -100%) scale(1);
        opacity: 1;
      }
      35% {
        transform: translate(-50%, -180%) scale(1.22);
        opacity: 1;
      }
      100% {
        transform: translate(-50%, -60%) scale(0.4);
        opacity: 0;
      }
    }
    .farm-slot.harvest-anim {
      animation: harvestBounce 0.45s ease-in forwards !important;
      pointer-events: none !important;
    }

    @keyframes seedSkyDrop {
      0% {
        transform: translate(-50%, -320%) scale(0.3);
        opacity: 0;
      }
      65% {
        transform: translate(-50%, -90%) scale(1.2);
        opacity: 1;
      }
      85% {
        transform: translate(-50%, -105%) scale(0.96);
        opacity: 1;
      }
      100% {
        transform: translate(-50%, -100%) scale(1);
        opacity: 1;
      }
    }
    .farm-slot.seed-drop-anim {
      animation: seedSkyDrop 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) forwards !important;
    }

    .item-card.decor-placed {
      border: 1.5px solid #ffd978 !important;
      background: linear-gradient(145deg, #24190c 0%, #150f22 100%) !important;
      box-shadow: 0 0 12px rgba(255, 217, 120, 0.25);
    }
    .item-card.decor-placed:hover {
      box-shadow: 0 0 16px rgba(255, 217, 120, 0.45);
    }
    .item-card.decor-unplaced {
      border: 1.5px solid #b25aff !important;
      background: linear-gradient(145deg, #1d122e 0%, #100b1a 100%) !important;
      box-shadow: 0 0 8px rgba(178, 90, 255, 0.2);
    }
    .item-card.decor-unplaced:hover {
      box-shadow: 0 0 14px rgba(178, 90, 255, 0.4);
    }

    /* Draggable Decorations */
    .decor-pin {
      position: absolute;
      transform: translate(-50%, -100%);
      cursor: grab;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: filter 0.2s;
      z-index: 50;
    }
    .decor-pin:hover {
      filter: drop-shadow(0 0 14px #ffd978) drop-shadow(0 0 6px #b25aff);
      transform: translate(-50%, -104%) scale(1.05);
    }
    .decor-pin:active {
      cursor: grabbing;
      filter: drop-shadow(0 0 15px #ffd978);
    }
    .decor-pin.forbidden-drop {
      cursor: not-allowed !important;
      filter: drop-shadow(0 0 16px #ff3344) !important;
    }
    .decor-pin img {
      width: 16.11cqw;
      max-width: 165px;
      height: auto;
      max-height: 16.11cqw;
      object-fit: contain;
      image-rendering: pixelated;
      pointer-events: none;
    }
    .decor-pin .decor-label {
      background: rgba(15, 10, 24, 0.95);
      border: 1px solid #ffd978;
      color: #ffd978;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 10px;
      white-space: nowrap;
      margin-bottom: 3px;
      display: flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 3px 8px rgba(0,0,0,0.8);
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
      transform: translateY(4px);
    }
    .decor-pin:hover .decor-label,
    .decor-pin:active .decor-label,
    .decor-pin.is-dragging .decor-label {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateY(0);
    }
    .decor-pin .btn-remove-decor {
      background: #7a1f28;
      color: #fff;
      border: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 10px;
      line-height: 16px;
      text-align: center;
      display: inline-block;
      transition: background 0.2s;
    }
    .decor-pin .btn-remove-decor:hover {
      background: #b52b38;
    }

    /* Right: Management Sidebar */
    .sidebar-column {
      flex: 1 1 0;
      min-width: 380px;
      background: #130d20;
      border: 1px solid #4a2d6e;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      /* Altura inicial aproximada; syncSidebarHeight() iguala à coluna da fazenda */
      height: calc(var(--farm-size) + 120px);
    }

    /* Telas desktop baixas (HD 1280x720, notebooks): cabeçalho e botões mais compactos */
    @media (min-width: 1101px) and (max-height: 860px) {
      :root { --chrome-h: 196px; }
      body { padding: 0.75rem 1rem; }
      .top-header { padding: 0.55rem 1.25rem; margin-bottom: 0.75rem; }
      .top-header .brand h1 { font-size: 1.25rem; }
      .btn-quick { padding: 0.5rem 1rem; }
      .canvas-column { gap: 0.6rem; }
      .farm-buff-banner { padding: 0.45rem 1rem; }
      .tab-btn { padding: 0.75rem 0.5rem; }
    }

    /* Sidebar Tabs */
    .tab-nav {
      display: flex;
      background: #0d0717;
      border-bottom: 2px solid #3d235a;
    }
    .tab-btn {
      flex: 1;
      background: transparent;
      border: none;
      padding: 1rem 0.5rem;
      color: #9f8fb3;
      font-family: 'Cinzel', serif;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      border-bottom: 3px solid transparent;
    }
    .tab-btn:hover {
      color: #e8d8be;
      background: rgba(74, 45, 110, 0.15);
    }
    .tab-btn.active {
      color: #ffd978;
      background: rgba(107, 65, 156, 0.25);
      border-bottom-color: #ffd978;
    }

    /* Tab Content Area */
    .tab-content {
      padding: 1.25rem;
      display: none;
      flex-direction: column;
      gap: 1.25rem;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      max-height: none;
    }
    .tab-content.active {
      display: flex;
    }

    /* Lists and Cards */
    .section-title {
      font-size: 1rem;
      color: #ffd978;
      border-bottom: 1px solid #3d235a;
      padding-bottom: 0.4rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .items-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: 0.85rem;
    }
    .item-card {
      background: #181126;
      border: 1px solid #3d2459;
      border-radius: 8px;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
    }
    .item-card:hover {
      transform: translateY(-2px);
    }
    .item-card.type-seed {
      border: 1.5px solid #287a4c;
      background: linear-gradient(145deg, #131b18 0%, #110d1c 100%);
    }
    .item-card.type-seed:hover {
      border-color: #55f3a0;
      box-shadow: 0 4px 12px rgba(85, 243, 160, 0.15);
    }
    .item-card.type-decor {
      border: 1.5px solid #6b3ba7;
      background: linear-gradient(145deg, #1b1228 0%, #110c1c 100%);
    }
    .item-card.type-decor:hover {
      border-color: #b25aff;
      box-shadow: 0 4px 12px rgba(178, 90, 255, 0.15);
    }
    .item-card.type-consumable {
      border: 1.5px solid #7a3e9d;
      background: linear-gradient(145deg, #1e0f2d 0%, #110c1c 100%);
    }
    .item-card.type-consumable:hover {
      border-color: #b25aff;
      box-shadow: 0 4px 12px rgba(178, 90, 255, 0.25);
    }
    .item-card.owned {
      border-color: #ffd978 !important;
      box-shadow: 0 0 10px rgba(255, 217, 120, 0.2);
    }
    .item-card-owned-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 0.75rem;
      font-weight: bold;
      color: #ffd978;
      background: rgba(15, 10, 24, 0.85);
      border: 1px solid rgba(255, 217, 120, 0.4);
      padding: 3px 6px;
      border-radius: 4px;
      margin-top: 4px;
      text-align: center;
    }
    .shop-category-header {
      grid-column: 1 / -1;
      font-size: 0.95rem;
      font-weight: bold;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
      border-radius: 6px;
      margin-top: 0.5rem;
    }
    .shop-category-header.seeds {
      color: #55f3a0;
      background: rgba(40, 122, 76, 0.2);
      border-left: 4px solid #55f3a0;
    }
    .shop-category-header.decorations {
      color: #dfb2ff;
      background: rgba(107, 59, 167, 0.2);
      border-left: 4px solid #b25aff;
    }
    .item-card-header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .item-thumb {
      width: 48px;
      height: 48px;
      object-fit: contain;
      image-rendering: pixelated;
      background: #090510;
      border-radius: 6px;
      border: 1px solid #331d4a;
      padding: 2px;
    }
    .item-info {
      flex: 1;
      overflow: hidden;
    }
    .item-name {
      font-size: 0.85rem;
      font-weight: bold;
      color: #e8d8be;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item-sub {
      font-size: 0.75rem;
      color: #9f8fb3;
      margin-top: 2px;
    }
    .item-card-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: auto;
    }
    .btn-action {
      background: #542b82;
      color: #fff;
      border: none;
      padding: 0.45rem 0.8rem;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: bold;
      flex: 1;
      text-align: center;
      transition: background 0.2s;
    }
    .btn-action:hover {
      background: #733aa8;
    }
    .btn-action.secondary {
      background: #251838;
      border: 1px solid #5a3682;
    }
    .btn-action.secondary:hover {
      background: #392454;
    }
    .btn-action.sell-all {
      background: #b8860b;
      color: #0b0714;
      font-weight: 900;
    }
    .btn-action.sell-all:hover {
      background: #ffd978;
    }

    /* Itens Indisponíveis da Loja (Item 4) */
    .item-card.shop-item-unavailable {
      filter: grayscale(1) !important;
      opacity: 0.55 !important;
      background: #140f1e !important;
      border-color: #38284d !important;
      cursor: not-allowed !important;
    }
    .item-card.shop-item-unavailable * {
      cursor: not-allowed !important;
    }

    /* Multi Action Container: Mini Header + Botoes 1x, 3x, Nx (Itens 2 e 6) */
    .action-multi-container {
      display: flex;
      flex-direction: column;
      width: 100%;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid #5a3682;
      background: #180f26;
      margin-top: auto;
    }
    .action-multi-container.is-disabled {
      border-color: #38284d;
      opacity: 0.6;
    }
    .action-mini-header {
      background: #542b82;
      color: #fff;
      font-size: 0.78rem;
      font-weight: bold;
      text-align: center;
      padding: 0.35rem 0.5rem;
      user-select: none;
      letter-spacing: 0.3px;
    }
    .action-mini-header.disabled {
      background: #2b1f3d;
      color: #9f8fb3;
    }
    .action-btn-row {
      display: flex;
      width: 100%;
      gap: 1px;
      background: #3d235a;
    }
    .btn-subaction {
      flex: 1;
      background: #251838;
      color: #e8d8be;
      border: none;
      padding: 0.45rem 0.2rem;
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s ease;
    }
    .btn-subaction:hover:not(:disabled) {
      background: #6b389e;
      color: #ffffff;
      box-shadow: inset 0 0 8px rgba(255, 217, 120, 0.3);
    }
    .btn-subaction:active:not(:disabled) {
      background: #8447c2;
    }
    .btn-subaction:disabled {
      background: #171120;
      color: #5d516d;
      cursor: not-allowed;
    }

    /* Botao Adicionar ao Carrinho (Item 7) */
    .btn-add-cart {
      background: transparent;
      border: 1px dashed #7a46ab;
      color: #dfb2ff;
      border-radius: 6px;
      padding: 0.3rem 0.5rem;
      font-family: inherit;
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      text-align: center;
      transition: all 0.2s ease;
      margin-top: 4px;
    }
    .btn-add-cart:hover {
      background: rgba(122, 70, 171, 0.25);
      border-color: #ffd978;
      color: #ffd978;
    }

    /* Barra de Pesquisa da Loja (Item 3) */
    .shop-search-bar {
      margin-top: 0.5rem;
      margin-bottom: 0.65rem;
    }
    .shop-search-bar input {
      width: 100%;
      box-sizing: border-box;
      background: #0d0717;
      border: 1px solid #4a2d6e;
      border-radius: 8px;
      padding: 0.6rem 0.85rem;
      color: #ffd978;
      font-family: inherit;
      font-size: 0.85rem;
      outline: none;
      transition: all 0.2s ease;
    }
    .shop-search-bar input:focus {
      border-color: #ffd978;
      box-shadow: 0 0 10px rgba(255, 217, 120, 0.25);
    }
    .shop-search-bar input::placeholder {
      color: #7b6890;
    }

    /* Container do Carrinho de Compras (Item 7) */
    .cart-container {
      background: linear-gradient(145deg, #181024 0%, #120a1c 100%);
      border: 1.5px solid #6b419c;
      border-radius: 10px;
      padding: 0.85rem;
      margin-bottom: 0.75rem;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }
    .cart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'Cinzel', serif;
      font-size: 0.95rem;
      font-weight: 700;
      color: #ffd978;
      border-bottom: 1px solid #3d235a;
      padding-bottom: 0.4rem;
    }
    .cart-items-list {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .cart-item-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid #332049;
      border-radius: 6px;
      padding: 0.35rem 0.6rem;
      font-size: 0.82rem;
      transition: all 0.2s ease;
    }
    .cart-item-row.is-exhausted {
      opacity: 0.45;
      filter: grayscale(1);
      background: rgba(0, 0, 0, 0.2);
      border-color: #261d33;
    }
    .cart-item-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
      color: #e8d8be;
    }
    .cart-item-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .btn-cart-minus {
      background: #7a1f28;
      color: #fff;
      border: none;
      width: 22px;
      height: 22px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      transition: background 0.15s;
    }
    .btn-cart-minus:hover {
      background: #b52b38;
    }
    .btn-cart-buy {
      background: linear-gradient(135deg, #287a4c 0%, #1e5e39 100%);
      color: #ffffff;
      border: 1px solid #55f3a0;
      border-radius: 8px;
      padding: 0.6rem 1rem;
      font-family: inherit;
      font-size: 0.88rem;
      font-weight: 800;
      cursor: pointer;
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s ease;
      box-shadow: 0 0 10px rgba(85, 243, 160, 0.2);
    }
    .btn-cart-buy:hover:not(:disabled) {
      background: linear-gradient(135deg, #32965e 0%, #257547 100%);
      box-shadow: 0 0 16px rgba(85, 243, 160, 0.4);
    }
    .btn-cart-buy:disabled {
      background: #251d30;
      border-color: #4a3860;
      color: #8c7d9e;
      cursor: not-allowed;
      box-shadow: none;
    }

    /* Toast Notification (Top of canvas-column) */
    .toast {
      /* Fixo na viewport: antes era absoluto no topo da coluna da fazenda e
         ficava fora da tela quando o jogador comprava/vendia rolado na sidebar. */
      position: fixed;
      top: max(1rem, env(safe-area-inset-top));
      left: 50%;
      transform: translateX(-50%) translateY(-25px);
      background: rgba(18, 12, 28, 0.96);
      color: #ffd978;
      border: 1.5px solid #ffd978;
      padding: 0.75rem 1.6rem;
      border-radius: 12px;
      font-size: 0.92rem;
      font-weight: bold;
      box-shadow: 0 0 25px rgba(255, 217, 120, 0.45), 0 10px 30px rgba(0, 0, 0, 0.9);
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
      opacity: 0;
      pointer-events: none;
      z-index: 1200;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      text-align: center;
      max-width: 90%;
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
      pointer-events: auto;
    }
    .toast.error {
      color: #ff6b6b;
      border-color: #ff6b6b;
      box-shadow: 0 0 25px rgba(255, 107, 107, 0.45), 0 10px 30px rgba(0, 0, 0, 0.9);
    }

    .item-desc {
      font-size: 0.78rem;
      color: #bfa980;
      line-height: 1.35;
      margin: 0.35rem 0 0.2rem;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .item-meta-pills {
      display: flex;
      gap: 0.35rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
    }
    .meta-pill {
      font-size: 0.7rem;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(74, 45, 110, 0.45);
      border: 1px solid #6b419c;
      color: #d1c4e9;
      font-family: system-ui, sans-serif;
    }
    .farm-buff-banner {
      width: 100%;
      background: linear-gradient(90deg, rgba(35, 25, 8, 0.95), rgba(70, 52, 16, 0.95), rgba(35, 25, 8, 0.95));
      border: 1.5px solid #d4af37;
      box-shadow: 0 0 15px rgba(212, 175, 55, 0.35), inset 0 0 10px rgba(212, 175, 55, 0.15);
      border-radius: 10px;
      padding: 0.65rem 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      color: #ffea99;
      font-size: 0.88rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-align: center;
      animation: goldenGlow 3s infinite alternate;
    }
    @keyframes goldenGlow {
      from { box-shadow: 0 0 10px rgba(212, 175, 55, 0.25); }
      to { box-shadow: 0 0 22px rgba(212, 175, 55, 0.6); }
    }
    .use-btn {
      background: #7a3e9d;
    }
    .use-btn:hover {
      background: #9d5ec2;
      box-shadow: 0 0 12px rgba(157, 94, 194, 0.5);
    }

    /* Modal / Expired Overlay */
    .expired-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(6, 4, 10, 0.92);
      z-index: 2000;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      text-align: center;
    }
    .expired-box {
      background: #140d21;
      border: 2px solid #ff4466;
      border-radius: 12px;
      padding: 2rem;
      max-width: 480px;
      box-shadow: 0 0 50px rgba(255, 68, 102, 0.4);
    }
    .expired-box h2 {
      color: #ff6b6b;
      margin-bottom: 0.75rem;
    }
    .expired-box p {
      color: #c4b5d0;
      font-size: 0.9rem;
      line-height: 1.5;
    }

    @keyframes pulse {
      0% { opacity: 0.6; transform: scale(0.98); }
      100% { opacity: 1; transform: scale(1.02); }
    }

    /* Quick Action Buttons */
    .quick-actions-bar {
      display: flex;
      gap: 0.75rem;
      width: 100%;
      margin-top: 0.25rem;
    }
    .btn-quick {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      padding: 0.65rem 1rem;
      border-radius: 12px;
      font-size: 0.88rem;
      font-weight: 700;
      font-family: 'Plus Jakarta Sans', sans-serif;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5);
      border: none;
    }
    .btn-quick.harvest-all {
      background: linear-gradient(135deg, #1b4d2e 0%, #2f855a 100%);
      color: #ffffff;
      border: 1px solid #55f3a0;
    }
    .btn-quick.harvest-all:hover:not(:disabled) {
      background: linear-gradient(135deg, #24683e 0%, #38a169 100%);
      box-shadow: 0 0 20px rgba(85, 243, 160, 0.4);
      transform: translateY(-1px);
    }
    .btn-quick.harvest-all:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      filter: grayscale(60%);
    }
    .btn-quick .label-short { display: none; }
    .btn-quick.view-public {
      background: linear-gradient(135deg, #341c5c 0%, #522791 100%);
      color: #ffea99;
      border: 1px solid #a855f7;
    }
    .btn-quick.view-public:hover {
      background: linear-gradient(135deg, #442578 0%, #6934b8 100%);
      box-shadow: 0 0 20px rgba(168, 85, 247, 0.4);
      transform: translateY(-1px);
    }

    @media (max-width: 1100px) {
      .top-header {
        flex-wrap: wrap;
        gap: 0.75rem;
        justify-content: center;
      }
      .header-center {
        position: static;
        transform: none;
        order: 3;
        width: 100%;
      }
      .dashboard {
        flex-direction: column;
        align-items: center;
      }
      .canvas-column, .sidebar-column {
        max-width: 100%;
        width: 100%;
        min-width: 0;
      }
      .sidebar-column {
        height: auto !important;
        max-height: none !important;
        min-height: auto;
        /* clip (e não hidden) preserva as bordas arredondadas sem criar um
           contêiner de rolagem, permitindo que as abas fiquem "sticky". */
        overflow: clip;
      }
      /* Sem rolagem aninhada no mobile/tablet: a lista rola com a página e as
         abas ficam presas no topo, sempre ao alcance do polegar. */
      .tab-content {
        max-height: none;
        overflow: visible;
      }
      .tab-nav {
        position: sticky;
        top: 0;
        z-index: 40;
        box-shadow: 0 6px 12px rgba(0, 0, 0, 0.55);
      }
    }

    @media (max-width: 600px) {
      body {
        padding: 0.5rem;
      }
      .top-header {
        padding: 0.6rem 0.75rem;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
      }
      .top-header .brand h1 {
        font-size: 1.15rem;
      }
      .header-stats {
        gap: 0.35rem;
        flex-wrap: wrap;
        justify-content: center;
      }
      .stat-pill {
        padding: 0.3rem 0.6rem;
        font-size: 0.78rem;
      }
      .btn-logout {
        padding: 0.3rem 0.65rem;
        font-size: 0.78rem;
      }
      .quick-actions-bar {
        gap: 0.5rem;
      }
      .btn-quick {
        padding: 0.55rem 0.7rem;
        font-size: 0.8rem;
      }
      .items-grid {
        grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)) !important;
        gap: 0.5rem !important;
      }
      .top-header .brand h1 {
        line-height: 1.2;
      }
      /* Cards estreitos: nome do item quebra em até 3 linhas em vez de virar "Erva…" */
      .item-name {
        white-space: normal;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        line-height: 1.25;
      }
      .item-thumb {
        width: 40px;
        height: 40px;
      }
      .item-card-header {
        align-items: flex-start;
      }
      .section-title {
        flex-wrap: wrap;
        gap: 0.15rem 0.5rem;
      }
      .item-card {
        padding: 0.6rem !important;
      }
      .item-card h4 {
        font-size: 0.82rem !important;
      }
      .tab-btn {
        padding: 0.65rem 0.5rem !important;
        font-size: 0.82rem !important;
      }
      .section-title {
        font-size: 0.92rem !important;
      }
    }

    /*
     * Mobile em paisagem (ex.: iPhone 844x390): antes o cabeçalho + botões
     * ocupavam toda a altura visível e o canvas de ~700px exigia rolar várias
     * telas. Agora: duas colunas, fazenda "sticky" do tamanho da altura útil
     * à esquerda e a sidebar rolando com a página à direita.
     */
    @media (max-width: 1100px) and (orientation: landscape) and (max-height: 560px) {
      :root {
        --landscape-actions-h: 34px;
        --landscape-banner-h: 28px;
        --farm-size: min(calc(100dvh - 0.8rem - var(--landscape-actions-h) - var(--landscape-banner-h) - 0.8rem), 56vw);
      }
      /* Sem bônus ativo o banner some e a fazenda ganha essa altura */
      :root:has(#farm-buff-banner[style*="none"]) {
        --farm-size: min(calc(100dvh - 0.8rem - var(--landscape-actions-h) - 0.4rem), 56vw);
      }
      /* Grid na página: fazenda ocupa a coluna esquerda inteira (altura total)
         e o cabeçalho vai para o topo da coluna direita, acima da sidebar. */
      body {
        display: grid;
        grid-template-columns: var(--farm-size) minmax(0, 1fr);
        column-gap: 0.6rem;
        align-items: start;
        padding: 0.4rem 0.6rem;
      }
      .dashboard { display: contents; }
      .top-header {
        grid-column: 2;
        grid-row: 1;
        width: auto;
        max-width: none;
        flex-wrap: nowrap;
        padding: 0.3rem 0.6rem;
        margin-bottom: 0.4rem;
        gap: 0.5rem;
      }
      .btn-quick .label-long { display: none; }
      .btn-quick .label-short { display: inline; }
      .top-header .brand { min-width: 0; gap: 0.35rem; }
      .top-header .brand h1 {
        font-size: 1rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .top-header .badge-admin, #notif-label { display: none; }
      .header-stats { flex-wrap: nowrap; gap: 0.35rem; flex-shrink: 0; }
      .stat-pill, .btn-logout { padding: 0.25rem 0.55rem; font-size: 0.75rem; }
      .canvas-column {
        grid-column: 1;
        grid-row: 1 / span 2;
        position: sticky;
        top: 0.4rem;
        flex: 0 0 auto;
        width: var(--farm-size);
        max-width: var(--farm-size);
        gap: 0.4rem;
      }
      .quick-actions-bar { gap: 0.4rem; margin-top: 0; }
      .btn-quick {
        height: var(--landscape-actions-h);
        padding: 0 0.4rem;
        font-size: 0.7rem;
        border-radius: 8px;
        white-space: nowrap;
        overflow: hidden;
      }
      .farm-buff-banner {
        height: var(--landscape-banner-h);
        padding: 0 0.5rem;
        font-size: 0.7rem;
        border-radius: 8px;
        white-space: nowrap;
        overflow: hidden;
      }
      .sidebar-column {
        grid-column: 2;
        grid-row: 2;
        width: auto;
        min-width: 0;
      }
      .tab-nav { top: 0; }
      .tab-btn { padding: 0.5rem 0.25rem !important; font-size: 0.78rem !important; }
      .tab-content { padding: 0.75rem; }
      .items-grid {
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important;
        gap: 0.5rem !important;
      }
      .item-name {
        white-space: normal;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        line-height: 1.25;
      }
    }

    /* Alvos de toque mínimos em telas sensíveis ao toque (~40px) */
    @media (pointer: coarse) {
      .btn-subaction { min-height: 40px; }
      .btn-action, .btn-add-cart { min-height: 38px; }
      .tab-btn { min-height: 44px; }
      .btn-cart-minus { width: 32px; height: 32px; }
      .decor-pin .btn-remove-decor { width: 24px; height: 24px; line-height: 24px; font-size: 13px; }
      .stat-pill.notif-btn, .btn-logout { min-height: 34px; }
      #btn-edit-farm-name { min-width: 36px; min-height: 36px; }
    }
    /* Acessibilidade: foco visível para navegação por teclado */
    :focus-visible {
      outline: 2px solid #ffd978;
      outline-offset: 2px;
    }
    /* Respeita a preferência do sistema por menos movimento */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  </style>
</head>
<body>
  <!-- Top Navigation Header -->
  <header class="top-header">
    <div class="brand">
      <h1>${t('gameEmoji')} ${t('gameName')}<span id="header-farm-name">${status.farmName ? ` - ${escapeHtml(status.farmName)}` : ''}</span></h1>
      <button class="btn-edit-farm-name" id="btn-edit-farm-name" onclick="openFarmNameModal()" title="Editar nome do jardim" aria-label="Editar nome do jardim" style="background:transparent; border:none; cursor:pointer; font-size:1.1rem; margin-left:6px;">✏️</button>
      <span class="badge-admin">Admin</span>
    </div>
    <div class="header-stats">
      <div class="stat-pill" title="Petalitas">
        🌱 <span id="val-coins">${status.coins.toLocaleString('pt-BR')}</span> Ptl
      </div>
      <div class="stat-pill save-status" id="val-save-status" style="display:none;" title="Status de salvamento">
        ● Salvo
      </div>
      <button type="button" class="stat-pill notif-btn" id="btn-toggle-notifs" onclick="toggleNotifs()" title="Notificações do Jardim" aria-label="Ativar ou desativar alertas do jardim">
        <span id="notif-icon">🔔</span> <span id="notif-label">Alertas</span>
      </button>
      <button type="button" class="btn-logout" id="btn-logout" onclick="logoutFarm()" title="Sair da sessão administrativa">
        🚪 Sair
      </button>
    </div>
  </header>

  <!-- Main Dashboard -->
  <main class="dashboard">
    <!-- Left: Farm Visual Canvas -->
    <div class="canvas-column">
      <!-- Toast Notification (Top of canvas-column) -->
      <div class="toast" id="toast"></div>

      <!-- Quick Action Buttons on TOP of Canvas -->
      <div class="quick-actions-bar top-actions-bar">
        <button class="btn-quick harvest-all" id="btn-harvest-all" onclick="harvestAllFromCanvas()" title="Colhe todos os canteiros prontos de uma só vez">
          <span>🌾 Colher Tudo (<span id="ready-slots-count">0</span>)</span>
        </button>
        <a class="btn-quick view-public" id="btn-view-public" href="/farm?id=${status.uuid}&public=1" target="_blank" title="Ver como as outras pessoas vêem o seu jardim">
          👁️ <span class="label-long">Ver Meu Jardim Público</span><span class="label-short">Ver Público</span>
        </a>
      </div>

      <div class="farm-canvas-wrapper" id="farm-canvas">
        <!-- SVG Forbidden Plantation Polygon Overlay -->
        <svg class="forbidden-overlay" id="forbidden-overlay" viewBox="0 0 1024 1024">
          <polygon points="512,260 992,530 512,800 32,530" fill="rgba(255, 50, 80, 0.16)" stroke="rgba(255, 70, 90, 0.7)" stroke-dasharray="8,8" stroke-width="3" />
        </svg>

        <!-- 9 Plantation Slots Layer -->
        <div id="slots-layer"></div>

        <!-- Placed Decorations Layer -->
        <div id="decorations-layer"></div>
      </div>

      <!-- Farm Multiplier / Buff Status Banner (Only visible if not 1x) -->
      <div class="farm-buff-banner" id="farm-buff-banner" style="display: ${hasActiveBuffs ? 'flex' : 'none'};">
        ${buffBannerText}
      </div>
    </div>

    <!-- Right: Management Sidebar Tabs -->
    <div class="sidebar-column">
      <nav class="tab-nav">
        <button class="tab-btn active" data-tab="tab-inventory">🎒 Inventário</button>
        <button class="tab-btn" data-tab="tab-shop">🏪 Loja</button>
        <button class="tab-btn" data-tab="tab-sell">🌾 Vender</button>
      </nav>

      <!-- Tab 1: Inventário -->
      <div class="tab-content active" id="tab-inventory">
        <div>
          <h3 class="section-title">
            <span>🌱 Sementes Disponíveis</span>
            <small style="font-size:0.75rem; color:#55f3a0;">Clique em Plantar para semear</small>
          </h3>
          <div class="items-grid" id="inventory-seeds-list" style="margin-top:0.75rem;"></div>
        </div>

        <div>
          <h3 class="section-title">
            <span>⚗️ Consumíveis & Elixires</span>
            <small style="font-size:0.75rem; color:#dfb2ff;">Efeitos e bônus imediatos</small>
          </h3>
          <div class="items-grid" id="inventory-consumables-list" style="margin-top:0.75rem;"></div>
        </div>

        <div>
          <h3 class="section-title">
            <span>🏛️ Enfeites e Decorações</span>
            <small style="font-size:0.75rem; color:#ffd978;">Terreno: <span id="placed-decors-count">${status.decorations?.length || 0}</span>/10</small>
          </h3>
          <div class="items-grid" id="all-decors-list" style="margin-top:0.75rem;"></div>
        </div>
      </div>

      <!-- Tab 2: Loja -->
      <div class="tab-content" id="tab-shop">
        <h3 class="section-title">
          <span>🏪 Mercado do Covil</span>
          <small style="font-size:0.75rem; color:#55f3a0;">Saldo: <span id="shop-coins-sub">${status.coins.toLocaleString('pt-BR')}</span> Ptl</small>
        </h3>
        <!-- Barra de Pesquisa Greedy (Item 3) -->
        <div class="shop-search-bar">
          <input type="search" id="shop-search-input" aria-label="Filtrar itens da loja" placeholder="🔍 Filtrar loja por nome, efeito, descrição, id..." oninput="handleShopSearch()" autocomplete="off" />
        </div>
        <!-- Carrinho de Compras (Item 7) -->
        <div class="cart-container" id="shop-cart-container" style="display:none;"></div>
        <!-- Grid de Itens da Loja -->
        <div class="items-grid" id="shop-items-list"></div>
      </div>

      <!-- Tab 3: Vender -->
      <div class="tab-content" id="tab-sell">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3 class="section-title" style="border:none; padding:0;">🌾 Colheitas Prontas para Venda</h3>
          <button class="btn-action sell-all" id="btn-sell-all" style="flex:none; padding:0.45rem 1rem;">🌱 Vender Todas as Colheitas</button>
        </div>
        <div class="items-grid" id="sell-items-list" style="margin-top:0.75rem;"></div>
      </div>
    </div>
  </main>

  <!-- Session Expired Modal -->
  <div class="expired-overlay" id="expired-modal">
    <div class="expired-box">
      <h2>⏳ Sessão Administrativa Expirada</h2>
      <p>A sua sessão administrativa de 3 dias expirou por segurança.<br><br>Para continuar administrando sua fazenda, envie o comando <strong>!fazenda</strong> no bot do Telegram/WhatsApp para renovar seu acesso!</p>
    </div>
  </div>

  <!-- Farm Name Modal -->
  <div class="expired-overlay" id="farm-name-modal" style="display:none; align-items:center; justify-content:center;">
    <div class="expired-box" style="max-width:380px; text-align:left;">
      <h2 style="font-size:1.2rem; color:#dfb2ff; margin-bottom:8px;">👑 Nome do Santuário</h2>
      <p style="font-size:0.85rem; color:#bbaacc; margin-bottom:12px;">Defina um nome para seu jardim (máximo 20 caracteres):</p>
      <input type="text" id="input-farm-name" maxlength="20" placeholder="Ex: Cripta do Luar" style="width:100%; box-sizing:border-box; background:#0c0814; border:1px solid #7038a8; border-radius:6px; padding:10px; color:#fff; font-size:14px; margin-bottom:14px;" />
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button type="button" onclick="closeFarmNameModal()" style="background:#261d33; border:1px solid #4a3860; color:#ccc; padding:8px 14px; border-radius:6px; cursor:pointer;">Cancelar</button>
        <button type="button" onclick="saveFarmName()" style="background:#7038a8; border:none; color:#fff; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:bold;">Salvar</button>
      </div>
    </div>
  </div>

  <script>
    // State initialization
    const ADMIN_TOKEN = ${JSON.stringify(token)};
    const USER_ID = ${JSON.stringify(status.playerId)};
    const FARM_UUID = ${JSON.stringify(status.uuid)};
    const EXPIRES_AT = ${expiresAt};
    let FARM_NAME = ${JSON.stringify(status.farmName || '')};

    function openFarmNameModal() {
      const modal = document.getElementById('farm-name-modal');
      const input = document.getElementById('input-farm-name');
      if (input) input.value = FARM_NAME || '';
      if (modal) modal.style.display = 'flex';
      if (input) setTimeout(() => input.focus(), 50);
    }

    function closeFarmNameModal() {
      const modal = document.getElementById('farm-name-modal');
      if (modal) modal.style.display = 'none';
    }

    async function saveFarmName() {
      const input = document.getElementById('input-farm-name');
      const name = input ? input.value.trim() : '';
      try {
        const res = await fetch('/farm/' + USER_ID + '/name', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ADMIN_TOKEN,
          },
          body: JSON.stringify({ farmName: name || null }),
        });
        const data = await res.json();
        if (res.ok) {
          FARM_NAME = data.farmName || '';
          const nameEl = document.getElementById('header-farm-name');
          if (nameEl) nameEl.innerText = FARM_NAME ? ' - ' + FARM_NAME : '';
          closeFarmNameModal();
          showToast('👑 Nome do jardim atualizado com sucesso!');
        } else {
          showToast(data.message || 'Falha ao atualizar nome.', true);
        }
      } catch (err) {
        showToast('Erro de comunicação.', true);
      }
    }

    // Persistência automática de sessão por até 3 dias (renovável a cada acesso)
    try {
      localStorage.setItem('jds_admin_session', JSON.stringify({
        token: ADMIN_TOKEN,
        farmUuid: FARM_UUID,
        playerId: USER_ID,
        expiresAt: EXPIRES_AT,
      }));
    } catch (e) {}

    // Registro do Service Worker para suporte a notificações push e em segundo plano
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW registration:', e));
    }

    // Logout da fazenda
    function logoutFarm() {
      try {
        localStorage.removeItem('jds_admin_session');
        document.cookie = 'jds_admin_token=; Path=/; Max-Age=0; SameSite=Lax';
      } catch (e) {}
      window.location.href = '/farm?id=' + encodeURIComponent(FARM_UUID) + '&public=1';
    }

    // Notificações do Navegador
    function isNotifsEnabled() {
      return localStorage.getItem('jds_notifs_enabled') === 'true';
    }

    function updateNotifButtonUI() {
      const btn = document.getElementById('btn-toggle-notifs');
      const icon = document.getElementById('notif-icon');
      const label = document.getElementById('notif-label');
      if (!btn) return;

      if (!('Notification' in window)) {
        btn.style.display = 'none';
        return;
      }

      if (Notification.permission === 'granted' && isNotifsEnabled()) {
        btn.classList.add('active');
        if (icon) icon.innerText = '🔔';
        if (label) label.innerText = 'Alertas On';
        btn.title = 'Notificações ativadas! Clique para desativar.';
      } else {
        btn.classList.remove('active');
        if (icon) icon.innerText = '🔕';
        if (label) label.innerText = 'Alertas Off';
        btn.title = 'Clique para ativar notificações no navegador.';
      }
    }

    async function toggleNotifs() {
      if (!('Notification' in window)) {
        showToast('Seu navegador não suporta notificações.', true);
        return;
      }

      if (Notification.permission === 'denied') {
        showToast('Notificações bloqueadas nas configurações do seu navegador.', true);
        return;
      }

      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          localStorage.setItem('jds_notifs_enabled', 'true');
          showToast('🔔 Notificações ativadas com sucesso!');
          sendLocalAlert('🥀 Jardim das Sombras', 'Notificações ativadas! Você será avisado quando suas colheitas ficarem prontas ou morrerem.');
        } else {
          localStorage.setItem('jds_notifs_enabled', 'false');
          showToast('Permissão de notificação não concedida.', true);
        }
      } else if (Notification.permission === 'granted') {
        const currentlyOn = isNotifsEnabled();
        localStorage.setItem('jds_notifs_enabled', (!currentlyOn).toString());
        showToast(!currentlyOn ? '🔔 Notificações ativadas!' : '🔕 Notificações desativadas.');
      }
      updateNotifButtonUI();
    }

    function sendLocalAlert(title, body, tag = 'jds-alert') {
      if (!('Notification' in window) || Notification.permission !== 'granted' || !isNotifsEnabled()) return;
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(title, {
              body,
              icon: '/favicon.svg',
              badge: '/favicon.svg',
              tag,
              renotify: true,
              data: { url: window.location.href },
            });
          });
        } else {
          new Notification(title, {
            body,
            icon: '/favicon.svg',
            tag,
          });
        }
      } catch (e) {
        console.warn('Erro ao disparar notificação:', e);
      }
    }

    // Higieniza URL da barra de endereço removendo token/auth para segurança e privacidade
    if (window.history && window.history.replaceState) {
      try {
        const cleanUrl = new URL(window.location.href);
        if (cleanUrl.searchParams.has('token') || cleanUrl.searchParams.has('auth')) {
          cleanUrl.searchParams.delete('token');
          cleanUrl.searchParams.delete('auth');
          window.history.replaceState({}, document.title, cleanUrl.toString());
        }
      } catch (e) {}
    }
    const SLOT_COORDS = ${JSON.stringify(slotCoordinates)};
    const PLANTS_INFO = ${JSON.stringify(plantCatalogMini)};
    const DECOR_SPRITES = ${JSON.stringify(decorSpriteMap)};
    function decorSpriteUrl(decorId) {
      return '/farm/sprites/decorations/' + (DECOR_SPRITES[decorId] || decorId) + '.png';
    }

    let currentCoins = ${status.coins};
    let currentSlots = ${JSON.stringify(status.slots)};
    let placedDecorations = ${JSON.stringify(status.decorations || [])};
    let inventoryItems = ${JSON.stringify(inventoryItems)};
    let shopCatalog = ${JSON.stringify(shopCatalog)};

    let activeDrag = null;
    let autoSaveTimeout = null;
    let isSaving = false;

    // Daily reset timer calculation (03:00 BRT = 06:00 UTC)
    function getNextResetMs() {
      const now = new Date();
      const nextReset = new Date(now);
      if (now.getUTCHours() >= 6) {
        nextReset.setUTCDate(nextReset.getUTCDate() + 1);
      }
      nextReset.setUTCHours(6, 0, 0, 0);
      return Math.max(0, nextReset.getTime() - now.getTime());
    }

    function formatResetCountdown() {
      const totalSeconds = Math.floor(getNextResetMs() / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      return (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
    }

    function updateResetCountdown() {
      const el = document.getElementById('reset-time-val');
      if (el) {
        el.innerText = formatResetCountdown();
      }
    }

    // Toast helper
    function showToast(msg, isError = false) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.className = 'toast show' + (isError ? ' error' : '');
      setTimeout(() => {
        toast.className = 'toast';
      }, 3500);
    }

    // Plantation Area Geometry Check
    // Center (512, 530), rx=480, ry=270
    function isInsidePlantation(x, y) {
      const cx = 512;
      const cy = 530;
      const rx = 480;
      const ry = 270;
      const dist = Math.abs(x - cx) / rx + Math.abs(y - cy) / ry;
      return dist <= 1.0;
    }

    function formatConciseTime(totalSeconds) {
      if (!totalSeconds || totalSeconds <= 0) return '0s';
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (hours > 0) return hours + 'h' + (minutes > 0 ? minutes + 'm' : '');
      if (minutes > 0) return minutes + 'm';
      return seconds + 's';
    }

    // 1. Render Farm Slots (Plants)
    function renderSlots() {
      const container = document.getElementById('slots-layer');
      container.innerHTML = '';

      for (const slot of currentSlots) {
        if (slot.stage === 'empty' || !slot.plantId) continue;
        const coord = SLOT_COORDS[slot.slotIndex];
        if (!coord) continue;

        // 50% scale reduction requested:
        // Ready: 210, Growing/Withered: 160, Seed: 100
        const maxDim = (slot.stage === 'ready')
          ? (210 * coord.scale)
          : ((slot.stage === 'growing' || slot.stage === 'withered') ? (160 * coord.scale) : (100 * coord.scale));

        const isReady = slot.stage === 'ready';
        const isDropAnim = !!slot.isNewlyPlanted;
        delete slot.isNewlyPlanted;

        const el = document.createElement('div');
        el.className = 'farm-slot' + (isReady ? ' ready' : '') + (isDropAnim ? ' seed-drop-anim' : '');
        el.id = 'farm-slot-' + slot.slotIndex;
        el.style.left = (coord.x / 1024 * 100) + '%';
        el.style.top = ((coord.y + 15) / 1024 * 100) + '%';
        el.style.transform = 'translate(-50%, -100%)';
        el.style.zIndex = coord.zIndex * 10;

        if (isReady) {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            harvestSlotFromCanvas(slot.slotIndex);
          });
        }

        const pInfo = PLANTS_INFO[slot.plantId];
        const plantName = pInfo ? pInfo.name : 'Planta';
        const baseWitherStr = pInfo ? formatConciseTime(pInfo.witherTimeSeconds) : '';

        let badgeClass = 'slot-badge-mini';
        let badgeText = '[' + slot.slotIndex + '] ☘ Em cultivo';

        if (slot.stage === 'ready') {
          badgeClass += ' ready';
          const witherStr = slot.remainingSecondsToWither ? ' (' + formatConciseTime(slot.remainingSecondsToWither) + ')' : '';
          badgeText = '[' + slot.slotIndex + '] ✦ Colher!' + witherStr;
          el.title = '[' + slot.slotIndex + '] ' + plantName + ' pronta para colher! Tempo até a morte: ' + (slot.remainingSecondsToWither ? formatConciseTime(slot.remainingSecondsToWither) : baseWitherStr) + ' (Clique para colher!)';
        } else if (slot.stage === 'seed') {
          badgeClass += ' seed';
          const timeStr = slot.remainingSecondsToHarvest ? formatConciseTime(slot.remainingSecondsToHarvest) : '';
          badgeText = '[' + slot.slotIndex + '] ☘ ' + (timeStr ? timeStr : 'Semente');
          el.title = '[' + slot.slotIndex + '] ' + plantName + ' (Semente) - ' + (timeStr ? 'Faltam ' + timeStr + ' para colheita' : 'Recém-plantada') + (baseWitherStr ? ' | Tempo de morte: ' + baseWitherStr : '');
        } else if (slot.stage === 'growing') {
          badgeClass += ' growing';
          const timeStr = slot.remainingSecondsToHarvest ? formatConciseTime(slot.remainingSecondsToHarvest) : '';
          badgeText = '[' + slot.slotIndex + '] ☘ ' + (timeStr ? timeStr : 'Crescendo');
          el.title = '[' + slot.slotIndex + '] ' + plantName + ' (Em cultivo) - ' + (timeStr ? 'Faltam ' + timeStr + ' para colheita' : '') + (baseWitherStr ? ' | Tempo de morte: ' + baseWitherStr : '');
        } else if (slot.stage === 'withered') {
          badgeClass += ' withered';
          badgeText = '[' + slot.slotIndex + '] 💀 Livre (Morta)';
          el.title = '[' + slot.slotIndex + '] ' + plantName + ' apodreceu e morreu. Canteiro livre para novo cultivo.';
        }

        // Scale proportionally to canvas size (1024px reference base)
        const plantPct = (maxDim / 1024 * 100);
        const spriteName = slot.stage === 'withered' ? (slot.plantId + '_growing.png') : (slot.plantId + '_' + slot.stage + '.png');
        const imgStyle = 'width:' + plantPct + 'cqw; max-width:' + maxDim + 'px; height:auto; object-fit:contain;' + (slot.stage === 'withered' ? ' filter:grayscale(100%); opacity:0.35;' : '');
        const imgHtml = '<img class="slot-plant-img" src="/farm/sprites/plants/' + spriteName + '" style="' + imgStyle + '" />';

        el.innerHTML = '<span class="' + badgeClass + '" id="slot-badge-' + slot.slotIndex + '">' + badgeText + '</span>' + imgHtml;
        container.appendChild(el);
      }
      updateHarvestAllButton();
    }

    function updateHarvestAllButton() {
      const readySlots = currentSlots.filter(s => s.stage === 'ready' && s.plantId);
      const countEl = document.getElementById('ready-slots-count');
      const btn = document.getElementById('btn-harvest-all');
      if (countEl) countEl.innerText = readySlots.length;
      if (btn) btn.disabled = readySlots.length === 0;
    }

    async function harvestAllFromCanvas() {
      const readySlots = currentSlots.filter(s => s.stage === 'ready' && s.plantId);
      if (readySlots.length === 0) {
        showToast('Nenhum canteiro pronto para colheita no momento!', true);
        return;
      }

      readySlots.forEach(s => {
        const pin = document.getElementById('farm-slot-' + s.slotIndex);
        if (pin) pin.classList.add('harvest-anim');
      });

      const btn = document.getElementById('btn-harvest-all');
      if (btn) btn.disabled = true;

      try {
        const res = await fetch('/farm/' + USER_ID + '/harvest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ADMIN_TOKEN,
          },
          body: JSON.stringify({ all: true }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Falha ao colher tudo');

        if (data.totalCoinsEarned) {
          currentCoins += data.totalCoinsEarned;
          updateCoinsDisplay();
        }

        readySlots.forEach(s => {
          s.stage = 'empty';
          s.plantId = null;
        });

        if (data.harvested && Array.isArray(data.harvested)) {
          data.harvested.forEach(h => {
            const cropId = 'crop_' + h.plantId;
            const existing = inventoryItems.find(i => i.itemId === cropId);
            if (existing) {
              existing.quantity += h.count;
            } else {
              inventoryItems.push({
                itemId: cropId,
                baseId: h.plantId,
                name: h.plantName + ' (Colhida)',
                type: 'crop',
                quantity: h.count,
                sellPrice: Math.round(h.coinsEarned / h.count) || 25,
              });
            }
          });
        }

        setTimeout(() => {
          renderSlots();
          renderInventoryTab();
          renderSell();
        }, 380);

        const earnedStr = data.totalCoinsEarned ? ' (+' + data.totalCoinsEarned.toLocaleString('pt-BR') + ' Ptl)' : '';
        showToast('🌾 Colheita completa realizada!' + earnedStr);
      } catch (err) {
        readySlots.forEach(s => {
          const pin = document.getElementById('farm-slot-' + s.slotIndex);
          if (pin) pin.classList.remove('harvest-anim');
        });
        showToast(err.message, true);
        if (btn) btn.disabled = false;
      }
    }

    async function harvestSlotFromCanvas(slotIndex) {
      const pin = document.getElementById('farm-slot-' + slotIndex);
      if (pin) pin.classList.add('harvest-anim');

      try {
        const res = await fetch('/farm/' + USER_ID + '/harvest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ADMIN_TOKEN,
          },
          body: JSON.stringify({ slot: slotIndex }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Falha ao colher');

        if (data.totalCoinsEarned) {
          currentCoins += data.totalCoinsEarned;
          updateCoinsDisplay();
        }

        const sl = currentSlots.find(s => s.slotIndex === slotIndex);
        if (sl) {
          sl.stage = 'empty';
          sl.plantId = null;
        }

        if (data.harvested && Array.isArray(data.harvested)) {
          data.harvested.forEach(h => {
            const cropId = 'crop_' + h.plantId;
            const existing = inventoryItems.find(i => i.itemId === cropId);
            if (existing) {
              existing.quantity += h.count;
            } else {
              inventoryItems.push({
                itemId: cropId,
                baseId: h.plantId,
                name: h.plantName + ' (Colhida)',
                type: 'crop',
                quantity: h.count,
                sellPrice: Math.round(h.coinsEarned / h.count) || 25,
              });
            }
          });
        }

        setTimeout(() => {
          renderSlots();
          renderInventoryTab();
          renderSell();
        }, 380);

        const earnedStr = data.totalCoinsEarned ? ' (+' + data.totalCoinsEarned.toLocaleString('pt-BR') + ' Ptl)' : '';
        showToast('🌾 ' + (data.harvested?.[0]?.plantName || 'Planta') + ' colhida!' + earnedStr);
      } catch (err) {
        if (pin) pin.classList.remove('harvest-anim');
        showToast(err.message, true);
      }
    }

    // 2. Render Placed Decorations on Canvas
    function renderDecorations() {
      const container = document.getElementById('decorations-layer');
      container.innerHTML = '';

      placedDecorations.forEach((decor, idx) => {
        let x = decor.x != null ? decor.x : 220;
        let y = decor.y != null ? decor.y : 310;

        const pin = document.createElement('div');
        pin.className = 'decor-pin';
        pin.id = 'decor-pin-' + decor.slotIndex;
        pin.style.left = (x / 1024 * 100) + '%';
        pin.style.top = (y / 1024 * 100) + '%';
        pin.style.zIndex = y < 570 ? 20 : 80;

        pin.innerHTML = \`
          <div class="decor-label">
            <span>\${decor.name}</span>
            <button class="btn-remove-decor" data-slot="\${decor.slotIndex}" title="Guardar na mochila">×</button>
          </div>
          <img src="\${decorSpriteUrl(decor.decorId)}" />
        \`;

        // Start drag listeners
        pin.addEventListener('mousedown', (e) => {
          if (e.target.classList.contains('btn-remove-decor')) return;
          startDrag(decor.slotIndex, e.clientX, e.clientY);
          e.preventDefault();
        });

        pin.addEventListener('touchstart', (e) => {
          if (e.target.classList.contains('btn-remove-decor')) return;
          const touch = e.touches[0];
          startDrag(decor.slotIndex, touch.clientX, touch.clientY);
        }, { passive: false });

        pin.querySelector('.btn-remove-decor').addEventListener('click', (e) => {
          e.stopPropagation();
          unequipDecoration(decor.slotIndex);
        });

        container.appendChild(pin);
      });

      renderDecorsList();
    }

    // 3. Drag and Drop Engine
    function startDrag(slotIndex, clientX, clientY) {
      const decor = placedDecorations.find(d => d.slotIndex === slotIndex);
      if (!decor) return;

      const canvasRect = document.getElementById('farm-canvas').getBoundingClientRect();
      const currentX = decor.x != null ? decor.x : 220;
      const currentY = decor.y != null ? decor.y : 310;

      activeDrag = {
        slotIndex,
        startX: currentX,
        startY: currentY,
        currentX,
        currentY,
        canvasRect,
      };

      const pin = document.getElementById('decor-pin-' + slotIndex);
      if (pin) {
        pin.style.zIndex = 100;
        pin.classList.add('is-dragging');
      }
    }

    function moveDrag(clientX, clientY) {
      if (!activeDrag) return;

      const rect = activeDrag.canvasRect;
      let normX = Math.round(((clientX - rect.left) / rect.width) * 1024);
      let normY = Math.round(((clientY - rect.top) / rect.height) * 1024);

      normX = Math.max(30, Math.min(994, normX));
      normY = Math.max(30, Math.min(994, normY));

      activeDrag.currentX = normX;
      activeDrag.currentY = normY;

      const pin = document.getElementById('decor-pin-' + activeDrag.slotIndex);
      if (pin) {
        pin.style.left = (normX / 1024 * 100) + '%';
        pin.style.top = (normY / 1024 * 100) + '%';

        const insideForbidden = isInsidePlantation(normX, normY);
        if (insideForbidden) {
          pin.classList.add('forbidden-drop');
        } else {
          pin.classList.remove('forbidden-drop');
        }
      }
    }

    function endDrag() {
      if (!activeDrag) return;
      const drag = activeDrag;
      activeDrag = null; // Libera imediatamente para nunca travar o mouse

      const pin = document.getElementById('decor-pin-' + drag.slotIndex);
      const decor = placedDecorations.find(d => d.slotIndex === drag.slotIndex);

      if (pin) {
        pin.classList.remove('forbidden-drop');
        pin.classList.remove('is-dragging');
        pin.style.zIndex = (drag.currentY < 570 ? 20 : 80);
      }

      try {
        const isForbidden = isInsidePlantation(drag.currentX, drag.currentY);
        if (isForbidden) {
          // Snap back to starting valid position
          if (decor) {
            decor.x = drag.startX;
            decor.y = drag.startY;
          }
          if (pin) {
            pin.style.left = (drag.startX / 1024 * 100) + '%';
            pin.style.top = (drag.startY / 1024 * 100) + '%';
          }
          showToast('⚠️ Posição inválida! Não é permitido colocar enfeites sobre os canteiros.', true);
        } else {
          // Valid placement!
          if (decor) {
            decor.x = drag.currentX;
            decor.y = drag.currentY;
          }
          renderDecorsList();
          scheduleAutoSave();
        }
      } catch (err) {
        console.error('Erro no endDrag:', err);
      }
    }

    window.addEventListener('mousemove', (e) => {
      if (activeDrag) moveDrag(e.clientX, e.clientY);
    });
    window.addEventListener('touchmove', (e) => {
      if (activeDrag && e.touches.length > 0) {
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
    window.addEventListener('touchcancel', endDrag);

    // 4. Auto-Save Debouncer
    function scheduleAutoSave() {
      const statusEl = document.getElementById('val-save-status');
      if (statusEl) {
        statusEl.className = 'stat-pill save-status saving';
        statusEl.innerText = '⏳ Salvando em 2s...';
        statusEl.style.display = 'inline-flex';
      }

      if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
      autoSaveTimeout = setTimeout(() => {
        saveDecorationsToServer();
      }, 2000);
    }

    async function saveDecorationsToServer() {
      if (isSaving) return;
      isSaving = true;

      const statusEl = document.getElementById('val-save-status');
      if (statusEl) {
        statusEl.innerText = '💾 Salvando...';
        statusEl.style.display = 'inline-flex';
      }

      try {
        const payload = {
          decorations: placedDecorations.map(d => ({
            slotIndex: d.slotIndex,
            decorId: d.decorId,
            x: d.x,
            y: d.y,
          })),
        };

        const res = await fetch('/farm/' + USER_ID + '/decorations', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ADMIN_TOKEN,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Erro ao salvar');
        }

        if (statusEl) {
          statusEl.className = 'stat-pill save-status';
          statusEl.innerText = '✅ Posições Salvas!';
          setTimeout(() => {
            if (statusEl) statusEl.style.display = 'none';
          }, 3000);
        }
        showToast('✅ Posições dos enfeites salvas!');
      } catch (err) {
        if (statusEl) {
          statusEl.className = 'stat-pill save-status saving';
          statusEl.innerText = '❌ Erro ao salvar';
        }
        showToast('Erro ao salvar posições: ' + err.message, true);
      } finally {
        isSaving = false;
      }
    }

    // 5. Sidebar Lists Rendering (Aba Inventário)
    function renderInventorySeeds() {
      const container = document.getElementById('inventory-seeds-list');
      if (!container) return;
      const seedsInInv = inventoryItems.filter(i => i.type === 'seed' && i.quantity > 0);

      if (seedsInInv.length === 0) {
        container.innerHTML = '<p style="color:#8c7d9e; font-size:12px; grid-column:1/-1;">Nenhuma semente no inventário. Compre na Loja ao lado!</p>';
        return;
      }

      const freeSlotsCount = currentSlots.filter(s => s.stage === 'empty' || !s.plantId || s.stage === 'withered').length;

      container.innerHTML = seedsInInv.map(it => {
        const canPlant = freeSlotsCount > 0;
        const plantId = it.baseId || it.itemId;
        const pInfo = PLANTS_INFO[plantId];
        const growthSecs = it.growthTimeSeconds || pInfo?.growthTimeSeconds;
        const witherSecs = it.witherTimeSeconds || pInfo?.witherTimeSeconds;
        const growthStr = growthSecs ? formatConciseTime(growthSecs) : '';
        const witherStr = witherSecs ? formatConciseTime(witherSecs) : '';
        return \`
          <div class="item-card type-seed">
            <div class="item-card-header">
              <img class="item-thumb" src="/farm/sprites/plants/\${plantId}_ready.png" />
              <div class="item-info">
                <div class="item-name">\${it.catalogIndex ? '[ID:' + it.catalogIndex + '] ' : ''}\${it.name}</div>
                <div class="item-sub">Qtd na mochila: <strong>x\${it.quantity}</strong></div>
              </div>
            </div>
            <div class="item-meta-pills" style="margin: 0.35rem 0 0.15rem;">
              \${growthStr ? '<span class="meta-pill" title="Tempo de cultivo até a colheita">⏱️ ' + growthStr + '</span>' : ''}
              \${witherStr ? '<span class="meta-pill" style="color:#ff8585;" title="Tempo que a planta sobrevive pronta antes de morrer/apodrecer">💀 Morte: ' + witherStr + '</span>' : ''}
            </div>
            <div class="action-multi-container \${canPlant ? '' : 'is-disabled'}" style="margin-top: 0.35rem;">
              <div class="action-mini-header \${canPlant ? '' : 'disabled'}">
                \${canPlant ? '🌱 Plantar' : 'Sem Canteiro Livre'}
              </div>
              <div class="action-btn-row">
                <button class="btn-subaction" \${canPlant ? '' : 'disabled'} onclick="plantSeedFromInventory('\${plantId}', '\${it.name.replace(/'/g, \"\\\\'\")}', 1)">1x</button>
                <button class="btn-subaction" \${canPlant ? '' : 'disabled'} onclick="plantSeedFromInventory('\${plantId}', '\${it.name.replace(/'/g, \"\\\\'\")}', 3)">3x</button>
                <button class="btn-subaction" \${canPlant ? '' : 'disabled'} onclick="plantSeedFromInventory('\${plantId}', '\${it.name.replace(/'/g, \"\\\\'\")}', 9)">9x</button>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    async function plantSeedFromInventory(plantId, plantName, requestedQty = 1) {
      const freeSlots = currentSlots.filter(s => s.stage === 'empty' || !s.plantId || s.stage === 'withered');
      if (freeSlots.length === 0) {
        return showToast('⚠️ Todos os 9 canteiros estão ocupados! Colha plantas prontas primeiro.', true);
      }

      const inv = inventoryItems.find(i => (i.type === 'seed' || !i.itemId.startsWith('crop_')) && (i.baseId === plantId || i.itemId === plantId));
      const availableSeeds = inv ? inv.quantity : 0;
      if (availableSeeds <= 0) {
        return showToast('⚠️ Você não possui sementes de ' + plantName + ' na mochila!', true);
      }

      const qtyToPlant = Math.min(requestedQty, freeSlots.length, availableSeeds);

      try {
        const res = await fetch('/farm/' + USER_ID + '/plant', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ADMIN_TOKEN,
          },
          body: JSON.stringify({ itemId: plantId, amount: qtyToPlant }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Falha ao plantar');

        const actuallyPlanted = (data.slots && data.slots.length) || qtyToPlant;
        if (inv) inv.quantity = Math.max(0, inv.quantity - actuallyPlanted);

        // Update slots visually with drop animation
        if (data.slots && data.slots.length > 0) {
          const harvestSecs = data.harvestAt
            ? Math.max(0, Math.round((new Date(data.harvestAt).getTime() - Date.now()) / 1000))
            : (PLANTS_INFO[plantId]?.growthTimeSeconds || 60);
          const harvestMs = data.harvestAt
            ? new Date(data.harvestAt).getTime()
            : (Date.now() + harvestSecs * 1000);
          const witherMs = data.witherAt
            ? new Date(data.witherAt).getTime()
            : (harvestMs + (PLANTS_INFO[plantId]?.witherTimeSeconds || 3600) * 1000);

          data.slots.forEach(slotIdx => {
            const sl = currentSlots.find(s => s.slotIndex === slotIdx);
            if (sl) {
              sl.plantId = plantId;
              sl.stage = 'seed';
              sl.remainingSecondsToHarvest = harvestSecs;
              sl.harvestAtMs = harvestMs;
              sl.witherAtMs = witherMs;
              sl.isNewlyPlanted = true;
            }
          });
        }

        renderSlots();
        renderInventoryTab();
        renderShop();
        showToast('🌱 ' + actuallyPlanted + 'x ' + plantName + ' plantada(s) com sucesso!', false);
      } catch (err) {
        showToast(err.message, true);
      }
    }

    function renderDecorsList() {
      const container = document.getElementById('all-decors-list');
      if (!container) return;

      const countEl = document.getElementById('placed-decors-count');
      if (countEl) countEl.innerText = placedDecorations.length;

      const decorsInInv = inventoryItems.filter(i => i.type === 'decoration' && i.quantity > 0);

      if (placedDecorations.length === 0 && decorsInInv.length === 0) {
        container.innerHTML = '<p style="color:#8c7d9e; font-size:12px; grid-column:1/-1;">Nenhum enfeite no momento. Compre na Loja ao lado!</p>';
        return;
      }

      let html = '';

      // 1. Placed decorations (No Terreno) - Borda Dourada diferenciada
      for (const d of placedDecorations) {
        html += \`
          <div class="item-card decor-placed">
            <div class="item-card-header">
              <img class="item-thumb" src="\${decorSpriteUrl(d.decorId)}" />
              <div class="item-info">
                <div class="item-name">\${d.name}</div>
                <div class="item-sub" style="color:#ffd978;">📍 No Terreno</div>
              </div>
            </div>
            <div class="item-card-actions">
              <button class="btn-action secondary" onclick="unequipDecoration(\${d.slotIndex})">🗑️ Guardar</button>
            </div>
          </div>
        \`;
      }

      // 2. Unplaced copies in backpack (Livre na Mochila) - Borda Púrpura diferenciada
      for (const it of decorsInInv) {
        const placedCount = placedDecorations.filter(d => d.decorId === it.itemId).length;
        const availableToPlace = it.quantity - placedCount;
        if (availableToPlace > 0) {
          html += \`
            <div class="item-card decor-unplaced">
              <div class="item-card-header">
                <img class="item-thumb" src="\${decorSpriteUrl(it.itemId)}" />
                <div class="item-info">
                  <div class="item-name">\${it.name}</div>
                  <div class="item-sub" style="color:#dfb2ff;">🎒 Livre na Mochila (\${availableToPlace} disp. / total \${it.quantity})</div>
                </div>
              </div>
              <div class="item-card-actions">
                <button class="btn-action" onclick="placeFromBackpack('\${it.itemId}', '\${it.name}')">+ Posicionar</button>
              </div>
            </div>
          \`;
        }
      }

      container.innerHTML = html;
    }

    function renderInventoryConsumables() {
      const container = document.getElementById('inventory-consumables-list');
      if (!container) return;
      const consumablesInInv = inventoryItems.filter(i => i.type === 'consumable' && i.quantity > 0);

      if (consumablesInInv.length === 0) {
        container.innerHTML = '<p style="color:#8c7d9e; font-size:12px; grid-column:1/-1;">Nenhum elixir ou consumível no momento. Adquira na Loja ao lado!</p>';
        return;
      }

      container.innerHTML = consumablesInInv.map(it => {
        const spriteSrc = it.spriteName ? '/farm/sprites/consumables/' + it.spriteName : '';
        return \`
          <div class="item-card type-consumable">
            <div class="item-card-header">
              <img class="item-thumb" src="\${spriteSrc}" />
              <div class="item-info">
                <div class="item-name">\${it.catalogIndex ? '[ID:' + it.catalogIndex + '] ' : ''}\${it.name}</div>
                <div class="item-sub">Qtd na mochila: <strong>x\${it.quantity}</strong></div>
              </div>
            </div>
            \${it.description ? '<div class="item-desc">' + it.description + '</div>' : ''}
            <div class="item-meta-pills">
              <span class="meta-pill" style="border-color:\${it.color || '#9d5ec2'}; color:#e8d8be;">⚗️ \${it.color || 'Elixir'}</span>
            </div>
            <div class="item-card-actions" style="margin-top:0.4rem;">
              <button class="btn-action use-btn" onclick="useConsumableFromInventory('\${it.itemId}', '\${it.name}')">
                ⚗️ Usar
              </button>
            </div>
          </div>
        \`;
      }).join('');
    }

    function updateBuffBanner(buffs) {
      const banner = document.getElementById('farm-buff-banner');
      if (!banner) return;
      if (!buffs || !buffs.hasActiveBonus) {
        banner.style.display = 'none';
        banner.innerText = '';
        return;
      }
      const parts = [];
      if (buffs.effectiveGrowthMultiplier !== 1.0) parts.push('⚡ Cultivo: ' + buffs.effectiveGrowthMultiplier + 'x');
      if (buffs.effectiveCoinMultiplier !== 1.0) parts.push('🌱 Petalitas: ' + buffs.effectiveCoinMultiplier + 'x');
      if (buffs.witherFrozen) parts.push('❄️ Geada Ativa');
      if (buffs.dailySpecialItemBonus > 0) parts.push('🔥 Sorte Sacola: +' + Math.round(buffs.dailySpecialItemBonus * 100) + '%');
      if (buffs.dailyLuckMultiplier > 1.0) parts.push('🌹 Sorte Sacola: ' + buffs.dailyLuckMultiplier + 'x');

      if (parts.length > 0) {
        banner.innerText = parts.join('  |  ');
        banner.style.display = 'flex';
      } else {
        banner.style.display = 'none';
      }
    }

    async function useConsumableFromInventory(itemId, itemName) {
      try {
        const res = await fetch('/farm/' + USER_ID + '/use', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ADMIN_TOKEN,
          },
          body: JSON.stringify({ itemId }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'Falha ao usar consumível');

        // Se success for false (ex: Bílis de Gárgula), não desconta o item
        if (data.success !== false) {
          const inv = inventoryItems.find(i => i.itemId === itemId || i.baseId === itemId);
          if (inv) {
            inv.quantity = Math.max(0, inv.quantity - 1);
          }
        }

        // Atualizar status completo da fazenda
        const statusRes = await fetch('/farm/' + USER_ID, {
          headers: {
            'Authorization': 'Bearer ' + ADMIN_TOKEN,
          },
        });
        if (statusRes.ok) {
          const newStatus = await statusRes.json();
          if (newStatus.slots) currentSlots = newStatus.slots;
          if (newStatus.buffs) updateBuffBanner(newStatus.buffs);
          if (newStatus.coins != null) {
            currentCoins = newStatus.coins;
            updateCoinsDisplay();
          }
        }

        renderSlots();
        renderInventoryTab();
        showToast(data.message || '⚗️ Item utilizado com sucesso!');
      } catch (err) {
        showToast(err.message, true);
      }
    }

    function renderInventoryTab() {
      renderInventorySeeds();
      renderInventoryConsumables();
      renderDecorsList();
    }

    async function placeFromBackpack(decorId, name) {
      if (placedDecorations.length >= 10) {
        return showToast('Limite de 10 enfeites atingido no terreno!', true);
      }

      const it = inventoryItems.find(i => i.itemId === decorId);
      const placedCount = placedDecorations.filter(d => d.decorId === decorId).length;
      if (!it || placedCount >= it.quantity) {
        return showToast('⚠️ Todos os exemplares deste enfeite (' + (it?.quantity || 0) + 'x) já estão posicionados!', true);
      }

      // Find free slotIndex (1..10)
      const usedSlots = new Set(placedDecorations.map(d => d.slotIndex));
      let freeSlot = 1;
      while (usedSlots.has(freeSlot) && freeSlot <= 10) freeSlot++;

      // Free peripheral spawn coordinate
      const defaultSpawns = [
        { x: 200, y: 310 }, { x: 840, y: 340 }, { x: 150, y: 840 }, { x: 850, y: 840 },
        { x: 260, y: 240 }, { x: 780, y: 250 }, { x: 920, y: 550 }, { x: 100, y: 550 },
      ];
      const spawn = defaultSpawns[placedDecorations.length % defaultSpawns.length];

      try {
        const res = await fetch('/farm/' + USER_ID + '/decorate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ADMIN_TOKEN,
          },
          body: JSON.stringify({
            slotIndex: freeSlot,
            decorId: decorId,
            x: spawn.x,
            y: spawn.y,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Falha ao posicionar enfeite');
        }

        placedDecorations.push({
          slotIndex: freeSlot,
          decorId: decorId,
          name: name,
          x: spawn.x,
          y: spawn.y,
        });

        renderDecorations();
        renderInventoryTab();
        renderShop();
        showToast('🏛️ ' + name + ' posicionado! Arraste-o para calibrar.', false);
      } catch (err) {
        showToast(err.message, true);
      }
    }

    async function unequipDecoration(slotIndex) {
      try {
        const res = await fetch('/farm/' + USER_ID + '/decorate/' + slotIndex, {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer ' + ADMIN_TOKEN,
          },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Falha ao remover');
        }

        placedDecorations = placedDecorations.filter(d => d.slotIndex !== slotIndex);
        renderDecorations();
        renderInventoryTab();
        renderShop();
        showToast('Enfeite guardado na mochila com sucesso!');
      } catch (err) {
        showToast(err.message, true);
      }
    }

    // ===== BUSCA GREEDY NA LOJA (Item 3) =====
    let shopSearchQuery = '';

    function normalizeSearchText(str) {
      if (!str) return '';
      return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function handleShopSearch() {
      const input = document.getElementById('shop-search-input');
      shopSearchQuery = input ? input.value : '';
      renderShop();
    }

    function itemMatchesQuery(it, tokens, itemType) {
      if (!tokens || tokens.length === 0) return true;
      const searchableParts = [
        it.name,
        it.id,
        it.index != null ? String(it.index) : '',
        it.description,
        it.bonusDescription,
        it.effect,
        it.bonusType,
        it.category,
        it.tier,
        it.color,
        itemType === 'seed' ? 'semente' : (itemType === 'consumable' ? 'elixir consumivel' : 'enfeite decoracao')
      ];
      const itemText = normalizeSearchText(searchableParts.filter(Boolean).join(' '));
      return tokens.every(tok => itemText.includes(tok));
    }

    // ===== CARRINHO DE COMPRAS DIÁRIO (Item 7) =====
    function getCartStorageKey() {
      return 'farm_cart_' + USER_ID;
    }

    function loadCart() {
      const key = getCartStorageKey();
      try {
        const cookies = document.cookie.split(';');
        for (let c of cookies) {
          c = c.trim();
          if (c.startsWith(key + '=')) {
            const val = decodeURIComponent(c.substring(key.length + 1));
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return parsed;
          }
        }
      } catch (e) {}

      try {
        const ls = localStorage.getItem(key);
        if (ls) {
          const parsed = JSON.parse(ls);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {}

      return [];
    }

    function saveCart(cart) {
      const key = getCartStorageKey();
      const val = JSON.stringify(cart);
      const maxAge = 365 * 24 * 60 * 60;
      document.cookie = key + '=' + encodeURIComponent(val) + '; path=/; max-age=' + maxAge + '; SameSite=Lax';
      try {
        localStorage.setItem(key, val);
      } catch (e) {}
    }

    let userCart = loadCart();

    function addToCart(itemId, itemType) {
      const existing = userCart.find(i => i.itemId === itemId);
      if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
      } else {
        userCart.push({ itemId, itemType, quantity: 1 });
      }
      saveCart(userCart);
      renderCart();
      showToast('🛒 Adicionado 1x ao carrinho!');
    }

    function decreaseCartItem(itemId) {
      const idx = userCart.findIndex(i => i.itemId === itemId);
      if (idx !== -1) {
        if (userCart[idx].quantity > 1) {
          userCart[idx].quantity -= 1;
        } else {
          userCart.splice(idx, 1);
        }
        saveCart(userCart);
        renderCart();
      }
    }

    function renderCart() {
      const cartContainer = document.getElementById('shop-cart-container');
      if (!cartContainer) return;

      if (!userCart || userCart.length === 0) {
        cartContainer.style.display = 'none';
        cartContainer.innerHTML = '';
        return;
      }

      cartContainer.style.display = 'flex';

      let totalCost = 0;
      let purchasableCount = 0;

      const rowsHtml = userCart.map(ci => {
        let itemMeta = null;
        if (shopCatalog.seeds) itemMeta = shopCatalog.seeds.find(s => s.id === ci.itemId);
        if (!itemMeta && shopCatalog.consumables) itemMeta = shopCatalog.consumables.find(c => c.id === ci.itemId);
        if (!itemMeta && shopCatalog.decorations) itemMeta = shopCatalog.decorations.find(d => d.id === ci.itemId);

        const name = itemMeta ? itemMeta.name : ci.itemId;
        const price = itemMeta ? itemMeta.price : 0;
        const remainingToday = itemMeta && itemMeta.remainingToday != null ? itemMeta.remainingToday : 999;
        const isExhausted = remainingToday <= 0;

        let qtyToBuy = 0;
        let subtotal = 0;
        if (!isExhausted) {
          qtyToBuy = Math.min(ci.quantity, remainingToday);
          subtotal = qtyToBuy * price;
          totalCost += subtotal;
          purchasableCount += qtyToBuy;
        }

        const exhaustedLabel = isExhausted
          ? '<span style="color:#ff6b6b; font-size:11px; margin-left:6px; font-weight:normal;">(Esgotado hoje)</span>'
          : (qtyToBuy < ci.quantity ? '<span style="color:#ffd978; font-size:11px; margin-left:6px; font-weight:normal;">(Restam ' + qtyToBuy + 'x)</span>' : '');

        return \`
          <div class="cart-item-row \${isExhausted ? 'is-exhausted' : ''}">
            <div class="cart-item-title">
              <span>\${name}</span>
              \${exhaustedLabel}
            </div>
            <div class="cart-item-controls">
              <span style="color:#ffd978; font-weight:700;">x\${ci.quantity}</span>
              <span style="color:#9f8fb3; font-size:11px;">(\${price} Ptl/un)</span>
              <button class="btn-cart-minus" onclick="decreaseCartItem('\${ci.itemId}')" title="Diminuir quantidade">−</button>
            </div>
          </div>
        \`;
      }).join('');

      const isOutOfCoins = purchasableCount > 0 && currentCoins < totalCost;
      let buyBtnText = '';
      let buyBtnDisabled = false;

      if (purchasableCount === 0) {
        buyBtnText = '✅ Itens já comprados hoje';
        buyBtnDisabled = true;
      } else if (isOutOfCoins) {
        buyBtnText = '💸 Saldo insuficiente (' + totalCost.toLocaleString('pt-BR') + ' Ptl)';
        buyBtnDisabled = true;
      } else {
        buyBtnText = '🛒 Comprar Carrinho (' + totalCost.toLocaleString('pt-BR') + ' Ptl)';
        buyBtnDisabled = false;
      }

      cartContainer.innerHTML = \`
        <div class="cart-header">
          <span>🛒 Carrinho de Compras Diário</span>
          <small style="font-size:0.75rem; color:#dfb2ff;">Salvo nos seus cookies</small>
        </div>
        <div class="cart-items-list">
          \${rowsHtml}
        </div>
        <div style="margin-top:0.35rem;">
          <button class="btn-cart-buy" \${buyBtnDisabled ? 'disabled' : ''} onclick="buyWholeCart()">
            \${buyBtnText}
          </button>
        </div>
      \`;
    }

    async function buyWholeCart() {
      if (!userCart || userCart.length === 0) return;

      const toBuy = [];
      let totalCost = 0;

      for (const ci of userCart) {
        let itemMeta = null;
        let type = ci.itemType || 'seed';
        if (shopCatalog.seeds) itemMeta = shopCatalog.seeds.find(s => s.id === ci.itemId);
        if (!itemMeta && shopCatalog.consumables) {
          itemMeta = shopCatalog.consumables.find(c => c.id === ci.itemId);
          type = 'consumable';
        }
        if (!itemMeta && shopCatalog.decorations) {
          itemMeta = shopCatalog.decorations.find(d => d.id === ci.itemId);
          type = 'decor';
        }

        if (!itemMeta) continue;
        const remainingToday = itemMeta.remainingToday != null ? itemMeta.remainingToday : 999;
        if (remainingToday <= 0) continue;

        const qty = Math.min(ci.quantity, remainingToday);
        if (qty > 0) {
          toBuy.push({
            itemId: ci.itemId,
            unitPrice: itemMeta.price,
            name: itemMeta.name,
            quantity: qty,
            itemType: type,
            itemMeta,
          });
          totalCost += qty * itemMeta.price;
        }
      }

      if (toBuy.length === 0) {
        return showToast('Todos os itens do carrinho já foram comprados hoje!', true);
      }

      if (currentCoins < totalCost) {
        return showToast('Petalitas insuficientes para comprar o carrinho! Necessário: ' + totalCost.toLocaleString('pt-BR') + ' Ptl', true);
      }

      let boughtItemsCount = 0;
      let errors = [];

      for (const item of toBuy) {
        try {
          const res = await fetch('/shop/buy/' + USER_ID, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + ADMIN_TOKEN,
            },
            body: JSON.stringify({ itemId: item.itemId, quantity: item.quantity }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Falha ao comprar ' + item.name);

          currentCoins = data.remainingCoins;
          updateCoinsDisplay();

          if (item.itemMeta && item.itemMeta.remainingToday != null) {
            item.itemMeta.remainingToday = Math.max(0, item.itemMeta.remainingToday - item.quantity);
          }

          const existing = inventoryItems.find(i => i.itemId === item.itemId);
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            inventoryItems.push({
              itemId: item.itemId,
              baseId: item.itemId,
              catalogIndex: item.itemMeta.index,
              name: item.name,
              type: item.itemType === 'decor' ? 'decoration' : (item.itemType === 'consumable' ? 'consumable' : 'seed'),
              quantity: item.quantity,
              growthTimeSeconds: item.itemMeta.growthTimeSeconds,
              witherTimeSeconds: item.itemMeta.witherTimeSeconds,
              spriteName: item.itemMeta.spriteName ? item.itemMeta.spriteName + '.png' : (item.itemId + '.png'),
              color: item.itemMeta.color,
              description: item.itemMeta.description,
            });
          }

          boughtItemsCount += item.quantity;
        } catch (err) {
          errors.push(item.name + ': ' + err.message);
        }
      }

      // NÃO LIMPA O CARRINHO! Apenas atualiza status visual
      renderCart();
      renderShop();
      renderInventoryTab();

      if (errors.length > 0) {
        showToast('⚠️ Parcialmente concluído: ' + errors.join('; '), true);
      } else {
        showToast('✅ Carrinho comprado com sucesso! (' + boughtItemsCount + ' itens)', false);
      }
    }

    // 6. Shop Tab Rendering and Actions
    function renderShop() {
      const container = document.getElementById('shop-items-list');
      if (!container) return;

      renderCart(); // Mantém o carrinho sincronizado

      function getItemOwnedCount(itemId) {
        const inv = inventoryItems.find(i => i.itemId === itemId);
        let count = inv ? inv.quantity : 0;
        if (itemId.startsWith('decor_')) {
          const placedCount = placedDecorations.filter(d => d.decorId === itemId).length;
          count += placedCount;
        }
        return count;
      }

      function buildCard(it, itemType) {
        const owned = getItemOwnedCount(it.id);
        const isLimitReached = it.remainingToday != null && it.remainingToday <= 0;
        const isDecorUnavailable = itemType === 'decor' && owned >= 1;
        const isUnavailable = isLimitReached || isDecorUnavailable;

        let cardClass = 'item-card ' + (itemType === 'seed' ? 'type-seed' : (itemType === 'decor' ? 'type-decor' : 'type-consumable')) + (owned > 0 ? ' owned' : '');
        if (isUnavailable) {
          cardClass += ' shop-item-unavailable';
        }

        const thumbSrc = itemType === 'seed'
          ? '/farm/sprites/plants/' + it.id + '_ready.png'
          : (itemType === 'decor'
            ? decorSpriteUrl(it.id)
            : '/farm/sprites/consumables/' + it.spriteName + '.png');

        const ownedBadgeHtml = owned > 0
          ? '<div class="item-card-owned-badge">🎒 Possui: <strong>' + owned + 'x</strong></div>'
          : '';

        let pillsHtml = '';
        if (itemType === 'seed') {
          const witherSecs = it.witherTimeSeconds || (it.witherMinutes ? it.witherMinutes * 60 : 0);
          const witherStr = witherSecs > 0 ? formatConciseTime(witherSecs) : '';
          pillsHtml = \`
            <div class="item-meta-pills">
              <span class="meta-pill" title="Tempo de cultivo até a colheita">⏱️ \${it.growthMinutes}m</span>
              \${witherStr ? '<span class="meta-pill" style="color:#ff8585;" title="Tempo que a planta sobrevive pronta antes de morrer/apodrecer">💀 Morte: ' + witherStr + '</span>' : ''}
              <span class="meta-pill">🌱 Venda: \${it.sellPrice} Ptl</span>
              <span class="meta-pill" style="color:\${it.remainingToday > 0 ? '#55f3a0' : '#ff6b6b'};">Hoje: \${it.dailyLimit - it.remainingToday}/\${it.dailyLimit}</span>
            </div>
          \`;
        } else if (itemType === 'consumable') {
          pillsHtml = \`
            <div class="item-meta-pills">
              <span class="meta-pill" style="border-color:\${it.color || '#9d5ec2'}; color:#e8d8be;">⚗️ \${it.color || 'Elixir'}</span>
              <span class="meta-pill" style="color:\${it.remainingToday > 0 ? '#55f3a0' : '#ff6b6b'};">Hoje: \${it.dailyLimit - it.remainingToday}/\${it.dailyLimit}</span>
            </div>
          \`;
        }

        const descHtml = it.description ? ('<div class="item-desc">' + it.description + '</div>') : '';

        // Botões de Ação
        let actionsHtml = '';
        if (itemType === 'seed' || itemType === 'consumable') {
          // Botões de compra com mini-header: 1x se limite=1; 1x e Nx se limite<5; 1x, 3x e Nx se limite>=5
          const maxAvailable = it.dailyLimit || (itemType === 'seed' ? 10 : 3);
          let btnsHtml = '';
          if (maxAvailable === 1) {
            btnsHtml = \`
              <button class="btn-subaction" \${isLimitReached ? 'disabled' : ''} onclick="buyItem('\${it.id}', \${it.price}, '\${it.name.replace(/'/g, \"\\\\'\")}', 1, '\${itemType}')">1x</button>
            \`;
          } else if (maxAvailable < 5) {
            btnsHtml = \`
              <button class="btn-subaction" \${isLimitReached ? 'disabled' : ''} onclick="buyItem('\${it.id}', \${it.price}, '\${it.name.replace(/'/g, \"\\\\'\")}', 1, '\${itemType}')">1x</button>
              <button class="btn-subaction" \${isLimitReached ? 'disabled' : ''} onclick="buyItem('\${it.id}', \${it.price}, '\${it.name.replace(/'/g, \"\\\\'\")}', \${maxAvailable}, '\${itemType}')">\${maxAvailable}x</button>
            \`;
          } else {
            btnsHtml = \`
              <button class="btn-subaction" \${isLimitReached ? 'disabled' : ''} onclick="buyItem('\${it.id}', \${it.price}, '\${it.name.replace(/'/g, \"\\\\'\")}', 1, '\${itemType}')">1x</button>
              <button class="btn-subaction" \${isLimitReached ? 'disabled' : ''} onclick="buyItem('\${it.id}', \${it.price}, '\${it.name.replace(/'/g, \"\\\\'\")}', 3, '\${itemType}')">3x</button>
              <button class="btn-subaction" \${isLimitReached ? 'disabled' : ''} onclick="buyItem('\${it.id}', \${it.price}, '\${it.name.replace(/'/g, \"\\\\'\")}', \${maxAvailable}, '\${itemType}')">\${maxAvailable}x</button>
            \`;
          }

          actionsHtml = \`
            <div class="action-multi-container \${isLimitReached ? 'is-disabled' : ''}">
              <div class="action-mini-header \${isLimitReached ? 'disabled' : ''}">
                \${isLimitReached ? 'Esgotado Hoje' : '🛒 Comprar'}
              </div>
              <div class="action-btn-row">
                \${btnsHtml}
              </div>
            </div>
          \`;
        } else {
          actionsHtml = \`
            <div class="item-card-actions">
              <button class="btn-action" \${isUnavailable ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} onclick="buyItem('\${it.id}', \${it.price}, '\${it.name.replace(/'/g, \"\\\\'\")}', 1, '\${itemType}')">
                \${isUnavailable ? (isDecorUnavailable ? 'Já Adquirido' : 'Esgotado Hoje') : 'Comprar'}
              </button>
            </div>
          \`;
        }

        // Item 7: Logo abaixo do container "Possui: 3x": Botão simples "+ Carrinho"
        const cartBtnHtml = \`
          <button class="btn-add-cart" onclick="addToCart('\${it.id}', '\${itemType}')" title="Adicionar 1x ao carrinho de compras">
            + Carrinho
          </button>
        \`;

        return \`
          <div class="\${cardClass}">
            <div class="item-card-header">
              <img class="item-thumb" src="\${thumbSrc}" />
              <div class="item-info">
                <div class="item-name">[ID:\${it.index}] \${it.name}</div>
                <div class="item-sub">🌱 <strong>\${it.price.toLocaleString('pt-BR')} Ptl</strong></div>
              </div>
            </div>
            \${descHtml}
            \${pillsHtml}
            \${actionsHtml}
            \${ownedBadgeHtml}
            \${cartBtnHtml}
          </div>
        \`;
      }

      // Filtragem Greedy (Item 3)
      const tokens = normalizeSearchText(shopSearchQuery).split(' ').filter(Boolean);
      const filteredSeeds = (shopCatalog.seeds || []).filter(s => itemMatchesQuery(s, tokens, 'seed'));
      const filteredConsumables = (shopCatalog.consumables || []).filter(c => itemMatchesQuery(c, tokens, 'consumable'));
      const filteredDecors = (shopCatalog.decorations || []).filter(d => itemMatchesQuery(d, tokens, 'decor'));

      const seedsHtml = filteredSeeds.map(s => buildCard(s, 'seed')).join('');
      const consumablesHtml = filteredConsumables.map(c => buildCard(c, 'consumable')).join('');
      const decorsHtml = filteredDecors.map(d => buildCard(d, 'decor')).join('');

      let finalHtml = '';
      if (filteredSeeds.length > 0) {
        finalHtml += '<div class="shop-category-header seeds">🌱 Sementes de Cultivo</div>' + seedsHtml;
      }
      if (filteredConsumables.length > 0) {
        finalHtml += '<div class="shop-category-header consumables" style="color:#dfb2ff; background:rgba(122,62,157,0.2); border-left:4px solid #9d5ec2;">⚗️ Consumíveis & Elixires</div>' + consumablesHtml;
      }
      if (filteredDecors.length > 0) {
        finalHtml += '<div class="shop-category-header decorations">🏛️ Enfeites e Decorações</div>' + decorsHtml;
      }
      if (!finalHtml) {
        finalHtml = '<p style="color:#8c7d9e; font-size:13px; grid-column:1/-1; padding:2rem 0; text-align:center;">Nenhum item encontrado na loja para essa busca.</p>';
      }

      container.innerHTML = finalHtml;
    }

    async function buyItem(itemId, unitPrice, itemName, requestedQty = 1, itemType = 'seed') {
      let targetItem = null;
      if (itemType === 'seed' && shopCatalog.seeds) {
        targetItem = shopCatalog.seeds.find(x => x.id === itemId);
      } else if (itemType === 'consumable' && shopCatalog.consumables) {
        targetItem = shopCatalog.consumables.find(x => x.id === itemId);
      }

      // Se tem limite diário, calcula a quantia real disponível que o usuário pode comprar
      let actualQty = requestedQty;
      if (targetItem && targetItem.remainingToday != null) {
        if (targetItem.remainingToday <= 0) {
          return showToast('Limite diário já atingido para ' + itemName + '!', true);
        }
        actualQty = Math.min(requestedQty, targetItem.remainingToday);
      }

      const totalCost = unitPrice * actualQty;
      if (currentCoins < totalCost) {
        return showToast('Petalitas insuficientes para comprar ' + actualQty + 'x ' + itemName + '! Necessário: ' + totalCost.toLocaleString('pt-BR') + ' Ptl', true);
      }

      try {
        const res = await fetch('/shop/buy/' + USER_ID, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ADMIN_TOKEN,
          },
          body: JSON.stringify({ itemId, quantity: actualQty }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Falha na compra');

        currentCoins = data.remainingCoins;
        updateCoinsDisplay();

        // Update remainingToday in catalog cache
        if (shopCatalog.seeds) {
          const s = shopCatalog.seeds.find(x => x.id === itemId);
          if (s) s.remainingToday = Math.max(0, s.remainingToday - actualQty);
        }
        if (shopCatalog.consumables) {
          const c = shopCatalog.consumables.find(x => x.id === itemId);
          if (c) c.remainingToday = Math.max(0, c.remainingToday - actualQty);
        }

        // Update inventory cache
        const existing = inventoryItems.find(i => i.itemId === itemId);
        if (existing) {
          existing.quantity += actualQty;
        } else {
          let catalogMeta = null;
          if (itemType === 'seed' && shopCatalog.seeds) catalogMeta = shopCatalog.seeds.find(x => x.id === itemId);
          if (itemType === 'consumable' && shopCatalog.consumables) catalogMeta = shopCatalog.consumables.find(x => x.id === itemId);

          inventoryItems.push({
            itemId,
            baseId: itemId,
            catalogIndex: catalogMeta ? catalogMeta.index : undefined,
            name: itemName,
            type: itemType === 'decor' ? 'decoration' : (itemType === 'consumable' ? 'consumable' : 'seed'),
            quantity: actualQty,
            growthTimeSeconds: catalogMeta?.growthTimeSeconds,
            witherTimeSeconds: catalogMeta?.witherTimeSeconds,
            spriteName: catalogMeta?.spriteName ? catalogMeta.spriteName + '.png' : (itemId + '.png'),
            color: catalogMeta?.color,
            description: catalogMeta?.description,
          });
        }

        renderInventoryTab();
        renderShop();
        showToast('✅ Comprou ' + actualQty + 'x ' + itemName + ' por ' + totalCost.toLocaleString('pt-BR') + ' Ptl!');
      } catch (err) {
        showToast(err.message, true);
      }
    }

    // 7. Sell Tab Rendering and Actions
    function renderSell() {
      const container = document.getElementById('sell-items-list');
      const crops = inventoryItems.filter(i => i.type === 'crop' && i.quantity > 0);

      if (crops.length === 0) {
        container.innerHTML = '<p style="color:#8c7d9e; font-size:12px; grid-column:1/-1;">Nenhuma colheita pronta para vender no momento. Colha pela aba Terreno (ou no bot com !faz-colheita) — os bônus de iscas, rols e fichas chegam automaticamente no seu privado.</p>';
        return;
      }

      container.innerHTML = crops.map(c => \`
        <div class="item-card">
          <div class="item-card-header">
            <img class="item-thumb" src="/farm/sprites/plants/\${c.baseId}_ready.png" />
            <div class="item-info">
              <div class="item-name">\${c.name}</div>
              <div class="item-sub">Qtd: <strong>x\${c.quantity}</strong> | \${c.sellPrice} Ptl/un</div>
            </div>
          </div>
          <div class="item-card-actions">
            <button class="btn-action" onclick="sellItem('\${c.itemId}', 1, \${c.sellPrice}, '\${c.name}')">Vender 1</button>
            <button class="btn-action secondary" onclick="sellItem('\${c.itemId}', \${c.quantity}, \${c.sellPrice * c.quantity}, '\${c.name}')">Vender Tudo (x\${c.quantity})</button>
          </div>
        </div>
      \`).join('');
    }

    async function sellItem(itemId, qty, totalEarned, name) {
      try {
        const res = await fetch('/farm/' + USER_ID + '/sell', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ADMIN_TOKEN,
          },
          body: JSON.stringify({ itemId, quantity: qty }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Falha ao vender');

        currentCoins = data.newCoinsBalance;
        updateCoinsDisplay();

        const inv = inventoryItems.find(i => i.itemId === itemId);
        if (inv) inv.quantity -= qty;

        renderSell();
        showToast('🌱 Vendeu ' + qty + 'x ' + name + ' por +' + data.totalCoinsEarned.toLocaleString('pt-BR') + ' Ptl!');
      } catch (err) {
        showToast(err.message, true);
      }
    }

    async function sellAllCrops() {
      try {
        const res = await fetch('/farm/' + USER_ID + '/sell', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ADMIN_TOKEN,
          },
          body: JSON.stringify({ all: true }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Falha ao vender tudo');

        currentCoins = data.newCoinsBalance;
        updateCoinsDisplay();

        inventoryItems.forEach(i => {
          if (i.type === 'crop') i.quantity = 0;
        });

        renderSell();
        showToast('🌱 Todas as colheitas vendidas por +' + data.totalCoinsEarned.toLocaleString('pt-BR') + ' Ptl!');
      } catch (err) {
        showToast(err.message, true);
      }
    }

    function updateCoinsDisplay() {
      const formatted = currentCoins.toLocaleString('pt-BR');
      document.getElementById('val-coins').innerText = formatted;
      const sub = document.getElementById('shop-coins-sub');
      if (sub) sub.innerText = formatted;
    }

    function formatSessionTime(diffSeconds) {
      if (diffSeconds <= 0) return '00:00';
      const days = Math.floor(diffSeconds / 86400);
      const hours = Math.floor((diffSeconds % 86400) / 3600);
      const minutes = Math.floor((diffSeconds % 3600) / 60);
      const seconds = diffSeconds % 60;
      if (days > 0) return days + 'd ' + hours + 'h';
      if (hours > 0) return hours + 'h ' + minutes + 'm';
      return (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    }

    // Helper para som de alarme local sutil (Web Audio API - sem depender de arquivos externos)
    function playHarvestChime() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.3);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
      } catch (e) {}
    }

    // Inicialização dos timestamps absolutos para cada canteiro
    currentSlots.forEach(slot => {
      if (slot.harvestAt) {
        slot.harvestAtMs = new Date(slot.harvestAt).getTime();
      } else if (slot.remainingSecondsToHarvest) {
        slot.harvestAtMs = Date.now() + (slot.remainingSecondsToHarvest * 1000);
      }
      if (slot.witherAt) {
        slot.witherAtMs = new Date(slot.witherAt).getTime();
      } else if (slot.remainingSecondsToWither) {
        slot.witherAtMs = Date.now() + (slot.remainingSecondsToWither * 1000);
      }
    });

    function checkAndProgressSlotTimers() {
      const nowMs = Date.now();
      let hasSlotStateChanged = false;

      for (const slot of currentSlots) {
        if (!slot.plantId || slot.stage === 'empty') continue;

        if (slot.stage === 'seed' || slot.stage === 'growing') {
          if (slot.harvestAtMs) {
            const diffSecs = Math.max(0, Math.round((slot.harvestAtMs - nowMs) / 1000));
            slot.remainingSecondsToHarvest = diffSecs;

            if (diffSecs <= 0) {
              slot.stage = 'ready';
              hasSlotStateChanged = true;
              const pInfo = PLANTS_INFO[slot.plantId];
              const pName = pInfo ? pInfo.name : 'Planta';
              sendLocalAlert('🥀 Colheita Pronta!', 'O canteiro [' + slot.slotIndex + '] (' + pName + ') floresceu e está pronto para colher! ✦', 'ready-' + slot.slotIndex);
              playHarvestChime();
            } else {
              const badgeEl = document.getElementById('slot-badge-' + slot.slotIndex);
              if (badgeEl) {
                badgeEl.innerText = '[' + slot.slotIndex + '] ☘ ' + formatConciseTime(diffSecs);
              }
            }
          }
        } else if (slot.stage === 'ready') {
          if (slot.witherAtMs) {
            const diffSecs = Math.max(0, Math.round((slot.witherAtMs - nowMs) / 1000));
            slot.remainingSecondsToWither = diffSecs;

            if (diffSecs <= 0) {
              slot.stage = 'withered';
              hasSlotStateChanged = true;
              const pInfo = PLANTS_INFO[slot.plantId];
              const pName = pInfo ? pInfo.name : 'Planta';
              sendLocalAlert('💀 Planta Apodreceu!', 'A planta no canteiro [' + slot.slotIndex + '] (' + pName + ') apodreceu e morreu.', 'withered-' + slot.slotIndex);
            } else {
              const badgeEl = document.getElementById('slot-badge-' + slot.slotIndex);
              if (badgeEl) {
                badgeEl.innerText = '[' + slot.slotIndex + '] ✦ Colher! (' + formatConciseTime(diffSecs) + ')';
              }
            }
          }
        }
      }

      if (hasSlotStateChanged) {
        renderSlots();
        updatePageTitle();
      }
    }

    function updatePageTitle() {
      const readySlots = currentSlots.filter(s => s.stage === 'ready' && s.plantId).length;
      if (readySlots > 0) {
        document.title = '✦ (' + readySlots + ' Prontas!) Jardim das Sombras';
      } else {
        document.title = 'Jardim das Sombras (Shadow Garden)';
      }
    }

    // Ao alternar/voltar para a aba, recalcula instantaneamente os estágios com base no relógio real
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkAndProgressSlotTimers();
      }
    });

    // 8. Timers em Tempo Real
    function initTimer() {
      const interval = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        const diff = EXPIRES_AT - now;

        if (diff <= 0) {
          clearInterval(interval);
          const modal = document.getElementById('expired-modal');
          if (modal) modal.style.display = 'flex';
        }

        checkAndProgressSlotTimers();
      }, 1000);
    }

    // 9. Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetContent = document.getElementById(targetId);
        if (targetContent) targetContent.classList.add('active');

        // Layouts de página única (mobile/tablet): se o jogador trocou de aba com a
        // lista rolada, leva ao início do novo conteúdo em vez de deixá-lo no meio.
        const sidebar = document.querySelector('.sidebar-column');
        if (window.innerWidth <= 1100 && sidebar && sidebar.getBoundingClientRect().top < 0) {
          sidebar.scrollIntoView({ block: 'start' });
        }
      });
    });

    document.getElementById('btn-sell-all').addEventListener('click', sellAllCrops);

    // 10. Sincronização Dinâmica da Altura da Sidebar com a Fazenda no Desktop
    function syncSidebarHeight() {
      const sidebar = document.querySelector('.sidebar-column');
      const canvasCol = document.querySelector('.canvas-column');
      if (!sidebar || !canvasCol) return;

      if (window.innerWidth > 1100) {
        const h = Math.round(canvasCol.getBoundingClientRect().height);
        if (h > 300) {
          sidebar.style.height = h + 'px';
          sidebar.style.maxHeight = h + 'px';
        }
      } else {
        sidebar.style.height = '';
        sidebar.style.maxHeight = '';
      }
    }

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => syncSidebarHeight());
      const canvasColEl = document.querySelector('.canvas-column');
      if (canvasColEl) ro.observe(canvasColEl);
    }
    window.addEventListener('resize', syncSidebarHeight);

    // Initial load
    renderSlots();
    renderDecorations();
    renderInventoryTab();
    renderCart();
    renderShop();
    renderSell();
    syncSidebarHeight();
    updateResetCountdown();
    updateNotifButtonUI();
    initTimer();
  </script>
</body>
</html>`;
}
