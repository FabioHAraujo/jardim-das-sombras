import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DECORATIONS, findDecoration, findShopItem, loadCatalog } from '../src/utils/catalog.js';
import { ShopService } from '../src/services/ShopService.js';
import { FarmService } from '../src/services/FarmService.js';
import { config } from '../src/config.js';

describe('VIP Decorations (Oculto) Test Suite', () => {
  // Ensure catalog is loaded
  loadCatalog();

  const expectedVips = [
    { index: 40, id: 'decor_19_fallen_king_crown', name: 'Coroa do Rei Caído' },
    { index: 41, id: 'decor_20_blood_diamond_cluster', name: 'Aglomerado de Diamantes Sanguíneos' },
    { index: 42, id: 'decor_21_molten_gold_chalice', name: 'Cálice de Ouro Derretido' },
    { index: 43, id: 'decor_22_marble_gold_tombstone', name: 'Lápide de Mármore e Ouro' },
    { index: 44, id: 'decor_23_sapphire_fire_lantern', name: 'Lampião de Fogo de Safira' },
    { index: 45, id: 'decor_24_solid_gold_gargoyle', name: 'Gárgula de Ouro Maciço' },
    { index: 46, id: 'decor_25_imprisoned_crystal_moon', name: 'Lua de Cristal Aprisionada' },
    { index: 47, id: 'decor_26_platinum_imperial_fountain', name: 'Fonte Imperial de Platina' },
    { index: 48, id: 'decor_27_dark_sun_niflheim', name: 'Sol Obscuro de Niflheim' },
  ];

  it('all 9 VIP decorations should be defined in DECORATIONS catalog', () => {
    for (const exp of expectedVips) {
      const item = DECORATIONS[exp.id];
      expect(item, `Item ${exp.id} missing in catalog`).toBeDefined();
      expect(item.index).toBe(exp.index);
      expect(item.name).toBe(exp.name);
      expect(item.tier).toBe('oculto');
      expect(item.price).toBe(0);
      expect(item.sellPrice).toBe(0);
      expect(item.spriteName).toBe(exp.id);
    }
  });

  it('matching PNG sprite files should exist on disk in assets/sprites/decorations', () => {
    const decorDir = path.join(config.ASSETS_PATH, 'sprites', 'decorations');
    for (const exp of expectedVips) {
      const spritePath = path.join(decorDir, `${exp.id}.png`);
      expect(fs.existsSync(spritePath), `Sprite ${spritePath} should exist`).toBe(true);
      const stat = fs.statSync(spritePath);
      expect(stat.size).toBeGreaterThan(10000); // verify non-empty sprite (>10KB)
    }
  });

  it('should find VIP decorations by index, ID, and name', () => {
    expect(findDecoration(40)?.id).toBe('decor_19_fallen_king_crown');
    expect(findDecoration(48)?.id).toBe('decor_27_dark_sun_niflheim');
    expect(findDecoration('decor_21_molten_gold_chalice')?.name).toBe('Cálice de Ouro Derretido');
    expect(findDecoration('coroa do rei caído')?.index).toBe(40);
    expect(findDecoration('safira')?.index).toBe(44);
    expect(findDecoration('gárgula de ouro')?.index).toBe(45);
    expect(findDecoration('fonte imperial')?.index).toBe(47);
  });

  it('VIP decorations should NOT be returned in getShopCatalog', async () => {
    const mockPrisma: any = {
      dailyPurchase: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const shopService = new ShopService(mockPrisma);
    const catalog = await shopService.getShopCatalog('player_test');

    const shopDecorIds = catalog.decorations.map((d) => d.id);
    for (const exp of expectedVips) {
      expect(shopDecorIds).not.toContain(exp.id);
      expect(catalog.decorations.some((d) => d.name === exp.name)).toBe(false);
    }
  });

  it('attempting to buy a VIP decoration in ShopService.buy should throw NOT_FOR_SALE', async () => {
    const mockPrisma: any = {
      $transaction: vi.fn(),
    };
    const shopService = new ShopService(mockPrisma);

    await expect(shopService.buy('player_test', 40)).rejects.toThrowError(/não está à venda na loja/);
    await expect(shopService.buy('player_test', 'decor_19_fallen_king_crown')).rejects.toThrowError(/não está à venda na loja/);
    await expect(shopService.buy('player_test', 'Sol Obscuro de Niflheim')).rejects.toThrowError(/não está à venda na loja/);
  });

  it('attempting to sell a VIP decoration in FarmService.sell should throw NOT_FOR_SALE', async () => {
    const mockPrisma: any = {
      player: {
        findUnique: vi.fn().mockResolvedValue({ id: 'player_test', coins: 100, slots: [] }),
      },
      inventory: {
        findMany: vi.fn().mockResolvedValue([
          { itemId: 'decor_19_fallen_king_crown', quantity: 1 },
        ]),
      },
    };
    const farmService = new FarmService(mockPrisma);

    await expect(
      farmService.sell('player_test', { itemId: 'decor_19_fallen_king_crown', quantity: 1 })
    ).rejects.toThrowError(/exclusivo VIP e não pode ser vendido/);
  });
});
