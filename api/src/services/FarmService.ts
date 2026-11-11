import { PrismaClient } from '@prisma/client';
import { DomainError } from '../errors/DomainError.js';
import { rollDailyBagCoins } from '../utils/economy.js';
import { PLANTS, getBagPool, findPlant, DECORATIONS, findDecoration, CONSUMABLES, findConsumable } from '../utils/catalog.js';
import { CanvasRendererService, isInsidePlantation } from './CanvasRendererService.js';
import { BotNotifier } from './BotNotifier.js';

export interface HarvestResultItem {
  plantId: string;
  name: string;
  category: string;
  bonusType: string;
  bonusDescription: string;
  count: number;
  coinsEarned: number;
  slots: number[];
  slotIndex?: number;
}

export interface HarvestResult {
  success: boolean;
  totalCoinsEarned: number;
  clearedWitheredCount: number;
  harvested: HarvestResultItem[];
}

export class FarmService {
  constructor(private prisma: PrismaClient) {}

  public async getOrCreatePlayer(playerId: string) {
    let player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        slots: { orderBy: { slotIndex: 'asc' } },
        decorations: { orderBy: { slotIndex: 'asc' } },
        inventory: true,
      },
    });

    if (!player) {
      player = await this.prisma.player.create({
        data: {
          id: playerId,
          coins: 500,
          slots: {
            create: Array.from({ length: 9 }, (_, i) => ({
              slotIndex: i + 1,
              stage: 'empty',
            })),
          },
        },
        include: {
          slots: { orderBy: { slotIndex: 'asc' } },
          decorations: { orderBy: { slotIndex: 'asc' } },
          inventory: true,
        },
      });
    }

    // Refresh dynamic slot stages in batch
    const now = new Date();
    const changedSlots: Array<{ id: number; stage: string }> = [];

    for (const slot of player.slots) {
      if (slot.plantId && slot.plantedAt && slot.harvestAt && slot.witherAt) {
        let newStage = slot.stage;

        if (now >= slot.witherAt) {
          newStage = 'withered';
        } else if (now >= slot.harvestAt) {
          newStage = 'ready';
        } else {
          const totalDuration = slot.harvestAt.getTime() - slot.plantedAt.getTime();
          const elapsed = now.getTime() - slot.plantedAt.getTime();
          if (elapsed / totalDuration < 0.3) {
            newStage = 'seed';
          } else {
            newStage = 'growing';
          }
        }

        if (newStage !== slot.stage) {
          slot.stage = newStage;
          changedSlots.push({ id: slot.id, stage: newStage });
        }
      }
    }

    if (changedSlots.length > 0) {
      await this.prisma.$transaction(
        changedSlots.map((s) =>
          this.prisma.farmSlot.update({
            where: { id: s.id },
            data: { stage: s.stage },
          })
        )
      );
    }

    return player;
  }

  public async getFarmBuffs(playerId: string) {
    if (!this.prisma?.playerBuff) {
      return {
        effectiveCoinMultiplier: 1.0,
        effectiveGrowthMultiplier: 1.0,
        witherFrozen: false,
        witherFreezeRemainingSeconds: 0,
        dailySpecialItemBonus: 0,
        dailyLuckMultiplier: 1.0,
        hasActiveBonus: false,
        activeBuffs: [],
      };
    }
    const now = new Date();
    const activeBuffs = await this.prisma.playerBuff.findMany({
      where: {
        playerId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    // 1. Coin multiplier: base 1.0 + sum of coin_multiplier (e.g. Midas +0.10 each) * coin_factor
    // Teto estrito: máximo 2.0x (equivalente a R$ 250 em doações / 10 Lágrimas de Midas)
    let coinBonus = 0;
    let coinFactor = 1.0;
    for (const b of activeBuffs) {
      if (b.type === 'coin_multiplier') {
        coinBonus += b.value;
      } else if (b.type === 'coin_factor') {
        coinFactor *= b.value;
      }
    }
    const rawCoinMultiplier = (1.0 + coinBonus) * coinFactor;
    const effectiveCoinMultiplier = Number(Math.min(2.0, rawCoinMultiplier).toFixed(2));

    // 2. Growth time multiplier: base 1.0 - sum of growth_reduction (e.g. Suspiro 0.05 each, max 75%) * growth_halve/factor
    let growthReduction = 0;
    let growthFactor = 1.0;
    for (const b of activeBuffs) {
      if (b.type === 'growth_reduction' || b.type === 'growth_speed') {
        growthReduction += b.value;
      } else if (b.type === 'growth_multiplier' && b.value < 0) {
        growthReduction += Math.abs(b.value);
      } else if (b.type === 'growth_halve' || b.type === 'growth_factor') {
        growthFactor *= b.value;
      }
    }
    // Strict 75% max reduction cap
    const cappedReduction = Math.min(0.75, growthReduction);
    const effectiveGrowthMultiplier = Number(Math.max(0.1, (1.0 - cappedReduction) * growthFactor).toFixed(2));

    // 3. Wither freeze: any active wither_freeze buff
    const freezeBuffs = activeBuffs.filter((b) => b.type === 'wither_freeze');
    const witherFrozen = freezeBuffs.length > 0;
    let maxFreezeExpiry = 0;
    for (const fb of freezeBuffs) {
      if (fb.expiresAt && fb.expiresAt.getTime() > maxFreezeExpiry) {
        maxFreezeExpiry = fb.expiresAt.getTime();
      }
    }
    const witherFreezeRemainingSeconds = maxFreezeExpiry > now.getTime()
      ? Math.round((maxFreezeExpiry - now.getTime()) / 1000)
      : (witherFrozen ? 86400 : 0);

    // 4. Daily bag special item bonus (e.g. Cinzas Líquidas +0.05 each, additive)
    let dailySpecialItemBonus = 0;
    for (const b of activeBuffs) {
      if (b.type === 'daily_bag_bonus' || b.type === 'daily_luck') {
        dailySpecialItemBonus += b.value;
      }
    }

    // 5. Daily bag luck multiplier (e.g. Filtro da Viúva 2.0x)
    let dailyLuckMultiplier = 1.0;
    for (const b of activeBuffs) {
      if (b.type === 'daily_bag_luck') {
        dailyLuckMultiplier *= b.value;
      }
    }

    const hasActiveBonus =
      effectiveCoinMultiplier !== 1.0 ||
      effectiveGrowthMultiplier !== 1.0 ||
      witherFrozen ||
      dailySpecialItemBonus > 0 ||
      dailyLuckMultiplier > 1.0;

    return {
      effectiveCoinMultiplier,
      effectiveGrowthMultiplier,
      witherFrozen,
      witherFreezeRemainingSeconds,
      dailySpecialItemBonus,
      dailyLuckMultiplier,
      hasActiveBonus,
      activeBuffs: activeBuffs.map((b) => ({
        id: b.id,
        type: b.type,
        value: b.value,
        expiresAt: b.expiresAt,
        source: b.source,
      })),
    };
  }

  public async getFarmStatus(playerId: string) {
    const player = await this.getOrCreatePlayer(playerId);
    const now = new Date();
    const buffs = await this.getFarmBuffs(player.id);

    const formattedSlots = player.slots.map((s) => {
      let remainingSecondsToHarvest = 0;
      let remainingSecondsToWither = 0;

      if (s.harvestAt && now < s.harvestAt) {
        remainingSecondsToHarvest = Math.max(0, Math.round((s.harvestAt.getTime() - now.getTime()) / 1000));
      }

      if (s.witherAt && now < s.witherAt) {
        remainingSecondsToWither = Math.max(0, Math.round((s.witherAt.getTime() - now.getTime()) / 1000));
      }

      const plantDef = s.plantId ? PLANTS[s.plantId] : null;

      return {
        slotIndex: s.slotIndex,
        plantId: s.plantId,
        plantName: plantDef ? plantDef.name : null,
        category: plantDef ? plantDef.category : null,
        stage: s.stage,
        remainingSecondsToHarvest,
        remainingSecondsToWither,
        harvestAt: s.harvestAt ? s.harvestAt.toISOString() : null,
        witherAt: s.witherAt ? s.witherAt.toISOString() : null,
      };
    });

    return {
      playerId: player.id,
      uuid: player.uuid,
      farmName: player.farmName || null,
      playerName: player.playerName || null,
      coins: player.coins,
      stats: {
        totalPlanted: player.totalPlanted,
        totalHarvested: player.totalHarvested,
        totalWithered: player.totalWithered,
      },
      buffs,
      slots: formattedSlots,
      decorations: player.decorations.map((d) => ({
        slotIndex: d.slotIndex,
        decorId: d.decorId,
        name: (DECORATIONS[d.decorId] || findDecoration(d.decorId))?.name || d.decorId,
        x: d.x,
        y: d.y,
      })),
      inventory: player.inventory,
    };
  }

  public async updateFarmName(playerId: string, farmName: string | null) {
    const trimmed = farmName ? farmName.trim() : null;
    const finalName = trimmed && trimmed.length > 0 ? trimmed.substring(0, 20) : null;
    const updated = await this.prisma.player.update({
      where: { id: playerId },
      data: { farmName: finalName },
    });
    return updated;
  }

  public async getFarmStatusByUuid(uuid: string) {
    let player = await this.prisma.player.findUnique({
      where: { uuid },
      include: {
        slots: { orderBy: { slotIndex: 'asc' } },
        decorations: { orderBy: { slotIndex: 'asc' } },
        inventory: true,
      },
    });

    if (!player) {
      throw new DomainError('Fazenda não encontrada para este link compartilhado.', 'PLAYER_NOT_FOUND', 404);
    }

    return this.getFarmStatus(player.id);
  }

  public async plant(
    playerId: string,
    options: { itemId: string | number; slot?: number; random?: boolean; amount?: number; witherMultiplier?: number }
  ) {
    const player = await this.getOrCreatePlayer(playerId);
    const plantDef = findPlant(options.itemId);

    if (!plantDef) {
      throw new DomainError(`Planta desconhecida: "${options.itemId}"`, 'PLANT_NOT_FOUND', 400);
    }

    const userInventory = await this.prisma.inventory.findUnique({
      where: { playerId_itemId: { playerId, itemId: plantDef.id } },
    });

    const requestedAmount = options.amount !== undefined ? options.amount : 3;
    if (!userInventory || userInventory.quantity < 1) {
      throw new DomainError(
        `Você não possui sementes de ${plantDef.name} no inventário. Compre na !loja primeiro.`,
        'INSUFFICIENT_SEEDS',
        400
      );
    }

    const availableSeeds = userInventory.quantity;
    const now = new Date();
    const buffs = await this.getFarmBuffs(playerId);
    const actualGrowthSeconds = Math.max(10, Math.round(plantDef.growthTimeSeconds * buffs.effectiveGrowthMultiplier));
    const harvestAt = new Date(now.getTime() + actualGrowthSeconds * 1000);
    let witherTimeSeconds = plantDef.witherTimeSeconds;
    if (options.witherMultiplier && options.witherMultiplier > 0) {
      witherTimeSeconds = Math.round(witherTimeSeconds * options.witherMultiplier);
    }
    if (buffs.witherFrozen) {
      witherTimeSeconds += (buffs.witherFreezeRemainingSeconds || 86400); // Adiciona tempo total de congelamento restante
    }
    const witherAt = new Date(harvestAt.getTime() + witherTimeSeconds * 1000);

    const emptySlots = player.slots.filter((s) => s.stage === 'empty' || !s.plantId || s.stage === 'withered');

    if (emptySlots.length === 0) {
      throw new DomainError('Todos os 9 canteiros estão ocupados! Colha plantas prontas primeiro.', 'SLOT_OCCUPIED', 400);
    }

    let targetSlots: typeof emptySlots = [];

    if (options.slot) {
      const specificSlot = player.slots.find((s) => s.slotIndex === options.slot);
      if (!specificSlot) {
        throw new DomainError(`Canteiro inválido: ${options.slot}. Escolha entre 1 e 9.`, 'INVALID_SLOT', 400);
      }
      if (specificSlot.plantId && specificSlot.stage !== 'empty' && specificSlot.stage !== 'withered') {
        throw new DomainError(`O canteiro [${options.slot}] já está ocupado com uma planta viva!`, 'SLOT_OCCUPIED', 400);
      }
      targetSlots = [specificSlot];
    } else {
      // Pick random available slot(s) for convenience
      const shuffled = [...emptySlots].sort(() => Math.random() - 0.5);
      const countToPlant = Math.min(requestedAmount, availableSeeds, shuffled.length);
      targetSlots = shuffled.slice(0, countToPlant);
    }

    const plantedCount = targetSlots.length;
    if (plantedCount === 0) {
      throw new DomainError('Nenhum canteiro disponível para plantio.', 'SLOT_OCCUPIED', 400);
    }

    const witheredReplaced = targetSlots.filter((s) => s.stage === 'withered').length;

    await this.prisma.$transaction(async (tx) => {
      await tx.inventory.update({
        where: { playerId_itemId: { playerId, itemId: plantDef.id } },
        data: { quantity: { decrement: plantedCount } },
      });

      for (const slot of targetSlots) {
        await tx.farmSlot.update({
          where: { id: slot.id },
          data: {
            plantId: plantDef.id,
            stage: 'seed',
            plantedAt: now,
            harvestAt,
            witherAt,
          },
        });
      }

      await tx.player.update({
        where: { id: playerId },
        data: {
          totalPlanted: { increment: plantedCount },
          ...(witheredReplaced > 0 ? { totalWithered: { increment: witheredReplaced } } : {}),
        },
      });
    });

    CanvasRendererService.clearRenderCache();

    return {
      success: true,
      plantedCount,
      plantName: plantDef.name,
      plantId: plantDef.id,
      slots: targetSlots.map((s) => s.slotIndex),
      harvestAt,
    };
  }

  public async harvest(playerId: string, options: { slot?: number; all?: boolean }): Promise<HarvestResult> {
    const player = await this.getOrCreatePlayer(playerId);
    const slotsToProcess = options.slot
      ? player.slots.filter((s) => s.slotIndex === options.slot)
      : player.slots;

    if (options.slot && slotsToProcess.length === 0) {
      throw new DomainError(`Canteiro ${options.slot} inválido.`, 'INVALID_SLOT', 400);
    }

    const readySlots = slotsToProcess.filter((s) => s.stage === 'ready' && s.plantId);
    const witheredSlots = slotsToProcess.filter((s) => s.stage === 'withered' && s.plantId);

    if (readySlots.length === 0 && witheredSlots.length === 0) {
      if (options.slot) {
        throw new DomainError(`O canteiro [${options.slot}] não está pronto para colheita.`, 'NOT_READY_FOR_HARVEST', 400);
      }
      throw new DomainError('Nenhum canteiro com plantas prontas para colher no momento.', 'NOT_READY_FOR_HARVEST', 400);
    }

    const buffs = await this.getFarmBuffs(playerId);
    let totalCoinsEarned = 0;
    const harvestedMap: Record<string, HarvestResultItem> = {};

    for (const slot of readySlots) {
      const plantDef = PLANTS[slot.plantId!];
      if (!plantDef) continue;

      const coinReward = Math.round(plantDef.coinReward * buffs.effectiveCoinMultiplier);
      totalCoinsEarned += coinReward;

      if (!harvestedMap[plantDef.id]) {
        harvestedMap[plantDef.id] = {
          plantId: plantDef.id,
          name: plantDef.name,
          category: plantDef.category,
          bonusType: plantDef.bonusType,
          bonusDescription: plantDef.bonusDescription,
          count: 0,
          coinsEarned: 0,
          slots: [],
        };
      }

      harvestedMap[plantDef.id].count += 1;
      harvestedMap[plantDef.id].coinsEarned += coinReward;
      harvestedMap[plantDef.id].slots.push(slot.slotIndex);
      harvestedMap[plantDef.id].slotIndex = harvestedMap[plantDef.id].slots[0];
    }

    await this.prisma.$transaction(async (tx) => {
      if (readySlots.length > 0 || witheredSlots.length > 0) {
        await tx.player.update({
          where: { id: playerId },
          data: {
            ...(totalCoinsEarned > 0 ? { coins: { increment: totalCoinsEarned } } : {}),
            ...(readySlots.length > 0 ? { totalHarvested: { increment: readySlots.length } } : {}),
            ...(witheredSlots.length > 0 ? { totalWithered: { increment: witheredSlots.length } } : {}),
          },
        });

        // Adiciona as plantas colhidas ao inventário do jogador (para poder exibir e vender)
        // e registra o total cumulativo por planta — fonte de verdade do evento de colheita
        // para o bot creditar os bônus (o inventário muda com venda e não serve de prova).
        for (const it of Object.values(harvestedMap)) {
          const cropId = `crop_${it.plantId}`;
          await tx.inventory.upsert({
            where: { playerId_itemId: { playerId, itemId: cropId } },
            create: { playerId, itemId: cropId, quantity: it.count },
            update: { quantity: { increment: it.count } },
          });

          await tx.cropHarvestTotal.upsert({
            where: { playerId_itemId: { playerId, itemId: cropId } },
            create: { playerId, itemId: cropId, totalHarvested: it.count },
            update: { totalHarvested: { increment: it.count } },
          });
        }
      }

      const allSlotsToReset = [...readySlots, ...witheredSlots];
      for (const slot of allSlotsToReset) {
        await tx.farmSlot.update({
          where: { id: slot.id },
          data: {
            plantId: null,
            stage: 'empty',
            plantedAt: null,
            harvestAt: null,
            witherAt: null,
          },
        });
      }
    });

    CanvasRendererService.clearRenderCache();

    // Avisa a BotAPI (iscas/rolls/fichas no bot). Fire-and-forget: falha não afeta a colheita.
    BotNotifier.notifyHarvest(playerId, Object.values(harvestedMap));

    return {
      success: true,
      totalCoinsEarned,
      clearedWitheredCount: witheredSlots.length,
      harvested: Object.values(harvestedMap),
    };
  }

  /**
   * Totais cumulativos de colheita por planta (itemId no formato "crop_<plantId>").
   * Consumido pelo bot para reconciliar os bônus sem depender do inventário.
   */
  public async getHarvestTotals(playerId: string) {
    const rows = await this.prisma.cropHarvestTotal.findMany({
      where: { playerId },
      orderBy: { itemId: 'asc' },
    });

    return rows.map((r: any) => ({
      itemId: r.itemId,
      totalHarvested: r.totalHarvested,
      updatedAt: r.updatedAt,
    }));
  }

  public async claimDaily(playerId: string) {
    const player = await this.getOrCreatePlayer(playerId);
    const now = new Date();

    // Reset diário fixo às 03:00 da madrugada (horário de Brasília / UTC-3 = 06:00 UTC)
    // Se o jogador coletou antes do último marco das 03:00, está elegível para coletar hoje!
    const getResetPoint = (date: Date): Date => {
      // 03:00 BRT corresponde a 06:00 UTC
      const reset = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 6, 0, 0, 0));
      if (date.getTime() < reset.getTime()) {
        // Antes das 03:00 da manhã, o reset do ciclo atual foi ontem às 03:00
        reset.setUTCDate(reset.getUTCDate() - 1);
      }
      return reset;
    };

    const currentCycleReset = getResetPoint(now);
    const nextCycleReset = new Date(currentCycleReset.getTime() + 24 * 60 * 60 * 1000);

    if (player.lastDailyAt && player.lastDailyAt.getTime() >= currentCycleReset.getTime()) {
      const remainingMs = nextCycleReset.getTime() - now.getTime();
      const remainingHours = Math.max(1, Math.ceil(remainingMs / (1000 * 60 * 60)));
      return {
        claimed: false,
        alreadyClaimed: true,
        remainingHours,
        message: `Você já coletou a Sacola do Coveiro hoje! O próximo resgate reseta às 03:00 (em aprox. ${remainingHours}h).`,
      };
    }

    const buffs = await this.getFarmBuffs(playerId);
    const baseCoinsWon = rollDailyBagCoins(player.coins);
    const coinsWon = Math.round(baseCoinsWon * buffs.effectiveCoinMultiplier);

    const pick = (tier: 'common' | 'uncommon' | 'rare' | 'epic'): string | undefined => {
      const pool = getBagPool(tier);
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : undefined;
    };

    const seedsWon: { itemId: string; count: number }[] = [];
    const guaranteedPlant = pick('common');
    if (guaranteedPlant) seedsWon.push({ itemId: guaranteedPlant, count: 3 });

    // Base chances: 3% epic, 10% rare, 20% uncommon
    // Bonuses: buffs.dailySpecialItemBonus (e.g. +5% = +0.05 per Cinzas Líquidas)
    // Multipliers: buffs.dailyLuckMultiplier (e.g. 2.0 with Filtro da Viúva)
    const extraLuck = buffs.dailySpecialItemBonus * 100; // e.g. 5
    const mult = buffs.dailyLuckMultiplier; // e.g. 2 or 1
    const epicChance = (3 + extraLuck * 0.15) * mult;
    const rareChance = (10 + extraLuck * 0.35) * mult;
    const uncommonChance = (20 + extraLuck * 0.50) * mult;

    const roll = Math.random() * 100;
    const bonus =
      roll < epicChance
        ? pick('epic')
        : roll < epicChance + rareChance
        ? pick('rare')
        : roll < epicChance + rareChance + uncommonChance
        ? pick('uncommon')
        : undefined;
    if (bonus) seedsWon.push({ itemId: bonus, count: 1 });

    await this.prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id: playerId },
        data: {
          coins: { increment: coinsWon },
          lastDailyAt: now,
        },
      });

      for (const item of seedsWon) {
        await tx.inventory.upsert({
          where: { playerId_itemId: { playerId, itemId: item.itemId } },
          create: { playerId, itemId: item.itemId, quantity: item.count },
          update: { quantity: { increment: item.count } },
        });
      }
    });

    return {
      claimed: true,
      alreadyClaimed: false,
      coinsWon,
      itemsWon: seedsWon.map((s) => ({
        itemId: s.itemId,
        name: PLANTS[s.itemId]?.name || s.itemId,
        count: s.count,
      })),
    };
  }

  public async equipDecoration(
    playerId: string,
    options: { slotIndex?: number; decorId: string | number; x?: number; y?: number }
  ) {
    const decorDef = findDecoration(options.decorId);
    if (!decorDef) {
      throw new DomainError(`Decoração desconhecida: "${options.decorId}"`, 'INVALID_DECORATION', 400);
    }

    const itemInInv = await this.prisma.inventory.findUnique({
      where: { playerId_itemId: { playerId, itemId: decorDef.id } },
    });

    if (!itemInInv || itemInInv.quantity < 1) {
      const hint = decorDef.tier === 'oculto' ? 'Este item é exclusivo VIP!' : 'Compre na loja primeiro!';
      throw new DomainError(
        `Você não possui "${decorDef.name}" no inventário. ${hint}`,
        'INSUFFICIENT_SEEDS',
        400
      );
    }

    let x = options.x;
    let y = options.y;
    let slotIndex = options.slotIndex || 1;

    // Check how many of this decorId are already placed on the farm
    const alreadyPlacedCount = await this.prisma.playerDecoration.count({
      where: {
        playerId,
        decorId: decorDef.id,
        slotIndex: { not: slotIndex },
      },
    });

    if (alreadyPlacedCount >= itemInInv.quantity) {
      throw new DomainError(
        `Você já posicionou todos os ${itemInInv.quantity}x "${decorDef.name}" que possui! Compre mais na loja para posicionar outros.`,
        'INSUFFICIENT_SEEDS',
        400
      );
    }

    if (x != null && y != null) {
      // Validate canvas bounds
      if (x < 20 || x > 1004 || y < 20 || y > 1004) {
        throw new DomainError('Coordenadas fora dos limites do terreno!', 'INVALID_SLOT', 400);
      }

      // Check if inside plantation
      if (isInsidePlantation(x, y)) {
        throw new DomainError(
          '⚠️ Posição inválida! Não é permitido colocar enfeites sobre os canteiros da plantação. Escolha um local ao redor da fazenda.',
          'INVALID_SLOT',
          400
        );
      }
    }

    const decor = await this.prisma.playerDecoration.upsert({
      where: { playerId_slotIndex: { playerId, slotIndex } },
      create: {
        playerId,
        slotIndex,
        decorId: decorDef.id,
        x: x ?? null,
        y: y ?? null,
      },
      update: {
        decorId: decorDef.id,
        x: x ?? null,
        y: y ?? null,
      },
    });

    CanvasRendererService.clearRenderCache();

    return {
      success: true,
      slotIndex: decor.slotIndex,
      decorId: decor.decorId,
      name: decorDef.name,
      x: decor.x,
      y: decor.y,
    };
  }

  public async unequipDecoration(playerId: string, slotIndex: number) {
    const existing = await this.prisma.playerDecoration.findUnique({
      where: { playerId_slotIndex: { playerId, slotIndex } },
    });
    if (!existing) {
      throw new DomainError('Nenhum enfeite equipado neste slot!', 'SLOT_EMPTY', 400);
    }
    await this.prisma.playerDecoration.delete({
      where: { playerId_slotIndex: { playerId, slotIndex } },
    });
    CanvasRendererService.clearRenderCache();
    return { success: true, slotIndex };
  }

  public async updateDecorationsBatch(
    playerId: string,
    decorations: Array<{ slotIndex: number; decorId: string; x?: number | null; y?: number | null }>
  ) {
    // Validate that count per decorId does not exceed inventory
    const decorCounts: Record<string, number> = {};
    for (const d of decorations) {
      decorCounts[d.decorId] = (decorCounts[d.decorId] || 0) + 1;
    }

    for (const [dId, count] of Object.entries(decorCounts)) {
      const inv = await this.prisma.inventory.findUnique({
        where: { playerId_itemId: { playerId, itemId: dId } },
      });
      if (!inv || inv.quantity < count) {
        const decorDef = findDecoration(dId);
        throw new DomainError(
          `Você só possui ${inv?.quantity || 0}x de "${decorDef?.name || dId}", mas tentou salvar ${count}!`,
          'INVALID_SLOT',
          400
        );
      }
    }

    for (const d of decorations) {
      if (d.x != null && d.y != null) {
        if (d.x < 20 || d.x > 1004 || d.y < 20 || d.y > 1004) {
          throw new DomainError('Coordenadas fora dos limites do terreno!', 'INVALID_SLOT', 400);
        }
        if (isInsidePlantation(d.x, d.y)) {
          throw new DomainError(
            '⚠️ Posição inválida! Não é permitido colocar enfeites sobre os canteiros da plantação.',
            'INVALID_SLOT',
            400
          );
        }
      }
    }

    await this.prisma.$transaction(
      decorations.map((d) =>
        this.prisma.playerDecoration.upsert({
          where: { playerId_slotIndex: { playerId, slotIndex: d.slotIndex } },
          create: {
            playerId,
            slotIndex: d.slotIndex,
            decorId: d.decorId,
            x: d.x ?? null,
            y: d.y ?? null,
          },
          update: {
            decorId: d.decorId,
            x: d.x ?? null,
            y: d.y ?? null,
          },
        })
      )
    );

    CanvasRendererService.clearRenderCache();

    return { success: true, count: decorations.length };
  }

  public async sell(playerId: string, options: { itemId?: string | number; quantity?: number; all?: boolean }) {
    const player = await this.getOrCreatePlayer(playerId);
    const userInventory = await this.prisma.inventory.findMany({
      where: { playerId },
    });

    if (userInventory.length === 0) {
      throw new DomainError('Seu inventário está vazio!', 'SLOT_EMPTY', 400);
    }

    let itemsToSell: Array<{ itemId: string; name: string; quantity: number; unitPrice: number }> = [];

    if (options.all) {
      const buffs = await this.getFarmBuffs(playerId);
      for (const inv of userInventory) {
        if (!inv.itemId.startsWith('crop_')) continue;
        const plant = findPlant(inv.itemId);
        const unitPrice = plant ? Math.round(plant.sellPrice * buffs.effectiveCoinMultiplier) : 0;
        if (unitPrice > 0 && inv.quantity > 0) {
          itemsToSell.push({
            itemId: inv.itemId,
            name: plant ? plant.name : inv.itemId,
            quantity: inv.quantity,
            unitPrice,
          });
        }
      }
    } else if (options.itemId) {
      const plant = findPlant(options.itemId);
      const decor = !plant ? findDecoration(options.itemId) : null;
      if (!plant && !decor) {
        throw new DomainError(`Item não encontrado: "${options.itemId}"`, 'PLANT_NOT_FOUND', 400);
      }

      if (decor && (decor.tier === 'oculto' || decor.sellPrice <= 0)) {
        throw new DomainError(`O item "${decor.name}" é exclusivo VIP e não pode ser vendido!`, 'NOT_FOR_SALE', 400);
      }

      const candidates = plant ? [`crop_${plant.id}`] : [decor!.id];
      const invItem = userInventory.find((i) => candidates.includes(i.itemId) && i.quantity > 0);
      if (!invItem || invItem.quantity < 1) {
        throw new DomainError(`Você não possui colheitas de ${plant ? plant.name : decor!.name} para vender! (Sementes só podem ser plantadas, não vendidas)`, 'INSUFFICIENT_SEEDS', 400);
      }

      const qty = Math.min(invItem.quantity, options.quantity || 1);
      const buffs = plant ? await this.getFarmBuffs(playerId) : null;
      const unitPrice = plant ? Math.round(plant.sellPrice * buffs!.effectiveCoinMultiplier) : decor!.sellPrice;
      itemsToSell.push({
        itemId: invItem.itemId,
        name: plant ? plant.name : decor!.name,
        quantity: qty,
        unitPrice,
      });
    }

    if (itemsToSell.length === 0) {
      throw new DomainError('Nenhum item válido para vender.', 'SLOT_EMPTY', 400);
    }

    let totalCoinsEarned = 0;
    for (const it of itemsToSell) {
      totalCoinsEarned += it.unitPrice * it.quantity;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id: playerId },
        data: { coins: { increment: totalCoinsEarned } },
      });

      for (const it of itemsToSell) {
        await tx.inventory.update({
          where: { playerId_itemId: { playerId, itemId: it.itemId } },
          data: { quantity: { decrement: it.quantity } },
        });
      }
    });

    return {
      success: true,
      totalCoinsEarned,
      soldItems: itemsToSell,
      newCoinsBalance: player.coins + totalCoinsEarned,
    };
  }

  public async useConsumable(
    playerId: string,
    query: string | number,
    options?: { slot?: number }
  ) {
    const player = await this.getOrCreatePlayer(playerId);
    const consumableDef = findConsumable(query);

    if (!consumableDef) {
      throw new DomainError(`Consumível não encontrado: "${query}"`, 'ITEM_NOT_FOUND', 400);
    }

    const itemInInv = await this.prisma.inventory.findUnique({
      where: { playerId_itemId: { playerId, itemId: consumableDef.id } },
    });

    if (!itemInInv || itemInInv.quantity < 1) {
      throw new DomainError(
        `Você não possui [${consumableDef.name}] no seu inventário.`,
        'INSUFFICIENT_ITEMS',
        400
      );
    }

    const now = new Date();

    switch (consumableDef.id) {
      case 'blood_ruby': {
        // Finaliza o crescimento da planta com maior tempo restante
        const growingSlots = player.slots.filter(
          (s) => s.plantId && s.harvestAt && s.harvestAt > now && s.stage !== 'ready' && s.stage !== 'withered'
        );

        if (growingSlots.length === 0) {
          throw new DomainError('Não há nenhuma planta em crescimento para acelerar com o Rubi Sanguíneo.', 'NO_GROWING_PLANTS', 400);
        }

        // Slot with maximum remaining harvest time
        growingSlots.sort((a, b) => (b.harvestAt!.getTime() - now.getTime()) - (a.harvestAt!.getTime() - now.getTime()));
        const targetSlot = growingSlots[0];
        const plantDef = PLANTS[targetSlot.plantId!];

        await this.prisma.$transaction(async (tx) => {
          await tx.inventory.update({
            where: { playerId_itemId: { playerId, itemId: consumableDef.id } },
            data: { quantity: { decrement: 1 } },
          });

          await tx.farmSlot.update({
            where: { id: targetSlot.id },
            data: {
              stage: 'ready',
              harvestAt: now,
            },
          });
        });

        CanvasRendererService.clearRenderCache();
        return {
          success: true,
          itemId: consumableDef.id,
          itemName: consumableDef.name,
          slotIndex: targetSlot.slotIndex,
          plantName: plantDef?.name || targetSlot.plantId,
          message: `💎 O Rubi Sanguíneo brilhou intensamente! A planta ${plantDef?.name || ''} no canteiro [${targetSlot.slotIndex}] atingiu a maturidade instantaneamente!`,
        };
      }

      case 'niflheim_frost': {
        // Congela o tempo de wither por 24h (acumulativo)
        const plantedSlots = player.slots.filter((s) => s.plantId && s.witherAt && s.stage !== 'empty' && s.stage !== 'withered');

        // Busca se já possui buff de congelamento ativo para acumular
        const existingFreeze = await this.prisma.playerBuff.findFirst({
          where: {
            playerId,
            type: 'wither_freeze',
            expiresAt: { gt: now },
          },
          orderBy: { expiresAt: 'desc' },
        });

        const baseExpiry = existingFreeze && existingFreeze.expiresAt && existingFreeze.expiresAt > now
          ? existingFreeze.expiresAt.getTime()
          : now.getTime();

        const remainingSeconds = Math.max(0, Math.round((baseExpiry - now.getTime()) / 1000));
        const maxLimitSeconds = 72 * 3600; // 72 horas máximo

        if (remainingSeconds + 24 * 3600 > maxLimitSeconds) {
          const currentHours = (remainingSeconds / 3600).toFixed(1);
          throw new DomainError(
            `❄️ Limite atingido! O efeito da Geada de Niflheim já possui ${currentHours}h ativas e não pode exceder o teto máximo de 72 horas. Aguarde antes de usar outra poção.`,
            'MAX_BUFF_REACHED',
            400
          );
        }

        const newExpiresAt = new Date(baseExpiry + 24 * 3600 * 1000);
        const totalHours = Math.round((newExpiresAt.getTime() - now.getTime()) / 3600000);

        await this.prisma.$transaction(async (tx) => {
          await tx.inventory.update({
            where: { playerId_itemId: { playerId, itemId: consumableDef.id } },
            data: { quantity: { decrement: 1 } },
          });

          for (const s of plantedSlots) {
            await tx.farmSlot.update({
              where: { id: s.id },
              data: {
                witherAt: new Date(s.witherAt!.getTime() + 24 * 3600 * 1000),
              },
            });
          }

          if (existingFreeze) {
            await tx.playerBuff.update({
              where: { id: existingFreeze.id },
              data: {
                expiresAt: newExpiresAt,
              },
            });
          } else {
            await tx.playerBuff.create({
              data: {
                playerId,
                type: 'wither_freeze',
                value: 1.0,
                expiresAt: newExpiresAt,
                source: 'niflheim_frost',
              },
            });
          }
        });

        CanvasRendererService.clearRenderCache();
        return {
          success: true,
          itemId: consumableDef.id,
          itemName: consumableDef.name,
          totalHoursActive: totalHours,
          message: `❄️ A Geada de Niflheim envolveu seus canteiros em gelo eterno! O tempo de apodrecimento foi estendido em +24 horas (Total ativo acumulado: ${totalHours}h).`,
        };
      }

      case 'styx_essence': {
        // Finaliza o crescimento de todas as plantas
        const growingSlots = player.slots.filter(
          (s) => s.plantId && s.harvestAt && s.harvestAt > now && s.stage !== 'ready' && s.stage !== 'withered'
        );

        if (growingSlots.length === 0) {
          throw new DomainError('Não há nenhuma planta em crescimento para florescer com a Essência do Estige.', 'NO_GROWING_PLANTS', 400);
        }

        await this.prisma.$transaction(async (tx) => {
          await tx.inventory.update({
            where: { playerId_itemId: { playerId, itemId: consumableDef.id } },
            data: { quantity: { decrement: 1 } },
          });

          for (const s of growingSlots) {
            await tx.farmSlot.update({
              where: { id: s.id },
              data: {
                stage: 'ready',
                harvestAt: now,
              },
            });
          }
        });

        CanvasRendererService.clearRenderCache();
        return {
          success: true,
          itemId: consumableDef.id,
          itemName: consumableDef.name,
          slotsCount: growingSlots.length,
          message: `🌊 A Essência do Estige inundou seus canteiros! Todas as ${growingSlots.length} plantas floresceram instantaneamente!`,
        };
      }

      case 'void_nectar': {
        // Reduz o tempo de crescimento das plantas pela metade durante 24 horas
        const growingSlots = player.slots.filter(
          (s) => s.plantId && s.harvestAt && s.harvestAt > now && s.stage !== 'ready' && s.stage !== 'withered'
        );

        await this.prisma.$transaction(async (tx) => {
          await tx.inventory.update({
            where: { playerId_itemId: { playerId, itemId: consumableDef.id } },
            data: { quantity: { decrement: 1 } },
          });

          // Halve remaining time for currently growing plants
          for (const s of growingSlots) {
            const remaining = s.harvestAt!.getTime() - now.getTime();
            const newHarvest = new Date(now.getTime() + Math.round(remaining * 0.5));
            await tx.farmSlot.update({
              where: { id: s.id },
              data: { harvestAt: newHarvest },
            });
          }

          await tx.playerBuff.create({
            data: {
              playerId,
              type: 'growth_halve',
              value: 0.5,
              expiresAt: new Date(now.getTime() + 24 * 3600 * 1000),
              source: 'void_nectar',
            },
          });
        });

        CanvasRendererService.clearRenderCache();
        return {
          success: true,
          itemId: consumableDef.id,
          itemName: consumableDef.name,
          message: `🌌 O Néctar do Vazio distorceu a malha temporal! O tempo de cultivo foi reduzido pela metade pelas próximas 24 horas.`,
        };
      }

      case 'midas_tear': {
        // Aumenta petalitas em +10% permanente (aditivo)
        await this.prisma.$transaction(async (tx) => {
          await tx.inventory.update({
            where: { playerId_itemId: { playerId, itemId: consumableDef.id } },
            data: { quantity: { decrement: 1 } },
          });

          await tx.playerBuff.create({
            data: {
              playerId,
              type: 'coin_multiplier',
              value: 0.10,
              expiresAt: null,
              source: 'midas_tear',
            },
          });
        });

        const newBuffs = await this.getFarmBuffs(playerId);
        return {
          success: true,
          itemId: consumableDef.id,
          itemName: consumableDef.name,
          newCoinMultiplier: newBuffs.effectiveCoinMultiplier,
          message: `✨ A Lágrima de Midas transformou a terra em ouro! Ganho de Petalitas aumentado em +10% (Multiplicador atual: ${newBuffs.effectiveCoinMultiplier}x).`,
        };
      }

      case 'gargoyle_bile': {
        // Sem uso ainda (não consome o item)
        return {
          success: false,
          itemId: consumableDef.id,
          itemName: consumableDef.name,
          message: `🗿 A Bílis de Gárgula exala um vapor escuro e viscoso... Seu poder ainda permanece adormecido pelas forças antigas.`,
        };
      }

      case 'spectral_sigh': {
        // Reduz tempo de crescimento em 5% (aditivo, máx 75%)
        const activeBuffs = await this.prisma.playerBuff.findMany({
          where: { playerId, type: 'growth_reduction' },
        });
        const currentReduction = activeBuffs.reduce((sum, b) => sum + b.value, 0);

        if (currentReduction >= 0.75) {
          throw new DomainError('Limite máximo de 75% de redução de tempo de cultivo já foi atingido!', 'MAX_BUFF_REACHED', 400);
        }

        const valueToAdd = Math.min(0.05, Number((0.75 - currentReduction).toFixed(2)));

        await this.prisma.$transaction(async (tx) => {
          await tx.inventory.update({
            where: { playerId_itemId: { playerId, itemId: consumableDef.id } },
            data: { quantity: { decrement: 1 } },
          });

          await tx.playerBuff.create({
            data: {
              playerId,
              type: 'growth_reduction',
              value: valueToAdd,
              expiresAt: null,
              source: 'spectral_sigh',
            },
          });
        });

        const newBuffs = await this.getFarmBuffs(playerId);
        const totalRedPercent = Math.round((currentReduction + valueToAdd) * 100);
        return {
          success: true,
          itemId: consumableDef.id,
          itemName: consumableDef.name,
          totalReductionPercent: totalRedPercent,
          message: `👻 O Suspiro Espectral sussurrou às raízes! Tempo de cultivo permanentemente reduzido em 5% (Total atual: ${totalRedPercent}% mais rápido).`,
        };
      }

      case 'liquid_ashes': {
        // Aumenta em +5% permanentemente a chance de itens especiais na bag diária (aditivo)
        await this.prisma.$transaction(async (tx) => {
          await tx.inventory.update({
            where: { playerId_itemId: { playerId, itemId: consumableDef.id } },
            data: { quantity: { decrement: 1 } },
          });

          await tx.playerBuff.create({
            data: {
              playerId,
              type: 'daily_bag_bonus',
              value: 0.05,
              expiresAt: null,
              source: 'liquid_ashes',
            },
          });
        });

        const newBuffs = await this.getFarmBuffs(playerId);
        const totalBonus = Math.round(newBuffs.dailySpecialItemBonus * 100);
        return {
          success: true,
          itemId: consumableDef.id,
          itemName: consumableDef.name,
          totalBonusPercent: totalBonus,
          message: `🔥 As Cinzas Líquidas fertilizaram a terra! Chance de itens raros e épicos na Sacola Diária aumentada em +5% (Total: +${totalBonus}%).`,
        };
      }

      case 'widows_filter': {
        // Dobra a chance de itens especiais na bag diária durante 7 dias
        await this.prisma.$transaction(async (tx) => {
          await tx.inventory.update({
            where: { playerId_itemId: { playerId, itemId: consumableDef.id } },
            data: { quantity: { decrement: 1 } },
          });

          await tx.playerBuff.create({
            data: {
              playerId,
              type: 'daily_bag_luck',
              value: 2.0,
              expiresAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
              source: 'widows_filter',
            },
          });
        });

        return {
          success: true,
          itemId: consumableDef.id,
          itemName: consumableDef.name,
          message: `🌹 O Filtro da Viúva exalou seu perfume hipnótico! Suas chances de sementes raras e épicas na Sacola Diária estão dobradas por 7 dias.`,
        };
      }

      default:
        throw new DomainError(`Efeito desconhecido para o consumível ${consumableDef.name}`, 'UNKNOWN_EFFECT', 400);
    }
  }
}
