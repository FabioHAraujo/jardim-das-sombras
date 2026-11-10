import { FastifyPluginAsync } from 'fastify';

export const rankingsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /rankings/wealth
  fastify.get<{ Querystring: { limit?: number } }>('/rankings/wealth', async (req, reply) => {
    const limit = Math.min(50, Number(req.query.limit) || 10);
    const topPlayers = await fastify.prisma.player.findMany({
      where: {
        NOT: [
          { id: { startsWith: 'test', mode: 'insensitive' } },
          { id: { startsWith: 'sim', mode: 'insensitive' } },
          { id: { contains: 'test', mode: 'insensitive' } },
          { id: { contains: 'sim', mode: 'insensitive' } },
        ],
      },
      orderBy: { coins: 'desc' },
      take: limit,
      select: {
        id: true,
        coins: true,
        totalHarvested: true,
      },
    });

    return reply.send({
      type: 'wealth',
      ranking: topPlayers.map((p, idx) => ({
        rank: idx + 1,
        userId: p.id,
        coins: p.coins,
        totalHarvested: p.totalHarvested,
      })),
    });
  });

  // GET /rankings/farmers
  fastify.get<{ Querystring: { limit?: number } }>('/rankings/farmers', async (req, reply) => {
    const limit = Math.min(50, Number(req.query.limit) || 10);
    const topFarmers = await fastify.prisma.player.findMany({
      where: {
        NOT: [
          { id: { startsWith: 'test', mode: 'insensitive' } },
          { id: { startsWith: 'sim', mode: 'insensitive' } },
          { id: { contains: 'test', mode: 'insensitive' } },
          { id: { contains: 'sim', mode: 'insensitive' } },
        ],
      },
      orderBy: { totalHarvested: 'desc' },
      take: limit,
      select: {
        id: true,
        coins: true,
        totalHarvested: true,
        totalPlanted: true,
      },
    });

    return reply.send({
      type: 'farmers',
      ranking: topFarmers.map((p, idx) => ({
        rank: idx + 1,
        userId: p.id,
        totalHarvested: p.totalHarvested,
        totalPlanted: p.totalPlanted,
        coins: p.coins,
      })),
    });
  });

  // GET /rankings/digest - Dados completos para o resumo semanal da Ravena
  fastify.get('/rankings/digest', async (req, reply) => {
    const notFilter = [
      { id: { startsWith: 'test', mode: 'insensitive' as const } },
      { id: { startsWith: 'sim', mode: 'insensitive' as const } },
      { id: { contains: 'test', mode: 'insensitive' as const } },
      { id: { contains: 'sim', mode: 'insensitive' as const } },
    ];

    const players = await fastify.prisma.player.findMany({
      where: {
        NOT: notFilter,
      },
      select: {
        id: true,
        coins: true,
        totalHarvested: true,
        totalPlanted: true,
        totalWithered: true,
      },
    });

    // Planta mais colhida coletivamente (CropHarvestTotal)
    let topCrop = null;
    try {
      const topCropGroup = await fastify.prisma.cropHarvestTotal.groupBy({
        by: ['itemId'],
        _sum: { totalHarvested: true },
        orderBy: { _sum: { totalHarvested: 'desc' } },
        take: 1,
      });
      if (topCropGroup && topCropGroup[0]) {
        topCrop = {
          itemId: topCropGroup[0].itemId,
          count: topCropGroup[0]._sum.totalHarvested ?? 0,
        };
      }
    } catch (_) {}

    // Jogador com mais decorações equipadas
    let topDecorator = null;
    let topDecorators: Array<{ playerId: string; count: number }> = [];
    try {
      const topDecGroup = await fastify.prisma.playerDecoration.groupBy({
        by: ['playerId'],
        where: {
          playerId: {
            notIn: [
              // Test users
              'test',
              'sim',
              'calibrate',
            ],
          },
          NOT: notFilter.map((f) => ({ playerId: f.id })),
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      });
      if (topDecGroup && topDecGroup.length > 0) {
        topDecorators = topDecGroup.map((d) => ({
          playerId: d.playerId,
          count: d._count.id ?? 0,
        }));
        topDecorator = topDecorators[0];
      }
    } catch (_) {}

    return reply.send({
      players,
      topCrop,
      topDecorator,
      topDecorators,
    });
  });
};
