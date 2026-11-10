import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

export interface DailyBagEconomy {
  minPercent: number; // % do saldo
  maxPercent: number;
  floorMin: number; // mínimo absoluto
  floorMax: number;
  cap: number; // teto absoluto
}

const DEFAULT_BAG: DailyBagEconomy = { minPercent: 0.2, maxPercent: 0.4, floorMin: 150, floorMax: 300, cap: 6000 };

let dailyBag: DailyBagEconomy = DEFAULT_BAG;

export function loadEconomy(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(config.DATA_PATH, 'economy.json'), 'utf-8'));
    dailyBag = { ...DEFAULT_BAG, ...(raw.dailyBag || {}) };
  } catch {
    dailyBag = DEFAULT_BAG;
  }
}

/** Petalitas da sacola diária: sorteio uniforme entre min e max (% do saldo com piso), limitado ao teto. */
export function rollDailyBagCoins(balance: number): number {
  const b = dailyBag;
  const cap = Math.max(b.cap, 1);
  const min = Math.min(cap, Math.max(b.floorMin, Math.floor((balance * b.minPercent) / 100)));
  const max = Math.min(cap, Math.max(b.floorMax, Math.floor((balance * b.maxPercent) / 100), min));
  return min + Math.floor(Math.random() * (max - min + 1));
}

loadEconomy();
