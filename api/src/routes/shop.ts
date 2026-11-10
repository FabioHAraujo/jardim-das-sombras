import { FastifyPluginAsync } from 'fastify';
import { ShopService } from '../services/ShopService.js';
import { CanvasRendererService } from '../services/CanvasRendererService.js';
import { requireAuth } from '../plugins/auth.js';

export const shopRoutes: FastifyPluginAsync = async (fastify) => {
  const shopService = new ShopService(fastify.prisma);

  // GET /shop
  fastify.get<{ Querystring: { user_id?: string } }>('/shop', async (req, reply) => {
    const userId = req.query.user_id || 'anonymous';
    const catalog = await shopService.getShopCatalog(userId);
    return reply.send(catalog);
  });

  // POST /shop/buy/:user_id
  fastify.post<{
    Params: { user_id: string };
    Body: { itemId: string | number; quantity?: number };
  }>(
    '/shop/buy/:user_id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const quantity = req.body.quantity || 1;
      const result = await shopService.buy(req.params.user_id, req.body.itemId, quantity);

      // Generate sticker image with badge (e.g. "🌱 x3")
      let stickerBase64: string | undefined = undefined;
      if (result.spriteName) {
        try {
          const stickerBuffer = await CanvasRendererService.renderItemBadge(result.spriteName, quantity);
          stickerBase64 = `data:image/png;base64,${stickerBuffer.toString('base64')}`;
        } catch (e) {
          // Non-critical if sprite fails to load
        }
      }

      return reply.send({
        ...result,
        stickerBase64,
      });
    }
  );
};
