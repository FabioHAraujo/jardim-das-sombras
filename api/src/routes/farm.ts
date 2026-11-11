import path from 'path';
import fs from 'fs';
import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { FarmService } from '../services/FarmService.js';
import { CanvasRendererService } from '../services/CanvasRendererService.js';
import { requireAuth } from '../plugins/auth.js';
import { config } from '../config.js';
import { t } from '../utils/texts.js';
import { findPlant } from '../utils/catalog.js';
import { generateAdminToken, verifyAdminToken } from '../utils/token.js';
import { ShopService } from '../services/ShopService.js';
import { getCurrentTimeCycle } from '../utils/timeCycle.js';
import { renderAdminFarmHtml } from './views/adminFarmView.js';
import {
  renderPublicFarmHtml,
  renderPublicFarmEmpty,
  renderPublicFarmNotFound,
} from './views/publicFarmView.js';
import { renderCalibrateHtml } from './views/calibrateView.js';

export const farmRoutes: FastifyPluginAsync = async (fastify) => {
  const farmService = new FarmService(fastify.prisma);
  const shopService = new ShopService(fastify.prisma);

  function formatConciseTime(totalSeconds: number): string {
    if (totalSeconds <= 0) return '0s';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h${minutes > 0 ? minutes + 'm' : ''}`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  function streamStaticAsset(reply: FastifyReply, subDir: string, filename: string) {
    if (!/^[a-zA-Z0-9_\-\.]+\.png$/.test(filename) || filename.includes('..')) {
      return reply.status(400).send({ error: 'Nome de arquivo inválido' });
    }
    const filePath = path.join(path.resolve(config.ASSETS_PATH), subDir, filename);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send('Not found');
    }
    return reply
      .header('Content-Type', 'image/png')
      .header('Cache-Control', 'public, max-age=86400, immutable')
      .send(fs.createReadStream(filePath));
  }

  // Assets estáticos (sprites, fundos, ícones) ficam fora do rate limit global:
  // uma única carga do painel dispara dezenas de requisições de imagem, o que
  // estourava o limite de 120 req/min após 2–3 recarregamentos e quebrava os sprites com 429.
  // Os arquivos são servidos com Cache-Control immutable e nomes validados por regex.
  const staticRouteOpts = { config: { rateLimit: false } } as const;

  // GET /favicon.svg
  fastify.get('/favicon.svg', staticRouteOpts, async (_req, reply) => {
    reply.header('Content-Type', 'image/svg+xml');
    reply.header('Cache-Control', 'public, max-age=86400');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🥀</text></svg>`;
  });

  fastify.get('/favicon.ico', staticRouteOpts, async (_req, reply) => {
    return reply.redirect('/favicon.svg', 302);
  });

  // GET /farm/:user_id
  fastify.get<{ Params: { user_id: string }; Querystring: { include_image?: string; time_override?: string } }>(
    '/farm/:user_id',
    async (req, reply) => {
      const status = await farmService.getFarmStatus(req.params.user_id);
      const shareUrl = `${config.PUBLIC_URL}/farm?id=${status.uuid}`;

      if (req.query.include_image === 'base64') {
        const imageBuffer = await CanvasRendererService.renderFarm({
          slots: status.slots.map((s) => ({
            slotIndex: s.slotIndex,
            plantId: s.plantId,
            stage: s.stage as any,
          })),
          decorations: status.decorations.map((d) => ({
            slotIndex: d.slotIndex,
            decorId: d.decorId,
            x: d.x,
            y: d.y,
          })),
          timeCycleOverride: req.query.time_override,
        });

        return reply.send({
          ...status,
          shareUrl,
          image: `data:image/png;base64,${imageBuffer.toString('base64')}`,
        });
      }

      return reply.send({
        ...status,
        shareUrl,
      });
    }
  );

  // GET /farm/:user_id/image (Com Cache LRU e Suporte a ETag / 304)
  fastify.get<{
    Params: { user_id: string };
    Querystring: {
      format?: string;
      time_override?: string;
      tooltips?: string | boolean;
      include_tooltips?: string | boolean;
      tooltip_style?: string | number;
      user_name?: string;
      header_style?: string | number;
      harvested_slots?: string;
      planted_slots?: string;
    };
  }>(
    '/farm/:user_id/image',
    async (req, reply) => {
      const status = await farmService.getFarmStatus(req.params.user_id);
      const withTooltips =
        req.query.tooltips === 'false' || req.query.tooltips === '0' || req.query.include_tooltips === 'false' || req.query.include_tooltips === '0'
          ? false
          : true;
      const tooltipStyle = req.query.tooltip_style ? Number(req.query.tooltip_style) : 1;
      const userName = req.query.user_name?.trim() || undefined;
      const headerStyle = req.query.header_style ? Number(req.query.header_style) : undefined;

      // Parse harvested slots: comma-separated pairs (slot:plantId) or slot numbers
      // e.g. "1:01_nightshade,2:02_tomb_shroom"
      const harvestedMap = new Map<number, string>();
      if (req.query.harvested_slots) {
        const parts = String(req.query.harvested_slots).split(',').filter(Boolean);
        for (const p of parts) {
          const [sStr, pStr] = p.split(':');
          const sIdx = parseInt(sStr, 10);
          if (!isNaN(sIdx)) {
            const resolvedPlant = pStr ? findPlant(pStr.trim()) : undefined;
            harvestedMap.set(sIdx, resolvedPlant ? resolvedPlant.id : (pStr?.trim() || '01_nightshade'));
          }
        }
      }

      // Parse planted slots: comma-separated slot indices
      // e.g. "1,2,3"
      const plantedSet = new Set<number>();
      if (req.query.planted_slots) {
        const parts = String(req.query.planted_slots).split(',').filter(Boolean);
        for (const p of parts) {
          const sIdx = parseInt(p.trim(), 10);
          if (!isNaN(sIdx)) {
            plantedSet.add(sIdx);
          }
        }
      }

      const renderOptions = {
        slots: status.slots.map((s) => {
          let tooltipText: string | undefined;
          let slotTooltipStyle: number | undefined;
          let isGhost: boolean | undefined;
          let plantId = s.plantId;

          if (harvestedMap.has(s.slotIndex)) {
            isGhost = true;
            plantId = harvestedMap.get(s.slotIndex) || plantId;
            tooltipText = `[${s.slotIndex}] ✦ ${t('tooltips.harvested', {}, 'Colhido!')}`;
            slotTooltipStyle = 5; // Gold style
          } else if (plantedSet.has(s.slotIndex)) {
            tooltipText = `[${s.slotIndex}] ✦ ${t('tooltips.planted', {}, 'Plantada!')}`;
            slotTooltipStyle = 4; // Emerald green style
          } else if (withTooltips) {
            const plantDef = s.plantId ? findPlant(s.plantId) : undefined;
            if (s.stage === 'ready') {
              const timeStr = s.remainingSecondsToWither ? ` (${formatConciseTime(s.remainingSecondsToWither)})` : '';
              tooltipText = `[${s.slotIndex}] ${t('tooltips.ready')}${timeStr}`;
            } else if (s.stage === 'seed' || s.stage === 'growing') {
              const timeStr = s.remainingSecondsToHarvest ? formatConciseTime(s.remainingSecondsToHarvest) : '...';
              const witherStr = plantDef?.witherTimeSeconds ? ` | 💀 ${formatConciseTime(plantDef.witherTimeSeconds)}` : '';
              tooltipText = `[${s.slotIndex}] ${t('tooltips.' + s.stage, { time: timeStr })}${witherStr}`;
            } else if (s.stage === 'withered') {
              tooltipText = `[${s.slotIndex}] ${t('tooltips.withered')}`;
            }
          }
          return {
            slotIndex: s.slotIndex,
            plantId,
            stage: s.stage as any,
            tooltipText,
            tooltipStyle: slotTooltipStyle,
            isGhost,
          };
        }),
        decorations: status.decorations.map((d) => ({
          slotIndex: d.slotIndex,
          decorId: d.decorId,
          x: d.x,
          y: d.y,
        })),
        timeCycleOverride: req.query.time_override,
        includeTooltips: withTooltips,
        tooltipStyle,
        userName,
        headerStyle,
      };

      const cached = CanvasRendererService.getRenderCacheEntry(renderOptions);
      if (cached) {
        if (req.headers['if-none-match'] === cached.etag) {
          return reply.status(304).send();
        }
        if (req.query.format === 'base64') {
          return reply.send({ image: `data:image/jpeg;base64,${cached.buffer.toString('base64')}` });
        }
        return reply
          .header('Content-Type', 'image/jpeg')
          .header('ETag', cached.etag)
          .header('Cache-Control', 'public, max-age=15')
          .send(cached.buffer);
      }

      const imageBuffer = await CanvasRendererService.renderFarm(renderOptions);
      const entry = CanvasRendererService.getRenderCacheEntry(renderOptions);
      const etag = entry?.etag || `"farm-${Date.now()}"`;

      if (req.query.format === 'base64') {
        return reply.send({
          image: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
        });
      }

      return reply
        .header('Content-Type', 'image/jpeg')
        .header('ETag', etag)
        .header('Cache-Control', 'public, max-age=15')
        .send(imageBuffer);
    }
  );

  // GET /farm/share/image?id=... (Render por UUID público com ETag)
  fastify.get<{
    Querystring: {
      id: string;
      time_override?: string;
      tooltips?: string | boolean;
      include_tooltips?: string | boolean;
      tooltip_style?: string | number;
      user_name?: string;
      header_style?: string | number;
      harvested_slots?: string;
      planted_slots?: string;
    };
  }>(
    '/farm/share/image',
    async (req, reply) => {
      const uuid = req.query.id;
      if (!uuid) {
        return reply.status(400).send({ error: 'UUID da fazenda é obrigatório' });
      }

      const status = await farmService.getFarmStatusByUuid(uuid);
      const withTooltips =
        req.query.tooltips === 'false' || req.query.tooltips === '0' || req.query.include_tooltips === 'false' || req.query.include_tooltips === '0'
          ? false
          : true;
      const tooltipStyle = req.query.tooltip_style ? Number(req.query.tooltip_style) : 1;
      const userName = req.query.user_name?.trim() || undefined;
      const headerStyle = req.query.header_style ? Number(req.query.header_style) : undefined;

      const harvestedMap = new Map<number, string>();
      if (req.query.harvested_slots) {
        const parts = String(req.query.harvested_slots).split(',').filter(Boolean);
        for (const p of parts) {
          const [sStr, pStr] = p.split(':');
          const sIdx = parseInt(sStr, 10);
          if (!isNaN(sIdx)) {
            const resolvedPlant = pStr ? findPlant(pStr.trim()) : undefined;
            harvestedMap.set(sIdx, resolvedPlant ? resolvedPlant.id : (pStr?.trim() || '01_nightshade'));
          }
        }
      }

      const plantedSet = new Set<number>();
      if (req.query.planted_slots) {
        const parts = String(req.query.planted_slots).split(',').filter(Boolean);
        for (const p of parts) {
          const sIdx = parseInt(p.trim(), 10);
          if (!isNaN(sIdx)) {
            plantedSet.add(sIdx);
          }
        }
      }

      const renderOptions = {
        slots: status.slots.map((s) => {
          let tooltipText: string | undefined;
          let slotTooltipStyle: number | undefined;
          let isGhost: boolean | undefined;
          let plantId = s.plantId;

          if (harvestedMap.has(s.slotIndex)) {
            isGhost = true;
            plantId = harvestedMap.get(s.slotIndex) || plantId;
            tooltipText = `[${s.slotIndex}] ✦ ${t('tooltips.harvested', {}, 'Colhido!')}`;
            slotTooltipStyle = 5;
          } else if (plantedSet.has(s.slotIndex)) {
            tooltipText = `[${s.slotIndex}] ✦ ${t('tooltips.planted', {}, 'Plantada!')}`;
            slotTooltipStyle = 4;
          } else if (withTooltips) {
            const plantDef = s.plantId ? findPlant(s.plantId) : undefined;
            if (s.stage === 'ready') {
              const timeStr = s.remainingSecondsToWither ? ` (${formatConciseTime(s.remainingSecondsToWither)})` : '';
              tooltipText = `[${s.slotIndex}] ${t('tooltips.ready')}${timeStr}`;
            } else if (s.stage === 'seed' || s.stage === 'growing') {
              const timeStr = s.remainingSecondsToHarvest ? formatConciseTime(s.remainingSecondsToHarvest) : '...';
              const witherStr = plantDef?.witherTimeSeconds ? ` | 💀 ${formatConciseTime(plantDef.witherTimeSeconds)}` : '';
              tooltipText = `[${s.slotIndex}] ${t('tooltips.' + s.stage, { time: timeStr })}${witherStr}`;
            } else if (s.stage === 'withered') {
              tooltipText = `[${s.slotIndex}] ${t('tooltips.withered')}`;
            }
          }
          return {
            slotIndex: s.slotIndex,
            plantId,
            stage: s.stage as any,
            tooltipText,
            tooltipStyle: slotTooltipStyle,
            isGhost,
          };
        }),
        decorations: status.decorations.map((d) => ({
          slotIndex: d.slotIndex,
          decorId: d.decorId,
          x: d.x,
          y: d.y,
        })),
        timeCycleOverride: req.query.time_override,
        includeTooltips: withTooltips,
        tooltipStyle,
        userName,
        headerStyle,
      };

      const cached = CanvasRendererService.getRenderCacheEntry(renderOptions);
      if (cached) {
        if (req.headers['if-none-match'] === cached.etag) {
          return reply.status(304).send();
        }
        return reply
          .header('Content-Type', 'image/jpeg')
          .header('ETag', cached.etag)
          .header('Cache-Control', 'public, max-age=15')
          .send(cached.buffer);
      }

      const imageBuffer = await CanvasRendererService.renderFarm(renderOptions);
      const entry = CanvasRendererService.getRenderCacheEntry(renderOptions);
      const etag = entry?.etag || `"farm-${Date.now()}"`;

      return reply
        .header('Content-Type', 'image/jpeg')
        .header('ETag', etag)
        .header('Cache-Control', 'public, max-age=15')
        .send(imageBuffer);
    }
  );

  // Service Worker para notificações nativas e push no navegador
  fastify.get('/sw.js', staticRouteOpts, async (req, reply) => {
    reply.type('application/javascript').header('Cache-Control', 'no-cache').send(`
      self.addEventListener('install', (event) => {
        self.skipWaiting();
      });

      self.addEventListener('activate', (event) => {
        event.waitUntil(self.clients.claim());
      });

      self.addEventListener('push', (event) => {
        let data = {};
        try {
          data = event.data ? event.data.json() : {};
        } catch (e) {
          data = { title: 'Jardim das Sombras', body: event.data ? event.data.text() : 'Novidades no seu jardim!' };
        }

        const title = data.title || '🥀 Jardim das Sombras';
        const options = {
          body: data.body || 'Suas plantas precisam da sua atenção!',
          icon: data.icon || '/favicon.svg',
          badge: '/favicon.svg',
          tag: data.tag || 'jds-alert',
          renotify: true,
          data: {
            url: data.url || '/farm',
          },
        };

        event.waitUntil(self.registration.showNotification(title, options));
      });

      self.addEventListener('notificationclick', (event) => {
        event.notification.close();
        const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/farm';
        event.waitUntil(
          clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
              if (client.url.includes('/farm') && 'focus' in client) {
                return client.focus();
              }
            }
            if (clients.openWindow) {
              return clients.openWindow(targetUrl);
            }
          })
        );
      });
    `);
  });

  // GET /farm?id=...&token=... (Página Web Pública ou Admin)
  fastify.get<{ Querystring: { id?: string; token?: string; auth?: string; public?: string; view?: string } }>(
    '/farm',
    async (req, reply) => {
      reply.header(
        'Content-Security-Policy',
        "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src * data: blob:;"
      );

      const uuid = req.query.id;
      if (!uuid) {
        return reply.type('text/html').send(renderPublicFarmEmpty());
      }

      try {
        const status = await farmService.getFarmStatusByUuid(uuid);

        // Parse cookie se disponível
        const cookieHeader = req.headers.cookie || '';
        const cookies: Record<string, string> = {};
        cookieHeader.split(';').forEach((pair) => {
          const [k, v] = pair.trim().split('=');
          if (k && v) cookies[k] = decodeURIComponent(v);
        });

        const isExplicitPublic = req.query.public === '1' || req.query.view === 'public';
        const adminToken = !isExplicitPublic ? (req.query.token || req.query.auth || cookies['jds_admin_token']) : null;

        // Check for admin token (válido por 3 dias, renovado a cada acesso)
        if (adminToken) {
          const verification = verifyAdminToken(adminToken);
          if (verification.valid && verification.userId === status.playerId) {
            // Renova automaticamente a sessão por até 3 dias (259.200s)
            const refreshed = generateAdminToken(status.playerId, 3 * 24 * 3600);
            reply.header('Set-Cookie', `jds_admin_token=${refreshed.token}; Path=/; Max-Age=259200; SameSite=Lax`);

            const shopCatalog = await shopService.getShopCatalog(status.playerId);
            const adminHtml = renderAdminFarmHtml({
              status,
              token: refreshed.token,
              expiresAt: refreshed.expiresAt,
              publicUrl: config.PUBLIC_URL,
              timeCycle: getCurrentTimeCycle(),
              shopCatalog,
              slotCoordinates: CanvasRendererService.SLOT_COORDINATES,
            });
            return reply.type('text/html').send(adminHtml);
          }
        }

        return reply.type('text/html').send(renderPublicFarmHtml(status, uuid));
      } catch (err: any) {
        return reply.type('text/html').status(404).send(renderPublicFarmNotFound());
      }
    }
  );

  // POST /farm/:user_id/plant
  fastify.post<{
    Params: { user_id: string };
    Body: { itemId: string | number; slot?: number; random?: boolean; amount?: number; witherMultiplier?: number };
  }>(
    '/farm/:user_id/plant',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const result = await farmService.plant(req.params.user_id, req.body);
      return reply.send(result);
    }
  );

  // POST /farm/:user_id/harvest
  fastify.post<{
    Params: { user_id: string };
    Body: { slot?: number; all?: boolean };
  }>(
    '/farm/:user_id/harvest',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const result = await farmService.harvest(req.params.user_id, req.body || {});
      return reply.send(result);
    }
  );

  // GET /farm/:user_id/harvest-totals
  // Totais cumulativos de colheita por planta. Usado pelo bot (ravena-ai) para
  // reconciliar os bônus sem depender do inventário, que zera quando o jogador vende.
  fastify.get<{ Params: { user_id: string } }>(
    '/farm/:user_id/harvest-totals',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const totals = await farmService.getHarvestTotals(req.params.user_id);
      return reply.send({ userId: req.params.user_id, totals });
    }
  );

  // POST /farm/:user_id/daily
  fastify.post<{ Params: { user_id: string } }>(
    '/farm/:user_id/daily',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const result = await farmService.claimDaily(req.params.user_id);
      return reply.send(result);
    }
  );

  // POST /farm/:user_id/decorate
  fastify.post<{
    Params: { user_id: string };
    Body: { slotIndex?: number; decorId: string | number; x?: number; y?: number };
  }>(
    '/farm/:user_id/decorate',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const result = await farmService.equipDecoration(req.params.user_id, req.body);
      return reply.send(result);
    }
  );

  // GET /farm/:user_id/admin-url
  fastify.get<{ Params: { user_id: string } }>(
    '/farm/:user_id/admin-url',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const status = await farmService.getFarmStatus(req.params.user_id);
      const { token, expiresAt } = generateAdminToken(req.params.user_id, 3 * 24 * 3600);
      const url = `${config.PUBLIC_URL}/farm?id=${status.uuid}&token=${token}`;
      return reply.send({
        url,
        token,
        expiresAt,
        uuid: status.uuid,
      });
    }
  );

  // PUT /farm/:user_id/decorations (Batch update positions)
  fastify.put<{
    Params: { user_id: string };
    Body: { decorations: Array<{ slotIndex: number; decorId: string; x?: number | null; y?: number | null }> };
  }>(
    '/farm/:user_id/decorations',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const result = await farmService.updateDecorationsBatch(req.params.user_id, req.body.decorations || []);
      return reply.send(result);
    }
  );

  // DELETE /farm/:user_id/decorate/:slot_index (Unequip decoration)
  fastify.delete<{
    Params: { user_id: string; slot_index: string };
  }>(
    '/farm/:user_id/decorate/:slot_index',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const result = await farmService.unequipDecoration(req.params.user_id, parseInt(req.params.slot_index));
      return reply.send(result);
    }
  );

  // GET /calibrate — Ferramenta web interativa para afinação visual das coordenadas dos 9 slots
  fastify.get('/calibrate', async (req, reply) => {
    reply.header(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src * data: blob:;"
    );
    return reply.type('text/html').send(renderCalibrateHtml());
  });

  // Servir assets estáticos de forma assíncrona, com streaming e proteção contra path traversal
  fastify.get<{ Params: { filename: string } }>('/farm/bg/:filename', staticRouteOpts, async (req, reply) => {
    return streamStaticAsset(reply, 'backgrounds', req.params.filename);
  });

  fastify.get<{ Params: { filename: string } }>('/farm/sprites/plants/:filename', staticRouteOpts, async (req, reply) => {
    return streamStaticAsset(reply, path.join('sprites', 'plants'), req.params.filename);
  });

  fastify.get<{ Params: { filename: string } }>('/farm/sprites/decorations/:filename', staticRouteOpts, async (req, reply) => {
    return streamStaticAsset(reply, path.join('sprites', 'decorations'), req.params.filename);
  });

  fastify.get<{ Params: { filename: string } }>('/farm/sprites/consumables/:filename', staticRouteOpts, async (req, reply) => {
    return streamStaticAsset(reply, path.join('sprites', 'consumables'), req.params.filename);
  });

  // POST /farm/:user_id/use (Usar consumível)
  fastify.post<{
    Params: { user_id: string };
    Body: { itemId: string | number; slot?: number };
  }>(
    '/farm/:user_id/use',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { itemId, slot } = req.body || {};
      if (!itemId) {
        return reply.code(400).send({ error: 'itemId é obrigatório.' });
      }
      const result = await farmService.useConsumable(req.params.user_id, itemId, { slot });
      return reply.send(result);
    }
  );

  // POST /farm/:user_id/sell
  fastify.post<{
    Params: { user_id: string };
    Body: { itemId?: string | number; quantity?: number; all?: boolean };
  }>(
    '/farm/:user_id/sell',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const result = await farmService.sell(req.params.user_id, req.body || {});
      return reply.send(result);
    }
  );

  // PATCH /farm/:user_id/name (Alterar nome da fazenda)
  fastify.patch<{
    Params: { user_id: string };
    Body: { farmName?: string | null };
  }>(
    '/farm/:user_id/name',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { farmName } = req.body || {};
      const updated = await farmService.updateFarmName(req.params.user_id, farmName || null);
      return reply.send({
        success: true,
        farmName: updated.farmName,
      });
    }
  );
};
