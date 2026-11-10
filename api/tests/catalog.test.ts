import { describe, it, expect } from 'vitest';
import { findPlant, findDecoration, findConsumable, findShopItem, getBagPool, resolveRealItemId, PLANTS, DECORATIONS, CONSUMABLES } from '../src/utils/catalog.js';

describe('Catalog - Items & Bag Pool', () => {
  it('should find plant by numeric index', () => {
    const plant = findPlant(1);
    expect(plant).toBeDefined();
    expect(plant?.id).toBe('01_nightshade');
  });

  it('should find plant by name case and accent-insensitive', () => {
    const plant = findPlant('erva-moura');
    expect(plant).toBeDefined();
    expect(plant?.index).toBe(1);
  });

  it('should find decoration by numeric index', () => {
    const decor = findDecoration(13);
    expect(decor).toBeDefined();
    expect(decor?.index).toBe(13);
  });

  it('should find decoration by name case-insensitive', () => {
    const decor = findDecoration('pedregulhos');
    expect(decor).toBeDefined();
    expect(decor?.index).toBe(13);
  });

  it('should return bag pools with configured plants', () => {
    const commonPool = getBagPool('common');
    expect(commonPool.length).toBeGreaterThan(0);
    expect(commonPool).toContain('01_nightshade');
  });

  it('should correctly distinguish plants and decorations in findShopItem', () => {
    const item1 = findShopItem(1);
    expect(item1?.isPlant).toBe(true);

    const item13 = findShopItem(13);
    expect(item13?.isPlant).toBe(false);
    expect(item13?.isDecoration).toBe(true);

    const item31 = findShopItem(31);
    expect(item31?.isConsumable).toBe(true);
    expect(item31?.item.name).toBe('Rubi Sanguíneo');
  });

  it('should find consumable by index and name', () => {
    const ruby = findConsumable(31);
    expect(ruby?.id).toBe('blood_ruby');

    const frost = findConsumable('geada de niflheim');
    expect(frost?.id).toBe('niflheim_frost');
  });

  it('should correctly resolve canonical item ids preserving crop prefix', () => {
    expect(resolveRealItemId('crop_03_corpse_lily')).toBe('crop_03_corpse_lily');
    expect(resolveRealItemId('crop_3')).toBe('crop_03_corpse_lily');
    expect(resolveRealItemId('03_corpse_lily')).toBe('03_corpse_lily');
    expect(resolveRealItemId(3)).toBe('03_corpse_lily');
    expect(resolveRealItemId('blood_ruby')).toBe('blood_ruby');
    expect(resolveRealItemId('decor_01_dark_mossy_boulders')).toBe('decor_01_dark_mossy_boulders');
  });
});
