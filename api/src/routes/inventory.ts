import { FastifyPluginAsync } from 'fastify';
import { PLANTS, DECORATIONS, CONSUMABLES } from '../utils/catalog.js';

export const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /inventory/:user_id
  fastify.get<{ Params: { user_id: string } }>('/inventory/:user_id', async (req, reply) => {
    const player = await fastify.prisma.player.findUnique({
      where: { id: req.params.user_id },
      include: {
        inventory: true,
        decorations: true,
      },
    });

    if (!player) {
      return reply.send({
        userId: req.params.user_id,
        coins: 0,
        items: [],
      });
    }

    const items = player.inventory.map((inv) => {
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
        description: consumable ? consumable.description : undefined,
      };
    });

    return reply.send({
      userId: player.id,
      coins: player.coins,
      items,
      equippedDecorations: player.decorations,
    });
  });
};
