import { PrismaClient } from '@prisma/client';
import { DomainError } from '../errors/DomainError.js';
import { PLANTS, DECORATIONS, CONSUMABLES, findShopItem } from '../utils/catalog.js';

/**
 * Retorna a data correspondente ao marco de reset diário (03:00 BRT = 06:00 UTC).
 * Alinhado estritamente com o resgate da Sacola do Coveiro (claimDaily).
 */
export function getDailyResetDate(date = new Date()): Date {
  const reset = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 6, 0, 0, 0));
  if (date.getTime() < reset.getTime()) {
    reset.setUTCDate(reset.getUTCDate() - 1);
  }
  return reset;
}

export class ShopService {
  constructor(private prisma: PrismaClient) {}

  public async getShopCatalog(playerId: string) {
    const today = getDailyResetDate(new Date());

    const dailyPurchases = await this.prisma.dailyPurchase.findMany({
      where: {
        playerId,
        date: today,
      },
    });

    const purchaseMap = new Map<string, number>();
    for (const dp of dailyPurchases) {
      purchaseMap.set(dp.itemId, dp.quantity);
    }

    // Seeds numbered 1 to 12
    const seeds = Object.values(PLANTS).map((p) => {
      const boughtToday = purchaseMap.get(p.id) || 0;
      const maxPerDay = p.dailyLimit ?? 10;
      return {
        index: p.index,
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.seedPrice,
        sellPrice: p.sellPrice,
        coinReward: p.coinReward,
        bonusType: p.bonusType,
        description: p.bonusDescription,
        growthMinutes: Math.round(p.growthTimeSeconds / 60),
        growthTimeSeconds: p.growthTimeSeconds,
        witherTimeSeconds: p.witherTimeSeconds,
        witherMinutes: Math.round(p.witherTimeSeconds / 60),
        dailyLimit: maxPerDay,
        remainingToday: Math.max(0, maxPerDay - boughtToday),
      };
    });

    // Consumables numbered 31 to 39 (only items with price > 0 and dailyLimit > 0)
    const consumables = Object.values(CONSUMABLES)
      .filter((c) => c.price > 0 && c.dailyLimit > 0)
      .map((c) => {
        const boughtToday = purchaseMap.get(c.id) || 0;
        const maxPerDay = c.dailyLimit;
        return {
          index: c.index,
          id: c.id,
          name: c.name,
          color: c.color,
          effect: c.effect,
          price: c.price,
          description: c.description,
          dailyLimit: maxPerDay,
          remainingToday: Math.max(0, maxPerDay - boughtToday),
          spriteName: c.spriteName,
        };
      });

    // Decorations numbered 13 to 30 (oculto items do not appear in the shop)
    const decorations = Object.values(DECORATIONS)
      .filter((d) => d.tier !== 'oculto' && d.price > 0)
      .map((d) => ({
        index: d.index,
        id: d.id,
        name: d.name,
        tier: d.tier,
        price: d.price,
        sellPrice: d.sellPrice,
      }));

    return {
      seeds,
      consumables,
      decorations,
    };
  }

  public async buy(playerId: string, query: string | number, quantity: number = 1) {
    if (quantity < 1) {
      throw new DomainError('A quantidade mínima de compra é 1.', 'INVALID_SLOT', 400);
    }

    const match = findShopItem(query);
    if (!match) {
      throw new DomainError(`Item não encontrado no catálogo: "${query}". Consulte a !loja.`, 'PLANT_NOT_FOUND', 400);
    }

    let item: {
      index: number;
      id: string;
      name: string;
      price: number;
      isPlant: boolean;
      isConsumable: boolean;
      dailyLimit?: number;
      itemType: string;
      spriteName: string;
    };

    if (match.isPlant) {
      const p = match.item as any;
      item = {
        index: p.index,
        id: p.id,
        name: p.name,
        price: p.seedPrice,
        isPlant: true,
        isConsumable: false,
        dailyLimit: p.dailyLimit ?? 10,
        itemType: 'seed',
        spriteName: `${p.spriteBaseName}_ready.png`,
      };
    } else if (match.isConsumable) {
      const c = match.item as any;
      if (c.price <= 0 || c.dailyLimit <= 0) {
        throw new DomainError(`O item ${c.name} não está disponível para venda na loja.`, 'NOT_FOR_SALE', 400);
      }
      item = {
        index: c.index,
        id: c.id,
        name: c.name,
        price: c.price,
        isPlant: false,
        isConsumable: true,
        dailyLimit: c.dailyLimit,
        itemType: 'consumable',
        spriteName: `${c.spriteName}.png`,
      };
    } else {
      const d = match.item as any;
      if (d.tier === 'oculto' || d.price <= 0) {
        throw new DomainError(`O enfeite ${d.name} não está à venda na loja.`, 'NOT_FOR_SALE', 400);
      }
      item = {
        index: d.index,
        id: d.id,
        name: d.name,
        price: d.price,
        isPlant: false,
        isConsumable: false,
        itemType: 'decoration',
        spriteName: `${d.spriteName}.png`,
      };
    }

    const totalCost = item.price * quantity;
    const today = getDailyResetDate(new Date());

    return await this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { id: playerId } });
      if (!player) {
        throw new DomainError('Jogador não encontrado.', 'PLAYER_NOT_FOUND', 404);
      }

      if (player.coins < totalCost) {
        throw new DomainError(
          `Saldo insuficiente! Você tem ${player.coins.toLocaleString('pt-BR')} Petalitas, mas precisa de ${totalCost.toLocaleString('pt-BR')} Petalitas.`,
          'INSUFFICIENT_COINS',
          400
        );
      }

      if (item.dailyLimit !== undefined && item.dailyLimit > 0) {
        const maxPerDay = item.dailyLimit;
        const currentDaily = await tx.dailyPurchase.findUnique({
          where: { playerId_itemId_date: { playerId, itemId: item.id, date: today } },
        });

        const alreadyBought = currentDaily ? currentDaily.quantity : 0;
        if (alreadyBought + quantity > maxPerDay) {
          throw new DomainError(
            `Limite diário atingido para [${item.index}] ${item.name}! Você já comprou ${alreadyBought}/${maxPerDay} hoje.`,
            'PLAYER_LIMIT_EXCEEDED',
            400
          );
        }

        await tx.dailyPurchase.upsert({
          where: { playerId_itemId_date: { playerId, itemId: item.id, date: today } },
          create: { playerId, itemId: item.id, quantity, date: today },
          update: { quantity: { increment: quantity } },
        });
      }

      const updatedPlayer = await tx.player.update({
        where: { id: playerId },
        data: { coins: { decrement: totalCost } },
      });

      const inv = await tx.inventory.upsert({
        where: { playerId_itemId: { playerId, itemId: item.id } },
        create: { playerId, itemId: item.id, quantity },
        update: { quantity: { increment: quantity } },
      });

      return {
        success: true,
        itemIndex: item.index,
        itemId: item.id,
        itemName: item.name,
        itemType: item.itemType,
        spriteName: item.spriteName,
        quantityBought: quantity,
        totalCost,
        remainingCoins: updatedPlayer.coins,
        newInventoryQuantity: inv.quantity,
      };
    });
  }
}
