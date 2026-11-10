import { describe, it, expect } from 'vitest';
import { CanvasRendererService } from '../src/services/CanvasRendererService.js';

describe('CanvasRendererService', () => {
  it('should render farm composite buffer in JPEG format', async () => {
    const buffer = await CanvasRendererService.renderFarm({
      slots: [
        { slotIndex: 1, plantId: '04_black_lotus', stage: 'ready' },
        { slotIndex: 2, plantId: '01_nightshade', stage: 'growing' },
        { slotIndex: 3, plantId: '12_blood_rose', stage: 'ready' },
        { slotIndex: 5, plantId: '02_tomb_shroom', stage: 'seed' },
        { slotIndex: 9, plantId: '11_purple_heart', stage: 'withered' },
      ],
      decorations: [
        { slotIndex: 1, decorId: 'decor_12_creepy_scarecrows' },
        { slotIndex: 4, decorId: 'decor_18_fallen_angel_statues' },
      ],
      timeCycleOverride: 'night',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(10000);

    // Verify JPEG magic bytes: [0xFF, 0xD8, 0xFF]
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);
    expect(buffer[2]).toBe(0xff);
  }, 25000);

  it('should correctly detect inside vs outside plantation boundary', () => {
    // Center of plantation (512, 520) is inside
    expect(CanvasRendererService.isInsidePlantation(512, 520)).toBe(true);

    // Peripheral corners are outside
    expect(CanvasRendererService.isInsidePlantation(100, 100)).toBe(false);
    expect(CanvasRendererService.isInsidePlantation(900, 100)).toBe(false);
    expect(CanvasRendererService.isInsidePlantation(100, 900)).toBe(false);
    expect(CanvasRendererService.isInsidePlantation(900, 900)).toBe(false);
  });

  it('should render farm with free coordinate decorations', async () => {
    const buffer = await CanvasRendererService.renderFarm({
      slots: [],
      decorations: [
        { x: 150, y: 800, decorId: 'decor_01_dark_mossy_boulders' },
      ],
      timeCycleOverride: 'day',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(10000);
  });

  it('should render farm with user header banner', async () => {
    const buffer = await CanvasRendererService.renderFarm({
      slots: [],
      decorations: [],
      userName: 'Cultivador Noturno',
      headerStyle: 1,
      timeCycleOverride: 'night',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(10000);
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);
  });
});
