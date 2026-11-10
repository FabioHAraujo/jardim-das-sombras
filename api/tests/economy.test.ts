import { describe, it, expect } from 'vitest';
import { rollDailyBagCoins } from '../src/utils/economy.js';

describe('Economy - rollDailyBagCoins', () => {
  it('should return at least floorMin for low balances', () => {
    for (let i = 0; i < 20; i++) {
      const reward = rollDailyBagCoins(100);
      expect(reward).toBeGreaterThanOrEqual(150);
      expect(reward).toBeLessThanOrEqual(300);
    }
  });

  it('should scale with player balance for medium balances', () => {
    // 5000 balance -> 0.2% = 10, but floorMin=150, floorMax=300
    // 500,000 balance -> 0.2% = 1000, 0.4% = 2000
    const rewards: number[] = [];
    for (let i = 0; i < 30; i++) {
      rewards.push(rollDailyBagCoins(500000));
    }
    for (const r of rewards) {
      expect(r).toBeGreaterThanOrEqual(1000);
      expect(r).toBeLessThanOrEqual(2000);
    }
  });

  it('should never exceed cap even for massive balances', () => {
    for (let i = 0; i < 50; i++) {
      const reward = rollDailyBagCoins(10000000); // 10 million
      expect(reward).toBeLessThanOrEqual(6000);
    }
  });
});
