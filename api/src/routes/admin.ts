import { FastifyPluginAsync } from 'fastify';
import { requireBotApiKey } from '../plugins/auth.js';
import { findPlant, findDecoration, findConsumable, resolveRealItemId } from '../utils/catalog.js';
import { DomainError } from '../errors/DomainError.js';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /admin/give
  fastify.post<{
    Body: {
      userId: string;
      itemId?: string;
      amount?: number;
      coins?: number;
      reason?: string;
    };
  }>(
    '/admin/give',
    { preHandler: [requireBotApiKey] },
    async (req, reply) => {
      const { userId, itemId, amount = 1, coins = 0, reason = 'admin_grant' } = req.body;

      if (!userId) {
        throw new DomainError('userId é obrigatório', 'PLAYER_NOT_FOUND', 400);
      }

      const result = await fastify.prisma.$transaction(async (tx) => {
        let player = await tx.player.findUnique({ where: { id: userId } });
        if (!player) {
          player = await tx.player.create({
            data: {
              id: userId,
              coins: 500,
              slots: {
                create: Array.from({ length: 9 }, (_, i) => ({
                  slotIndex: i + 1,
                  stage: 'empty',
                })),
              },
            },
          });
        }

        if (coins !== 0) {
          player = await tx.player.update({
            where: { id: userId },
            data: { coins: { increment: coins } },
          });
        }

        let updatedInventory = null;
        if (itemId) {
          const realId = resolveRealItemId(itemId);

          updatedInventory = await tx.inventory.upsert({
            where: { playerId_itemId: { playerId: userId, itemId: realId } },
            create: { playerId: userId, itemId: realId, quantity: amount },
            update: { quantity: { increment: amount } },
          });
        }

        return {
          userId,
          currentCoins: player.coins,
          givenCoins: coins,
          givenItem: itemId,
          inventoryAmount: updatedInventory?.quantity,
          reason,
        };
      });

      return reply.send({ success: true, ...result });
    }
  );

  // POST /admin/buff (Conceder multiplicadores e bônus de status na fazenda)
  fastify.post<{
    Body: {
      userId: string;
      type: string;
      value: number;
      durationHours?: number;
      source?: string;
      replaceSource?: boolean;
    };
  }>(
    '/admin/buff',
    { preHandler: [requireBotApiKey] },
    async (req, reply) => {
      const { userId, type, value, durationHours, source = 'admin_grant', replaceSource = false } = req.body;
      if (!userId || !type || value === undefined) {
        throw new DomainError('userId, type e value são obrigatórios.', 'INVALID_PAYLOAD', 400);
      }

      if (replaceSource) {
        await fastify.prisma.playerBuff.deleteMany({
          where: { playerId: userId, type, source },
        });
      }

      const expiresAt = durationHours && durationHours > 0 ? new Date(Date.now() + durationHours * 3600 * 1000) : null;
      const buff = await fastify.prisma.playerBuff.create({
        data: {
          playerId: userId,
          type,
          value,
          expiresAt,
          source,
        },
      });

      return reply.send({ success: true, buff });
    }
  );

  // POST /admin/transfer (Transferir itens entre usuários atomicamente)
  fastify.post<{
    Body: {
      fromUserId: string;
      toUserId: string;
      items: Array<{ itemId: string; amount: number }>;
    };
  }>(
    '/admin/transfer',
    { preHandler: [requireBotApiKey] },
    async (req, reply) => {
      const { fromUserId, toUserId, items } = req.body;

      if (!fromUserId || !toUserId || !items || !Array.isArray(items) || items.length === 0) {
        throw new DomainError('fromUserId, toUserId e items são obrigatórios', 'INVALID_PAYLOAD', 400);
      }

      const result = await fastify.prisma.$transaction(async (tx) => {
        // Garantir que o destinatário existe como player
        let receiver = await tx.player.findUnique({ where: { id: toUserId } });
        if (!receiver) {
          receiver = await tx.player.create({
            data: {
              id: toUserId,
              coins: 500,
              slots: {
                create: Array.from({ length: 9 }, (_, i) => ({
                  slotIndex: i + 1,
                  stage: 'empty',
                })),
              },
            },
          });
        }

        // 1. Validação de todos os itens do remetente
        for (const it of items) {
          const realId = resolveRealItemId(it.itemId);

          const inv = await tx.inventory.findUnique({
            where: { playerId_itemId: { playerId: fromUserId, itemId: realId } },
          });

          const requiredAmount = Number(it.amount) || 1;
          if (!inv || inv.quantity < requiredAmount) {
            throw new DomainError(
              `Item ${it.itemId} insuficiente para ${fromUserId}. Possui: ${inv?.quantity || 0}, Requerido: ${requiredAmount}`,
              'INSUFFICIENT_ITEMS',
              400
            );
          }
        }

        // 2. Transferência atômica
        const transferred = [];
        for (const it of items) {
          const realId = resolveRealItemId(it.itemId);
          const amount = Number(it.amount) || 1;

          // Subtrai do remetente
          const updatedSender = await tx.inventory.update({
            where: { playerId_itemId: { playerId: fromUserId, itemId: realId } },
            data: { quantity: { decrement: amount } },
          });

          if (updatedSender.quantity <= 0) {
            await tx.inventory.delete({
              where: { playerId_itemId: { playerId: fromUserId, itemId: realId } },
            });
          }

          // Adiciona ao destinatário
          const updatedReceiver = await tx.inventory.upsert({
            where: { playerId_itemId: { playerId: toUserId, itemId: realId } },
            create: { playerId: toUserId, itemId: realId, quantity: amount },
            update: { quantity: { increment: amount } },
          });

          transferred.push({
            itemId: realId,
            amount,
            senderRemaining: Math.max(0, updatedSender.quantity),
            receiverTotal: updatedReceiver.quantity,
          });
        }

        return transferred;
      });

      return reply.send({ success: true, transferred: result });
    }
  );

  // POST /admin/give-all (Conceder petalitas ou sementes para todos os jogadores da comunidade)
  fastify.post<{
    Body: {
      coins?: number;
      itemId?: string;
      amount?: number;
      items?: Array<{ itemId: string; amount: number }>;
      reason?: string;
    };
  }>(
    '/admin/give-all',
    { preHandler: [requireBotApiKey] },
    async (req, reply) => {
      const { coins = 0, itemId, amount = 1, items, reason = 'instant_event' } = req.body;

      const result = await fastify.prisma.$transaction(async (tx) => {
        let playersAffected = 0;
        if (coins !== 0) {
          const res = await tx.player.updateMany({
            data: { coins: { increment: coins } },
          });
          playersAffected = res.count;
        }

        const itemsToDistribute: Array<{ itemId: string; amount: number }> = [];
        if (items && Array.isArray(items)) {
          itemsToDistribute.push(...items);
        } else if (itemId) {
          itemsToDistribute.push({ itemId, amount });
        }

        if (itemsToDistribute.length > 0) {
          const players = await tx.player.findMany({ select: { id: true } });
          playersAffected = players.length;
          for (const it of itemsToDistribute) {
            const realId = resolveRealItemId(it.itemId);

            for (const p of players) {
              await tx.inventory.upsert({
                where: { playerId_itemId: { playerId: p.id, itemId: realId } },
                create: { playerId: p.id, itemId: realId, quantity: it.amount },
                update: { quantity: { increment: it.amount } },
              });
            }
          }
        }

        return { playersAffected, coins, itemsCount: itemsToDistribute.length, reason };
      });

      return reply.send({ success: true, ...result });
    }
  );
};

