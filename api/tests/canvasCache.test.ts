import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasRendererService, RenderFarmOptions } from '../src/services/CanvasRendererService.js';

describe('CanvasRendererService - LRU Cache & ETag', () => {
  beforeEach(() => {
    CanvasRendererService.clearRenderCache();
  });

  const sampleOptions: RenderFarmOptions = {
    slots: [
      { slotIndex: 1, plantId: '01_nightshade', stage: 'ready', tooltipText: '[1] Pronta' },
      { slotIndex: 2, plantId: null, stage: 'empty' },
    ],
    decorations: [
      { slotIndex: 1, decorId: 'decor_01_dark_mossy_boulders', x: 220, y: 310 },
    ],
    timeCycleOverride: 'night',
    includeTooltips: true,
    tooltipStyle: 4,
  };

  it('should compute consistent deterministic cache keys', () => {
    const key1 = CanvasRendererService.computeFarmCacheKey(sampleOptions);
    const key2 = CanvasRendererService.computeFarmCacheKey(sampleOptions);
    expect(key1).toBe(key2);
    expect(key1).toContain('night');
  });

  it('should generate different keys when slot stage or decor changes', () => {
    const key1 = CanvasRendererService.computeFarmCacheKey(sampleOptions);
    const modifiedOptions: RenderFarmOptions = {
      ...sampleOptions,
      slots: [
        { slotIndex: 1, plantId: '01_nightshade', stage: 'withered', tooltipText: '[1] Morta' },
      ],
    };
    const key2 = CanvasRendererService.computeFarmCacheKey(modifiedOptions);
    expect(key1).not.toBe(key2);
  });

  it('should clear cache on clearRenderCache()', () => {
    // Empty initially
    expect(CanvasRendererService.getRenderCacheEntry(sampleOptions)).toBeUndefined();
  });
});
