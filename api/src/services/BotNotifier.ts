import { config } from '../config.js';
import type { HarvestResultItem } from './FarmService.js';

/**
 * Empurra o evento de colheita para a BotAPI (ravena-ai), para que o bot
 * creditie os bônus (iscas, rols de Waifu, fichas) na hora — inclusive quando
 * a colheita acontece no painel web (!faz-adm), que não passa pelo bot.
 *
 * Regras:
 * - Fire-and-forget: nunca lança, nunca atrasa a colheita. Falha é só um warn.
 * - Não transporta valor de bônus. O bot recalcula o montante em
 *   GET /farm/:id/harvest-totals, então retry/duplicata não creditam em dobro.
 * - BOT_API_URL vazio = push desligado (comportamento antigo).
 */

const REQUEST_TIMEOUT_MS = 4000;
const ENDPOINT = '/api/games/fazenda/harvest';

export interface BotHarvestNoticeItem {
  plantId: string;
  name: string;
  bonusType: string;
  count: number;
}

export interface BotHarvestNotice {
  userId: string;
  source: string;
  harvested: BotHarvestNoticeItem[];
}

export class BotNotifier {
  private static resolveEndpoint(): string | null {
    const base = (config.BOT_API_URL || '').trim().replace(/\/+$/, '');
    if (!base) return null;
    return `${base}${ENDPOINT}`;
  }

  private static resolveApiKey(): string {
    return (config.BOT_API_TOKEN || config.API_KEY || '').trim();
  }

  public static buildHarvestPayload(playerId: string, harvested: HarvestResultItem[]): BotHarvestNotice {
    return {
      userId: playerId,
      source: 'jardim-api',
      harvested: harvested.map((h) => ({
        plantId: h.plantId,
        name: h.name,
        bonusType: h.bonusType,
        count: h.count,
      })),
    };
  }

  public static notifyHarvest(playerId: string, harvested: HarvestResultItem[]): void {
    if (!harvested || harvested.length === 0) return;

    const url = this.resolveEndpoint();
    if (!url) return;

    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      console.warn('[BotNotifier] BOT_API_URL definido mas sem chave (BOT_API_TOKEN/API_KEY). Push ignorado.');
      return;
    }

    const payload = this.buildHarvestPayload(playerId, harvested);

    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
      .then(async (res) => {
        if (!res.ok) {
          const detail = (await res.text().catch(() => '')).slice(0, 200);
          console.warn(`[BotNotifier] colheita de ${playerId}: BotAPI respondeu HTTP ${res.status} ${detail}`);
        }
      })
      .catch((err: unknown) => {
        const e = err as { name?: string; message?: string };
        console.warn(
          `[BotNotifier] colheita de ${playerId}: falha ao notificar a BotAPI (${e?.name ?? 'erro'}: ${e?.message ?? 'sem detalhes'}). ` +
            'O bot reconcilia os bônus no próximo comando do jogador.',
        );
      });
  }
}
