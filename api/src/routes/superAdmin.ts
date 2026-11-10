import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { config } from '../config.js';
import { loadCatalog, PLANTS, DECORATIONS, CONSUMABLES } from '../utils/catalog.js';
import { CanvasRendererService } from '../services/CanvasRendererService.js';
import { loadEconomy } from '../utils/economy.js';
import { loadTexts, saveTexts, getTexts } from '../utils/texts.js';
import { SUPER_ADMIN_HTML } from './views/superAdminView.js';

interface FailedAttempt {
  count: number;
  blockedUntil: number;
}
const failedAttemptsByIp = new Map<string, FailedAttempt>();

function isIpBlocked(ip: string): boolean {
  const attempt = failedAttemptsByIp.get(ip);
  if (!attempt) return false;
  if (Date.now() < attempt.blockedUntil) return true;
  if (Date.now() >= attempt.blockedUntil && attempt.blockedUntil > 0) {
    failedAttemptsByIp.delete(ip);
    return false;
  }
  return false;
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const attempt = failedAttemptsByIp.get(ip) || { count: 0, blockedUntil: 0 };
  attempt.count += 1;
  if (attempt.count >= 10) {
    attempt.blockedUntil = now + 15 * 60 * 1000; // 15 minutos de bloqueio
  }
  failedAttemptsByIp.set(ip, attempt);
}

function clearFailedAttempts(ip: string): void {
  failedAttemptsByIp.delete(ip);
}

function checkPassword(provided: unknown): boolean {
  const expected = config.SUPER_ADMIN_PASSWORD;
  if (!expected || typeof provided !== 'string') return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function readJsonFile(file: string): any[] {
  return JSON.parse(fs.readFileSync(path.join(config.DATA_PATH, file), 'utf-8'));
}

function writeJsonFile(file: string, data: unknown): void {
  const full = path.join(config.DATA_PATH, file);
  fs.writeFileSync(full + '.tmp', JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(full + '.tmp', full);
}

/**
 * Processa um PNG/JPG/WebP enviado: corta margens transparentes, limita a 600px
 * no maior lado e re-encoda como PNG com alpha.
 */
async function processSprite(base64: string): Promise<Buffer> {
  const raw = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (raw.length > 10 * 1024 * 1024) {
    throw new Error('Arquivo de imagem muito grande. O limite máximo é 10MB.');
  }
  const img = await loadImage(raw);
  const w = img.width;
  const h = img.height;

  const src = createCanvas(w, h);
  const sctx = src.getContext('2d');
  sctx.drawImage(img, 0, 0);
  const data = sctx.getImageData(0, 0, w, h).data;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const scale = Math.min(1, 600 / Math.max(cw, ch));
  const ow = Math.max(1, Math.round(cw * scale));
  const oh = Math.max(1, Math.round(ch * scale));

  const out = createCanvas(ow, oh);
  out.getContext('2d').drawImage(src, minX, minY, cw, ch, 0, 0, ow, oh);
  return out.toBuffer('image/png');
}

function nextIndex(): number {
  const all = [...readJsonFile('plants.json'), ...readJsonFile('decorations.json')];
  return all.reduce((m, e) => Math.max(m, e.index), 0) + 1;
}

const num = (v: unknown, name: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Campo inválido: ${name}`);
  return n;
};

export async function superAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/super-admin', async (_req, reply) => {
    reply.header(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline'; img-src * data: blob:; script-src 'self' 'unsafe-inline'; script-src-attr 'unsafe-inline'"
    );
    return reply.type('text/html').send(SUPER_ADMIN_HTML);
  });

  // Auth hook para a API do painel
  fastify.register(async (api) => {
    api.addHook('preHandler', async (req, reply) => {
      const clientIp = req.ip || 'unknown';
      if (isIpBlocked(clientIp)) {
        return reply.code(429).send({ message: 'Muitas tentativas incorretas. Bloqueado temporariamente por 15 minutos.' });
      }
      if (!config.SUPER_ADMIN_PASSWORD) {
        return reply.code(403).send({ message: 'SUPER_ADMIN_PASSWORD não configurada no .env' });
      }
      if (!checkPassword(req.headers['x-admin-password'])) {
        recordFailedAttempt(clientIp);
        return reply.code(401).send({ message: 'Senha inválida' });
      }
      clearFailedAttempts(clientIp);
    });

    api.get('/super-admin/api/data', async () => ({
      texts: getTexts(),
      plants: readJsonFile('plants.json'),
      decorations: readJsonFile('decorations.json'),
      consumables: fs.existsSync(path.join(config.DATA_PATH, 'consumables.json'))
        ? readJsonFile('consumables.json')
        : [],
    }));

    api.put<{ Body: any }>('/super-admin/api/texts', async (req, reply) => {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.code(400).send({ message: 'JSON de textos inválido' });
      }
      saveTexts(body as any);
      return { ok: true };
    });

    api.post('/super-admin/api/reload', async () => {
      loadCatalog();
      loadTexts();
      loadEconomy();
      await CanvasRendererService.reloadSprites();
      return { ok: true, plants: Object.keys(PLANTS).length, decorations: Object.keys(DECORATIONS).length, consumables: Object.keys(CONSUMABLES).length };
    });

    api.post<{ Body: any }>(
      '/super-admin/api/plants',
      { bodyLimit: 30 * 1024 * 1024 },
      async (req, reply) => {
        try {
          const b: any = req.body || {};
          const id = String(b.id || '').trim();
          if (!/^[a-z0-9_]+$/.test(id)) throw new Error('ID deve conter apenas a-z, 0-9 e _');
          const list = readJsonFile('plants.json');
          const existing = list.find((p) => p.id === id);
          const sprites = b.sprites || {};
          const stages = ['seed', 'growing', 'ready'];
          if (!existing && !stages.every((s) => sprites[s])) {
            throw new Error('Nova planta exige os 3 sprites (semente, crescendo, pronta)');
          }

          const entry = {
            ...(existing?.key ? { key: existing.key } : {}),
            index: existing ? existing.index : nextIndex(),
            id,
            name: String(b.name || '').trim() || id,
            category: String(b.category || 'economia'),
            seedPrice: num(b.seedPrice, 'seedPrice'),
            sellPrice: num(b.sellPrice, 'sellPrice'),
            growthTimeSeconds: num(b.growthTimeSeconds, 'growthTimeSeconds'),
            witherTimeSeconds: num(b.witherTimeSeconds, 'witherTimeSeconds'),
            coinReward: num(b.coinReward, 'coinReward'),
            bonusType: String(b.bonusType || 'coins'),
            bonusDescription: String(b.bonusDescription || ''),
            dailyLimit: b.dailyLimit === '' || b.dailyLimit == null ? 10 : num(b.dailyLimit, 'dailyLimit'),
            dailyBagTier: ['common', 'uncommon', 'rare', 'epic'].includes(b.dailyBagTier) ? b.dailyBagTier : null,
            spriteBaseName: existing?.spriteBaseName || id,
          };

          const dir = path.join(config.ASSETS_PATH, 'sprites', 'plants');
          fs.mkdirSync(dir, { recursive: true });
          for (const s of stages) {
            if (sprites[s]) {
              fs.writeFileSync(path.join(dir, `${entry.spriteBaseName}_${s}.png`), await processSprite(sprites[s]));
            }
          }

          const next = existing ? list.map((p) => (p.id === id ? entry : p)) : [...list, entry];
          writeJsonFile('plants.json', next);
          loadCatalog();
          await CanvasRendererService.reloadSprites();
          return { ok: true, plant: entry };
        } catch (err: any) {
          return reply.code(400).send({ message: err.message });
        }
      }
    );

    api.post<{ Body: any }>(
      '/super-admin/api/decorations',
      { bodyLimit: 30 * 1024 * 1024 },
      async (req, reply) => {
        try {
          const b: any = req.body || {};
          const id = String(b.id || '').trim();
          if (!/^[a-z0-9_]+$/.test(id)) throw new Error('ID deve conter apenas a-z, 0-9 e _');
          const list = readJsonFile('decorations.json');
          const existing = list.find((d) => d.id === id);
          if (!existing && !b.sprite) throw new Error('Novo enfeite exige o sprite');

          const entry = {
            ...(existing?.key ? { key: existing.key } : {}),
            index: existing ? existing.index : nextIndex(),
            id,
            name: String(b.name || '').trim() || id,
            tier: String(b.tier || 'simples'),
            price: num(b.price, 'price'),
            sellPrice: num(b.sellPrice, 'sellPrice'),
            spriteName: existing?.spriteName || id,
          };

          if (b.sprite) {
            const dir = path.join(config.ASSETS_PATH, 'sprites', 'decorations');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `${entry.spriteName}.png`), await processSprite(b.sprite));
          }

          const next = existing ? list.map((d) => (d.id === id ? entry : d)) : [...list, entry];
          writeJsonFile('decorations.json', next);
          loadCatalog();
          await CanvasRendererService.reloadSprites();
          return { ok: true, decoration: entry };
        } catch (err: any) {
          return reply.code(400).send({ message: err.message });
        }
      }
    );

    api.post<{ Body: any }>(
      '/super-admin/api/consumables',
      { bodyLimit: 30 * 1024 * 1024 },
      async (req, reply) => {
        try {
          const b: any = req.body || {};
          const id = String(b.id || '').trim();
          if (!/^[a-z0-9_]+$/.test(id)) throw new Error('ID deve conter apenas a-z, 0-9 e _');
          const listPath = path.join(config.DATA_PATH, 'consumables.json');
          const list = fs.existsSync(listPath) ? readJsonFile('consumables.json') : [];
          const existing = list.find((c: any) => c.id === id);

          const entry = {
            index: existing ? existing.index : (list.length > 0 ? Math.max(...list.map((c: any) => c.index)) + 1 : 31),
            id,
            name: String(b.name || '').trim() || id,
            color: String(b.color || '').trim(),
            effect: String(b.effect || 'none').trim(),
            description: String(b.description || '').trim(),
            price: Number(b.price) || 0,
            dailyLimit: Number(b.dailyLimit) || 0,
            spriteName: existing?.spriteName || id,
          };

          if (b.sprite) {
            const dir = path.join(config.ASSETS_PATH, 'sprites', 'consumables');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `${entry.spriteName}.png`), await processSprite(b.sprite));
          }

          const next = existing ? list.map((c: any) => (c.id === id ? entry : c)) : [...list, entry];
          writeJsonFile('consumables.json', next);
          loadCatalog();
          return { ok: true, consumable: entry };
        } catch (err: any) {
          return reply.code(400).send({ message: err.message });
        }
      }
    );
  });

  // Textos públicos (consumidos pelo bot para emojis/nome do jogo)
  fastify.get('/texts', async () => getTexts());
}
