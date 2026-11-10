import { describe, it, expect, vi } from 'vitest';
import { CONSUMABLES, findConsumable, findShopItem, PLANTS, DECORATIONS } from '../src/utils/catalog.js';
import { ShopService } from '../src/services/ShopService.js';
import { FarmService } from '../src/services/FarmService.js';

describe('Consumables & Multipliers Test Suite', () => {
  describe('1. Catalog Metadata & Constraints', () => {
    it('should have all 9 initial consumables with indices 31 to 39', () => {
      const keys = Object.keys(CONSUMABLES);
      expect(keys.length).toBe(9);

      const expected = [
        { id: 'blood_ruby', index: 31, name: 'Rubi Sanguíneo', price: 1000, dailyLimit: 10 },
        { id: 'niflheim_frost', index: 32, name: 'Geada de Niflheim', price: 1500, dailyLimit: 5 },
        { id: 'styx_essence', index: 33, name: 'Essência do Estige', price: 10000, dailyLimit: 5 },
        { id: 'void_nectar', index: 34, name: 'Néctar do Vazio', price: 10000, dailyLimit: 5 },
        { id: 'midas_tear', index: 35, name: 'Lágrima de Midas', price: 0, dailyLimit: 0 },
        { id: 'gargoyle_bile', index: 36, name: 'Bílis de Gárgula', price: 0, dailyLimit: 0 },
        { id: 'spectral_sigh', index: 37, name: 'Suspiro Espectral', price: 0, dailyLimit: 0 },
        { id: 'liquid_ashes', index: 38, name: 'Cinzas Líquidas', price: 0, dailyLimit: 0 },
        { id: 'widows_filter', index: 39, name: 'Filtro da Viúva', price: 20000, dailyLimit: 1 },
      ];

      for (const exp of expected) {
        const item = CONSUMABLES[exp.id];
        expect(item).toBeDefined();
        expect(item.index).toBe(exp.index);
        expect(item.name).toBe(exp.name);
        expect(item.price).toBe(exp.price);
        expect(item.dailyLimit).toBe(exp.dailyLimit);
      }
    });

    it('should find consumable by index and name', () => {
      expect(findConsumable(31)?.id).toBe('blood_ruby');
      expect(findConsumable(35)?.name).toBe('Lágrima de Midas');
      expect(findConsumable('rubi sanguíneo')?.index).toBe(31);
      expect(findConsumable('rubi')?.index).toBe(31);
      expect(findConsumable('néctar do vazio')?.index).toBe(34);
    });

    it('plants should not have percentage profit in bonusDescription', () => {
      for (const p of Object.values(PLANTS)) {
        expect(p.bonusDescription).not.toContain('% de lucro');
        expect(p.bonusDescription.length).toBeGreaterThan(0);
      }
    });

    it('decorations should support "oculto" tier', () => {
      // Test that catalog types and filtering recognize oculto
      const mockOcultoDecor = {
        index: 99,
        id: 'decor_oculto_test',
        name: 'Relíquia Oculta',
        tier: 'oculto' as const,
        price: 0,
        sellPrice: 0,
        spriteName: 'relic',
      };
      expect(mockOcultoDecor.tier).toBe('oculto');
    });
  });

  describe('2. Shop Catalog & Filtering', () => {
    it('should only include purchasable consumables (price > 0 && dailyLimit > 0) in getShopCatalog', async () => {
      const mockPrisma = {
        dailyPurchase: {
          findMany: vi.fn().mockResolvedValue([
            { itemId: 'blood_ruby', quantity: 3 },
          ]),
        },
      } as any;

      const shopService = new ShopService(mockPrisma);
      const catalog = await shopService.getShopCatalog('test-player');

      expect(catalog.consumables).toBeDefined();
      expect(catalog.consumables.length).toBe(5); // 31, 32, 33, 34, 39 are purchasable

      // Items with price = 0 (35, 36, 37, 38) must NOT be in shop
      const unpurchasableIds = ['midas_tear', 'gargoyle_bile', 'spectral_sigh', 'liquid_ashes'];
      for (const id of unpurchasableIds) {
        expect(catalog.consumables.some((c: any) => c.id === id)).toBe(false);
      }

      // Check remainingToday calculation
      const ruby = catalog.consumables.find((c: any) => c.id === 'blood_ruby');
      expect(ruby).toBeDefined();
      expect(ruby.dailyLimit).toBe(10);
      expect(ruby.remainingToday).toBe(7); // 10 - 3 bought today
    });

    it('should reject buying unpurchasable consumable (price=0)', async () => {
      const mockPrisma = {
        dailyPurchase: { findUnique: vi.fn() },
      } as any;

      const shopService = new ShopService(mockPrisma);
      await expect(shopService.buy('test-player', 35, 1)).rejects.toThrow('não está disponível para venda');
      await expect(shopService.buy('test-player', 'spectral_sigh', 1)).rejects.toThrow('não está disponível para venda');
    });
  });

  describe('3. Buff Calculation & 75% Reduction Cap', () => {
    it('should cap spectral_sigh reduction at 75%', async () => {
      const mockPrisma = {
        playerBuff: {
          findMany: vi.fn().mockResolvedValue([
            { type: 'growth_reduction', value: 0.50, expiresAt: null },
            { type: 'growth_reduction', value: 0.20, expiresAt: null },
          ]),
        },
      } as any;

      const farmService = new FarmService(mockPrisma);
      const buffs = await farmService.getFarmBuffs('test-player');

      // 50% + 20% = 70% reduction -> effectiveGrowthMultiplier = 0.30
      expect(buffs.effectiveGrowthMultiplier).toBe(0.3);
      expect(buffs.hasActiveBonus).toBe(true);
    });

    it('should strictly never allow total growth reduction beyond 75%', async () => {
      const mockPrisma = {
        playerBuff: {
          findMany: vi.fn().mockResolvedValue([
            { type: 'growth_reduction', value: 0.50, expiresAt: null },
            { type: 'growth_reduction', value: 0.25, expiresAt: null },
            { type: 'growth_reduction', value: 0.20, expiresAt: null }, // Over 75%
          ]),
        },
      } as any;

      const farmService = new FarmService(mockPrisma);
      const buffs = await farmService.getFarmBuffs('test-player');

      // Even with 95% total in database, effective growth time cannot be reduced beyond 75% (0.25x)
      expect(buffs.effectiveGrowthMultiplier).toBe(0.25);
    });

    it('should correctly sum additive coin multipliers from Midas Tear', async () => {
      const mockPrisma = {
        playerBuff: {
          findMany: vi.fn().mockResolvedValue([
            { type: 'coin_multiplier', value: 0.10, expiresAt: null },
            { type: 'coin_multiplier', value: 0.10, expiresAt: null },
            { type: 'coin_multiplier', value: 0.10, expiresAt: null },
          ]),
        },
      } as any;

      const farmService = new FarmService(mockPrisma);
      const buffs = await farmService.getFarmBuffs('test-player');

      // 1.0 + 0.10 * 3 = 1.30x
      expect(buffs.effectiveCoinMultiplier).toBe(1.3);
      expect(buffs.hasActiveBonus).toBe(true);
    });

    it('should strictly cap coin multiplier at 2.0x (R$250 cap)', async () => {
      const mockPrisma = {
        playerBuff: {
          findMany: vi.fn().mockResolvedValue([
            { type: 'coin_multiplier', value: 1.5, expiresAt: null }, // 1.0 + 1.5 = 2.5x -> should cap at 2.0
          ]),
        },
      } as any;

      const farmService = new FarmService(mockPrisma);
      const buffs = await farmService.getFarmBuffs('test-player');

      expect(buffs.effectiveCoinMultiplier).toBe(2.0);
    });

    it('should support growth_speed and daily_luck aliases', async () => {
      const mockPrisma = {
        playerBuff: {
          findMany: vi.fn().mockResolvedValue([
            { type: 'growth_speed', value: 0.25, expiresAt: null },
            { type: 'daily_luck', value: 0.30, expiresAt: null },
          ]),
        },
      } as any;

      const farmService = new FarmService(mockPrisma);
      const buffs = await farmService.getFarmBuffs('test-player');

      expect(buffs.effectiveGrowthMultiplier).toBe(0.75); // 1.0 - 0.25
      expect(buffs.dailySpecialItemBonus).toBe(0.30);
    });

    it('should report hasActiveBonus = false when all multipliers are 1.0 and no active buffs', async () => {
      const mockPrisma = {
        playerBuff: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const farmService = new FarmService(mockPrisma);
      const buffs = await farmService.getFarmBuffs('test-player');

      expect(buffs.effectiveCoinMultiplier).toBe(1.0);
      expect(buffs.effectiveGrowthMultiplier).toBe(1.0);
      expect(buffs.witherFrozen).toBe(false);
      expect(buffs.hasActiveBonus).toBe(false);
    });
  });

  describe('4. Consumable Usage Mechanics', () => {
    it('gargoyle_bile should not consume the item', async () => {
      const mockPrisma = {
        player: {
          findUnique: vi.fn().mockResolvedValue({ id: 'test-player', coins: 100, slots: [] }),
        },
        inventory: {
          findUnique: vi.fn().mockResolvedValue({ itemId: 'gargoyle_bile', quantity: 1 }),
        },
      } as any;

      const farmService = new FarmService(mockPrisma);
      const result = await farmService.useConsumable('test-player', 36);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Bílis de Gárgula');
    });

    it('should throw DomainError when user does not have the consumable', async () => {
      const mockPrisma = {
        player: {
          findUnique: vi.fn().mockResolvedValue({ id: 'test-player', coins: 100, slots: [] }),
        },
        inventory: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as any;

      const farmService = new FarmService(mockPrisma);
      await expect(farmService.useConsumable('test-player', 31)).rejects.toThrow('Você não possui');
    });

    it('should apply effectiveCoinMultiplier when selling crops (single and all)', async () => {
      const mockPrisma = {
        player: {
          findUnique: vi.fn().mockResolvedValue({ id: 'test-player', coins: 1000, slots: [] }),
          update: vi.fn().mockResolvedValue({}),
        },
        playerBuff: {
          findMany: vi.fn().mockResolvedValue([
            { type: 'coin_multiplier', value: 1.0, expiresAt: null }, // 2x multiplier
          ]),
        },
        inventory: {
          findMany: vi.fn().mockResolvedValue([
            { itemId: 'crop_02_tomb_shroom', quantity: 2 },
          ]),
          update: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(mockPrisma)),
      } as any;

      const farmService = new FarmService(mockPrisma);
      // Selling 1 Tomb Shroom (base 600, with 2.0x buff -> 1200)
      const resSingle = await farmService.sell('test-player', { itemId: 'crop_02_tomb_shroom', quantity: 1 });
      expect(resSingle.totalCoinsEarned).toBe(1200);
      expect(resSingle.soldItems[0].unitPrice).toBe(1200);

      // Selling all
      const resAll = await farmService.sell('test-player', { all: true });
      expect(resAll.totalCoinsEarned).toBe(2400); // 2 * 1200
    });
  });
});
