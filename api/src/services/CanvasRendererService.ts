import { createCanvas, loadImage, Image, GlobalFonts } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { getCurrentTimeCycle, TimeCycle } from '../utils/timeCycle.js';
import { PLANTS, DECORATIONS } from '../utils/catalog.js';
import { t } from '../utils/texts.js';

export interface RenderSlotData {
  slotIndex: number; // 1 to 9
  plantId: string | null;
  stage: 'empty' | 'seed' | 'growing' | 'ready' | 'withered';
  tooltipText?: string;
  tooltipStyle?: number;
  isGhost?: boolean;
}

export interface RenderDecorationData {
  slotIndex: number;
  decorId: string;
  x?: number | null;
  y?: number | null;
}

export interface RenderFarmOptions {
  slots: RenderSlotData[];
  decorations?: RenderDecorationData[];
  timeCycleOverride?: string;
  includeTooltips?: boolean;
  tooltipStyle?: number;
  userName?: string;
  headerStyle?: number;
}

/**
 * Validates if a coordinate (x, y) falls inside the 3x3 plantation area.
 * Returns true if inside (invalid for placing decorations).
 */
export function isInsidePlantation(x: number, y: number): boolean {
  // Calibrated plantation center (512, 530) and diamond half-axes covering the 9 slots
  const cx = 512;
  const cy = 530;
  const rx = 480;
  const ry = 270;

  const normalizedDist = Math.abs(x - cx) / rx + Math.abs(y - cy) / ry;
  return normalizedDist <= 1.0;
}

export interface RenderCacheEntry {
  buffer: Buffer;
  etag: string;
  timestamp: number;
}

export class CanvasRendererService {
  private static imageCache: Map<string, Image> = new Map();
  private static renderCache: Map<string, RenderCacheEntry> = new Map();
  private static readonly RENDER_CACHE_MAX_SIZE = 300;
  private static readonly RENDER_CACHE_TTL_MS = 60 * 1000; // 60 segundos
  private static initialized: boolean = false;

  public static isInsidePlantation(x: number, y: number): boolean {
    return isInsidePlantation(x, y);
  }

  // Calibrated isometric coordinates for 1024x1024 background (exact dirt centers)
  public static readonly SLOT_COORDINATES: Record<number, { x: number; y: number; scale: number; zIndex: number }> = {
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

  // Peripheral default decorative slots
  private static readonly DEFAULT_DECOR_COORDINATES: Record<number, { x: number; y: number; layer: 'back' | 'front' }> = {
    1: { x: 220, y: 310, layer: 'back' },
    2: { x: 850, y: 380, layer: 'back' },
    3: { x: 160, y: 830, layer: 'front' },
    4: { x: 750, y: 840, layer: 'front' },
  };

  public static clearRenderCache(): void {
    this.renderCache.clear();
  }

  public static computeFarmCacheKey(options: RenderFarmOptions): string {
    const timeCycle = getCurrentTimeCycle(options.timeCycleOverride);
    const slotsPart = options.slots
      .map((s) => `${s.slotIndex}:${s.plantId || '_'}:${s.stage}:${s.tooltipText || ''}:${s.isGhost ? 1 : 0}:${s.tooltipStyle || ''}`)
      .join(';');
    const decorsPart = (options.decorations || [])
      .map((d) => `${d.slotIndex}:${d.decorId}:${d.x ?? 'd'}:${d.y ?? 'd'}`)
      .join(';');
    const ttPart = `${options.includeTooltips ? 1 : 0}:${options.tooltipStyle || 1}`;
    const userPart = `${options.userName || ''}:${options.headerStyle || 3}`;
    return `${timeCycle}|${ttPart}|${userPart}|${slotsPart}|${decorsPart}`;
  }

  public static getRenderCacheEntry(options: RenderFarmOptions): RenderCacheEntry | undefined {
    const cacheKey = this.computeFarmCacheKey(options);
    const entry = this.renderCache.get(cacheKey);
    if (entry && Date.now() - entry.timestamp < this.RENDER_CACHE_TTL_MS) {
      return entry;
    }
    return undefined;
  }

  /** Recarrega sprites de plantas/enfeites do disco (após upload no super-admin). */
  public static async reloadSprites(): Promise<void> {
    this.clearRenderCache();
    const assetsDir = path.resolve(config.ASSETS_PATH);
    for (const sub of ['plants', 'decorations']) {
      const dir = path.join(assetsDir, 'sprites', sub);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.png'))) {
        this.imageCache.set(f, await loadImage(path.join(dir, f)));
      }
    }
  }

  public static async init(): Promise<void> {
    if (this.initialized) return;

    const assetsDir = path.resolve(config.ASSETS_PATH);
    const bgDir = path.join(assetsDir, 'backgrounds');
    const plantsDir = path.join(assetsDir, 'sprites', 'plants');
    const decorDir = path.join(assetsDir, 'sprites', 'decorations');

    const bgs = ['farm_bg_day.png', 'farm_bg_dawn.png', 'farm_bg_night.png'];
    for (const bg of bgs) {
      const p = path.join(bgDir, bg);
      if (fs.existsSync(p)) {
        this.imageCache.set(bg, await loadImage(p));
      }
    }

    if (fs.existsSync(plantsDir)) {
      const plantFiles = fs.readdirSync(plantsDir).filter((f) => f.endsWith('.png'));
      for (const pf of plantFiles) {
        this.imageCache.set(pf, await loadImage(path.join(plantsDir, pf)));
      }
    }

    if (fs.existsSync(decorDir)) {
      const decorFiles = fs.readdirSync(decorDir).filter((f) => f.endsWith('.png'));
      for (const df of decorFiles) {
        this.imageCache.set(df, await loadImage(path.join(decorDir, df)));
      }
    }

    const fontCandidates = [
      '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    ];
    for (const fp of fontCandidates) {
      if (fs.existsSync(fp)) {
        try {
          GlobalFonts.registerFromPath(fp, 'DejaVuSans');
          break;
        } catch {}
      }
    }

    this.initialized = true;
  }

  public static async renderFarm(options: RenderFarmOptions): Promise<Buffer> {
    const cachedEntry = this.getRenderCacheEntry(options);
    if (cachedEntry) {
      return cachedEntry.buffer;
    }

    if (!this.initialized) {
      await this.init();
    }

    const timeCycle: TimeCycle = getCurrentTimeCycle(options.timeCycleOverride);
    const bgKey = `farm_bg_${timeCycle}.png`;
    const bgImage = this.imageCache.get(bgKey) || this.imageCache.get('farm_bg_day.png');

    const canvas = createCanvas(1024, 1024);
    const ctx = canvas.getContext('2d');

    // 1. Draw Background
    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, 1024, 1024);
    }

    const tooltipsToDraw: Array<{ cx: number; cy: number; text: string; style: number }> = [];
    const decors = options.decorations || [];

    // Separate decorations into background layer (y < 520) and foreground layer (y >= 520)
    const backDecors: Array<{ decorId: string; x: number; y: number }> = [];
    const frontDecors: Array<{ decorId: string; x: number; y: number }> = [];

    for (const d of decors) {
      let x = d.x;
      let y = d.y;

      if (x == null || y == null) {
        const def = this.DEFAULT_DECOR_COORDINATES[d.slotIndex] || this.DEFAULT_DECOR_COORDINATES[1];
        x = def.x;
        y = def.y;
      }

      if (y < 520) {
        backDecors.push({ decorId: d.decorId, x, y });
      } else {
        frontDecors.push({ decorId: d.decorId, x, y });
      }
    }

    // 2. Draw Back Decorations
    for (const d of backDecors) {
      this.drawDecoration(ctx, d.decorId, d.x, d.y);
    }

    // 3. Draw Farm Slots ordered by Z-Index (Top to Bottom)
    const sortedSlots = [...options.slots].sort((a, b) => {
      const za = this.SLOT_COORDINATES[a.slotIndex]?.zIndex ?? 0;
      const zb = this.SLOT_COORDINATES[b.slotIndex]?.zIndex ?? 0;
      return za - zb;
    });

    for (const slot of sortedSlots) {
      if ((slot.stage === 'empty' && !slot.isGhost) || !slot.plantId) continue;

      const coord = this.SLOT_COORDINATES[slot.slotIndex];
      if (!coord) continue;

      const plant = PLANTS[slot.plantId];
      if (!plant) continue;

      let spriteKey = `${plant.spriteBaseName}_${slot.stage}.png`;
      let isWithered = false;

      if (slot.isGhost) {
        spriteKey = `${plant.spriteBaseName}_ready.png`;
      } else if (slot.stage === 'withered') {
        spriteKey = `${plant.spriteBaseName}_growing.png`;
        isWithered = true;
      }

      const spriteImg = this.imageCache.get(spriteKey) || this.imageCache.get(`${plant.spriteBaseName}_ready.png`);
      if (!spriteImg) continue;

      // Standardized bounding box: ensures seeds are cute and small, growing and withered are medium, ready are full size
      const maxDim =
        slot.stage === 'ready' || slot.isGhost
          ? 420 * coord.scale
          : slot.stage === 'growing' || slot.stage === 'withered'
          ? 320 * coord.scale
          : 200 * coord.scale;
      const scale = Math.min(maxDim / spriteImg.width, maxDim / spriteImg.height);
      const w = spriteImg.width * scale;
      const h = spriteImg.height * scale;
      const drawX = coord.x - w / 2;
      const drawY = coord.y + 15 - h;

      if (slot.isGhost) {
        ctx.save();
        ctx.globalAlpha = 0.5; // Baixa opacidade de 50% (fantasma)
        ctx.shadowColor = '#ffd978';
        ctx.shadowBlur = 20;
        ctx.drawImage(spriteImg, drawX, drawY, w, h);
        ctx.restore();
      } else if (isWithered) {
        ctx.save();
        ctx.filter = 'grayscale(100%)';
        ctx.globalAlpha = 0.35;
        ctx.drawImage(spriteImg, drawX, drawY, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(spriteImg, drawX, drawY, w, h);
      }

      if (options.includeTooltips) {
        let text = slot.tooltipText;
        if (!text) {
          if (slot.isGhost) text = `[${slot.slotIndex}] ✦ ${t('tooltips.harvested', {}, 'Colhido!')}`;
          else if (slot.stage === 'ready') text = `[${slot.slotIndex}] ✦ Pronta`;
          else if (slot.stage === 'seed' || slot.stage === 'growing') text = `[${slot.slotIndex}] ☘ Em cultivo`;
          else if (slot.stage === 'withered') text = `[${slot.slotIndex}] ☠ Apodrecida`;
        }
        if (text) {
          // Dynamic style by stage:
          // Ghost -> Estilo 5 (Bold Ouro / Âmbar reluzente)
          // Ready -> Estilo 4 (Esmeralda vibrante)
          // Seed -> Estilo 9 (Ametista / Lilás místico)
          // Growing -> Estilo 3 (Minimalista dourado suave)
          // Withered -> Estilo 2 (Placa gótica escura)
          let stageStyle = slot.tooltipStyle || options.tooltipStyle;
          if (!stageStyle || stageStyle === 1) {
            if (slot.isGhost) stageStyle = 5;
            else if (slot.stage === 'ready') stageStyle = 4;
            else if (slot.stage === 'seed') stageStyle = 9;
            else if (slot.stage === 'growing') stageStyle = 3;
            else if (slot.stage === 'withered') stageStyle = 2;
            else stageStyle = 4;
          }

          tooltipsToDraw.push({
            cx: coord.x,
            cy: drawY - 12,
            text,
            style: stageStyle,
          });
        }
      }
    }

    // 4. Draw Front Decorations
    for (const d of frontDecors) {
      this.drawDecoration(ctx, d.decorId, d.x, d.y);
    }

    // 5. Draw Tooltips
    for (const t of tooltipsToDraw) {
      this.drawTooltip(ctx, t.cx, t.cy, t.text, t.style);
    }

    // 6. Draw User Header Banner at the top (Padrão: Gothic Elegance Style 3)
    if (options.userName) {
      this.drawUserHeader(ctx, options.userName, options.headerStyle || 3);
    }

    const buffer = canvas.toBuffer('image/jpeg', 85);
    const etag = `"${crypto.createHash('md5').update(buffer).digest('hex')}"`;
    const cacheKey = this.computeFarmCacheKey(options);

    if (this.renderCache.size >= this.RENDER_CACHE_MAX_SIZE) {
      const oldestKey = this.renderCache.keys().next().value;
      if (oldestKey) this.renderCache.delete(oldestKey);
    }
    this.renderCache.set(cacheKey, { buffer, etag, timestamp: Date.now() });

    return buffer;
  }

  /**
   * Draw a decoration centered horizontally at x and with base at y.
   * Target size is around 10% of total canvas (approx 100-110px).
   */
  private static drawDecoration(ctx: any, decorId: string, x: number, y: number): void {
    const decorDef = DECORATIONS[decorId];
    if (!decorDef) return;

    const img = this.imageCache.get(`${decorDef.spriteName}.png`);
    if (!img) return;

    // ~16% of 1024 is ~165px target bounding box (+50% scale increase)
    const maxDimension = 165;
    const scale = Math.min(maxDimension / img.width, maxDimension / img.height);
    const w = img.width * scale;
    const h = img.height * scale;

    const drawX = x - w / 2;
    const drawY = y - h;

    ctx.drawImage(img, drawX, drawY, w, h);
  }

  /**
   * Draw an embedded tooltip badge above a plant slot on the farm canvas.
   */
  private static drawTooltip(ctx: any, cx: number, cy: number, text: string, styleId: number = 1): void {
    ctx.save();

    if (styleId === 2) {
      // Estilo 2: Placa Gótica Dark Purple chanfrada (16px)
      ctx.font = 'bold 16px DejaVuSans, sans-serif';
      const tw = ctx.measureText(text).width;
      const pw = tw + 22;
      const ph = 28;
      const px = cx - pw / 2;
      const py = cy - ph / 2;

      ctx.fillStyle = '#1c102b';
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 4);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);

    } else if (styleId === 3) {
      // Estilo 3: Minimalista Dark Glow (16px)
      ctx.font = 'bold 16px DejaVuSans, sans-serif';
      const tw = ctx.measureText(text).width;
      const pw = tw + 22;
      const ph = 28;
      const px = cx - pw / 2;
      const py = cy - ph / 2;

      ctx.fillStyle = 'rgba(6, 4, 10, 0.9)';
      ctx.strokeStyle = 'rgba(255, 217, 120, 0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fceabb';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);

    } else if (styleId === 4) {
      // Estilo 4: Pill Esmeralda / Ouro (16px)
      ctx.font = 'bold 16px DejaVuSans, sans-serif';
      const tw = ctx.measureText(text).width;
      const pw = tw + 22;
      const ph = 28;
      const px = cx - pw / 2;
      const py = cy - ph / 2;

      ctx.fillStyle = 'rgba(12, 10, 18, 0.95)';
      ctx.strokeStyle = '#55f3a0';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 14);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#55f3a0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);

    } else if (styleId === 5) {
      // Estilo 5: Bold Ouro Grande (17px) - Máxima legibilidade
      ctx.font = 'bold 17px DejaVuSans, sans-serif';
      const tw = ctx.measureText(text).width;
      const pw = tw + 24;
      const ph = 30;
      const px = cx - pw / 2;
      const py = cy - ph / 2;

      ctx.fillStyle = 'rgba(10, 6, 16, 0.96)';
      ctx.strokeStyle = '#ffd978';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 15);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd978';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);

    } else if (styleId === 6) {
      // Estilo 6: Dark Neon Ametista (15px)
      ctx.font = 'bold 15px DejaVuSans, sans-serif';
      const tw = ctx.measureText(text).width;
      const pw = tw + 22;
      const ph = 26;
      const px = cx - pw / 2;
      const py = cy - ph / 2;

      ctx.fillStyle = 'rgba(20, 10, 35, 0.94)';
      ctx.strokeStyle = '#b25aff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(178, 90, 255, 0.7)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 13);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#f3e5ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);

    } else if (styleId === 7) {
      // Estilo 7: Super Compacto Discreto (12px)
      ctx.font = 'bold 12px DejaVuSans, sans-serif';
      const tw = ctx.measureText(text).width;
      const pw = tw + 16;
      const ph = 20;
      const px = cx - pw / 2;
      const py = cy - ph / 2;

      ctx.fillStyle = 'rgba(12, 8, 18, 0.92)';
      ctx.strokeStyle = '#e6c36a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#dfd7cc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);

    } else if (styleId === 8) {
      // Estilo 8: Pill Dourado com Texto Branco (15px)
      ctx.font = 'bold 15px DejaVuSans, sans-serif';
      const tw = ctx.measureText(text).width;
      const pw = tw + 20;
      const ph = 26;
      const px = cx - pw / 2;
      const py = cy - ph / 2;

      ctx.fillStyle = 'rgba(16, 12, 24, 0.94)';
      ctx.strokeStyle = '#ffd978';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 13);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);

    } else if (styleId === 9) {
      // Estilo 9: Pill Ametista com Texto Branco (16px)
      ctx.font = 'bold 16px DejaVuSans, sans-serif';
      const tw = ctx.measureText(text).width;
      const pw = tw + 22;
      const ph = 28;
      const px = cx - pw / 2;
      const py = cy - ph / 2;

      ctx.fillStyle = 'rgba(10, 8, 16, 0.95)';
      ctx.strokeStyle = '#9c88ff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);

    } else {
      // Estilo 1 (Padrão): Pill Dark Dourado Fino (14px)
      ctx.font = 'bold 14px DejaVuSans, sans-serif';
      const tw = ctx.measureText(text).width;
      const pw = tw + 20;
      const ph = 24;
      const px = cx - pw / 2;
      const py = cy - ph / 2;

      ctx.fillStyle = 'rgba(10, 7, 16, 0.94)';
      ctx.strokeStyle = '#ffd978';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 12);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd978';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);
    }

    ctx.restore();
  }

  /**
   * Render an item sticker image (512x512) with transparent background
   * and quantity badge (e.g. "💰 x3") at the bottom.
   */
  public static async renderItemBadge(spriteName: string, quantity: number): Promise<Buffer> {
    if (!this.initialized) {
      await this.init();
    }

    const size = 512;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    const img = this.imageCache.get(spriteName);
    if (img) {
      const maxDim = 380;
      const scale = Math.min(maxDim / img.width, maxDim / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (size - w) / 2;
      const y = (size - 100 - h) / 2 + 10;
      ctx.drawImage(img, x, y, w, h);
    }

    // Badge at bottom: Gold coin icon + "xQuantity" with universal Canvas vectors
    const qtyText = `x${quantity}`;
    ctx.font = 'bold 34px DejaVuSans, "DejaVu Sans", sans-serif';
    const textMetrics = ctx.measureText(qtyText);
    const badgeW = Math.max(130, textMetrics.width + 80);
    const badgeH = 56;
    const badgeX = (size - badgeW) / 2;
    const badgeY = size - 78;

    // Draw dark rounded pill background with golden border
    ctx.save();
    ctx.fillStyle = 'rgba(15, 10, 24, 0.95)';
    ctx.strokeStyle = '#ffd978';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 12;

    const r = badgeH / 2;
    ctx.beginPath();
    ctx.arc(badgeX + r, badgeY + r, r, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.arc(badgeX + badgeW - r, badgeY + r, r, (3 * Math.PI) / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Draw Gold Coin Icon inside the pill
    ctx.save();
    const coinR = 15;
    const coinX = badgeX + 30;
    const coinY = badgeY + badgeH / 2;
    ctx.beginPath();
    ctx.arc(coinX, coinY, coinR, 0, Math.PI * 2);
    ctx.fillStyle = '#f5c518';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#b8860b';
    ctx.stroke();

    // Inner ring
    ctx.beginPath();
    ctx.arc(coinX, coinY, coinR - 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd978';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Coin symbol
    ctx.fillStyle = '#614100';
    ctx.font = 'bold 15px DejaVuSans, "DejaVu Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', coinX, coinY + 1);
    ctx.restore();

    // Draw badge text "xN"
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px DejaVuSans, "DejaVu Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;
    ctx.fillText(qtyText, badgeX + 54, badgeY + badgeH / 2 + 1);
    ctx.restore();

    return canvas.toBuffer('image/png');
  }

  /**
   * Draw user header banner at the top of the farm image.
   * Padrão: Estilo 3 (Gothic Elegance - Borda Dupla Dourada, Losangos ✦ e Glow Dourado)
   */
  public static drawUserHeader(ctx: any, userName: string, style: number = 3): void {
    if (!userName || !userName.trim()) return;
    const name = userName.trim();

    switch (style) {
      case 2:
        this.drawUserHeaderStyle2(ctx, name);
        break;
      case 4:
        this.drawUserHeaderStyle4(ctx, name);
        break;
      case 3:
      case 1:
      default:
        this.drawUserHeaderStyle3(ctx, name);
        break;
    }
  }

  /**
   * Versão 1: Pill com Borda Violeta Claro e Nome do Usuário
   */
  public static drawUserHeaderStyle1(ctx: any, userName: string): void {
    ctx.save();
    ctx.font = 'bold 30px DejaVuSans, "DejaVu Sans", sans-serif';
    const textMetrics = ctx.measureText(userName);
    const badgeW = Math.max(180, textMetrics.width + 68);
    const badgeH = 58;
    const badgeX = (1024 - badgeW) / 2;
    const badgeY = 32;

    // Dark rounded pill background with light violet border
    ctx.fillStyle = 'rgba(15, 10, 24, 0.95)';
    ctx.strokeStyle = '#ba89ff';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 14;

    const r = badgeH / 2;
    ctx.beginPath();
    ctx.arc(badgeX + r, badgeY + r, r, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.arc(badgeX + badgeW - r, badgeY + r, r, (3 * Math.PI) / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Text: User Name (centralizado, sem ícone)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px DejaVuSans, "DejaVu Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;
    ctx.fillText(userName, 512, badgeY + badgeH / 2 + 1);

    ctx.restore();
  }

  /**
   * Versão 2: "Brasão Real / Fazenda de [Nome]" com morcego 🦇 e texto estilizado
   */
  public static drawUserHeaderStyle2(ctx: any, userName: string): void {
    ctx.save();
    const prefix = 'FAZENDA DE ';
    const upperName = userName.toUpperCase();

    ctx.font = 'bold 17px DejaVuSans, sans-serif';
    const prefixW = ctx.measureText(prefix).width;
    ctx.font = '900 28px DejaVuSans, sans-serif';
    const nameW = ctx.measureText(upperName).width;

    const totalTextW = prefixW + nameW;
    const badgeW = Math.max(300, totalTextW + 115);
    const badgeH = 62;
    const badgeX = (1024 - badgeW) / 2;
    const badgeY = 30;

    // Gradient background
    const grad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
    grad.addColorStop(0, '#26163b');
    grad.addColorStop(1, '#0e0818');

    ctx.fillStyle = grad;
    ctx.strokeStyle = '#ffd978';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 16;

    const r = badgeH / 2;
    ctx.beginPath();
    ctx.arc(badgeX + r, badgeY + r, r, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.arc(badgeX + badgeW - r, badgeY + r, r, (3 * Math.PI) / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner delicate gold contour
    ctx.strokeStyle = 'rgba(255, 217, 120, 0.35)';
    ctx.lineWidth = 1.5;
    const ir = r - 5;
    ctx.beginPath();
    ctx.arc(badgeX + r, badgeY + r, ir, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.arc(badgeX + badgeW - r, badgeY + r, ir, (3 * Math.PI) / 2, Math.PI / 2);
    ctx.closePath();
    ctx.stroke();

    // Bat / gothic icon badge on left
    const iconR = 18;
    const iconX = badgeX + 35;
    const iconY = badgeY + badgeH / 2;
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 217, 120, 0.15)';
    ctx.fill();
    ctx.strokeStyle = '#ffd978';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vector bat emblem
    ctx.fillStyle = '#ffd978';
    ctx.beginPath();
    ctx.moveTo(iconX, iconY + 3);
    ctx.quadraticCurveTo(iconX - 6, iconY - 7, iconX - 11, iconY - 3);
    ctx.quadraticCurveTo(iconX - 7, iconY + 1, iconX - 4, iconY + 5);
    ctx.quadraticCurveTo(iconX - 2, iconY + 2, iconX, iconY + 4);
    ctx.quadraticCurveTo(iconX + 2, iconY + 2, iconX + 4, iconY + 5);
    ctx.quadraticCurveTo(iconX + 7, iconY + 1, iconX + 11, iconY - 3);
    ctx.quadraticCurveTo(iconX + 6, iconY - 7, iconX, iconY + 3);
    ctx.closePath();
    ctx.fill();

    // Prefix text "FAZENDA DE " in soft gold
    ctx.font = 'bold 17px DejaVuSans, sans-serif';
    ctx.fillStyle = '#e5c98f';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 6;
    const startTextX = badgeX + 70;
    ctx.fillText(prefix, startTextX, badgeY + badgeH / 2 + 1);

    // Name text in bright white with golden shadow
    ctx.font = '900 28px DejaVuSans, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255, 217, 120, 0.4)';
    ctx.shadowBlur = 8;
    ctx.fillText(upperName, startTextX + prefixW, badgeY + badgeH / 2 + 1);

    ctx.restore();
  }

  /**
   * Versão 3: "Gothic Elegance (Borda Dupla & Losangos Dourados ✦)"
   */
  public static drawUserHeaderStyle3(ctx: any, userName: string): void {
    ctx.save();
    const displayName = `✦  ${userName.toUpperCase()}  ✦`;
    ctx.font = 'bold 28px DejaVuSans, sans-serif';
    const textMetrics = ctx.measureText(displayName);
    const badgeW = Math.max(260, textMetrics.width + 65);
    const badgeH = 54;
    const badgeX = (1024 - badgeW) / 2;
    const badgeY = 34;

    // Dark obsidian background with golden glow
    ctx.fillStyle = 'rgba(12, 8, 20, 0.96)';
    ctx.strokeStyle = '#ffd978';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(255, 217, 120, 0.35)';
    ctx.shadowBlur = 14;

    const r = badgeH / 2;
    ctx.beginPath();
    ctx.arc(badgeX + r, badgeY + r, r, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.arc(badgeX + badgeW - r, badgeY + r, r, (3 * Math.PI) / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner delicate gold contour
    ctx.strokeStyle = 'rgba(255, 217, 120, 0.45)';
    ctx.lineWidth = 1;
    const ir = r - 4;
    ctx.beginPath();
    ctx.arc(badgeX + r, badgeY + r, ir, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.arc(badgeX + badgeW - r, badgeY + r, ir, (3 * Math.PI) / 2, Math.PI / 2);
    ctx.closePath();
    ctx.stroke();

    // Text in antique ivory/gold
    ctx.fillStyle = '#fff4db';
    ctx.font = 'bold 28px DejaVuSans, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;
    ctx.fillText(displayName, 512, badgeY + badgeH / 2 + 1);

    ctx.restore();
  }

  /**
   * Versão 4: "Banner Compacto & Discreto (Glass Dourado com Mini-Tag)"
   */
  public static drawUserHeaderStyle4(ctx: any, userName: string): void {
    ctx.save();
    const tag = 'JARDIM DE';
    ctx.font = 'bold 15px DejaVuSans, sans-serif';
    const tagW = ctx.measureText(tag).width;
    ctx.font = 'bold 25px DejaVuSans, sans-serif';
    const nameW = ctx.measureText(userName).width;

    const badgeW = Math.max(250, tagW + nameW + 90);
    const badgeH = 48;
    const badgeX = (1024 - badgeW) / 2;
    const badgeY = 36;

    // Semi-translucent glass background
    ctx.fillStyle = 'rgba(16, 11, 24, 0.88)';
    ctx.strokeStyle = '#e6c358';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;

    const r = badgeH / 2;
    ctx.beginPath();
    ctx.arc(badgeX + r, badgeY + r, r, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.arc(badgeX + badgeW - r, badgeY + r, r, (3 * Math.PI) / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mini tag pill inside on left
    const miniTagW = tagW + 18;
    const miniTagH = 28;
    const miniTagX = badgeX + 10;
    const miniTagY = badgeY + (badgeH - miniTagH) / 2;
    const mtr = miniTagH / 2;

    ctx.fillStyle = 'rgba(255, 217, 120, 0.2)';
    ctx.strokeStyle = '#ffd978';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(miniTagX + mtr, miniTagY + mtr, mtr, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.arc(miniTagX + miniTagW - mtr, miniTagY + mtr, mtr, (3 * Math.PI) / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tag text
    ctx.fillStyle = '#ffd978';
    ctx.font = 'bold 14px DejaVuSans, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, miniTagX + miniTagW / 2, miniTagY + miniTagH / 2 + 1);

    // Name text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 25px DejaVuSans, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 6;
    ctx.fillText(userName, miniTagX + miniTagW + 14, badgeY + badgeH / 2 + 1);

    ctx.restore();
  }
}
