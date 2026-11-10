export type TimeCycle = 'dawn' | 'day' | 'night';

export function getCurrentTimeCycle(override?: string): TimeCycle {
  if (override === 'dawn' || override === 'day' || override === 'night') {
    return override;
  }

  // Get current hour in America/Sao_Paulo (UTC-3)
  const now = new Date();
  const utcHours = now.getUTCHours();
  // Sao Paulo is UTC-3 (or Brazil standard time)
  const spHours = (utcHours - 3 + 24) % 24;

  if ((spHours >= 5 && spHours < 9) || (spHours >= 17 && spHours < 19)) {
    return 'dawn';
  } else if (spHours >= 9 && spHours < 17) {
    return 'day';
  } else {
    return 'night';
  }
}
