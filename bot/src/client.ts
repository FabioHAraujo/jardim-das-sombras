export interface FarmStatusSlot {
  slotIndex: number;
  plantId: string | null;
  plantName: string | null;
  category: string | null;
  stage: string;
  remainingSecondsToHarvest: number;
  remainingSecondsToWither: number;
}

export interface FarmStatus {
  playerId: string;
  uuid?: string;
  shareUrl?: string;
  coins: number;
  stats: {
    totalPlanted: number;
    totalHarvested: number;
    totalWithered: number;
  };
  slots: FarmStatusSlot[];
  decorations: Array<{
    slotIndex: number;
    decorId: string;
    name: string;
    x?: number | null;
    y?: number | null;
  }>;
  inventory: Array<{
    itemId: string;
    quantity: number;
  }>;
}

export interface HarvestResponse {
  success: boolean;
  totalCoinsEarned: number;
  clearedWitheredCount: number;
  harvested: Array<{
    plantId: string;
    name: string;
    category: string;
    bonusType: string;
    bonusDescription: string;
    count: number;
    coinsEarned: number;
  }>;
}

export interface PlantResponse {
  success: boolean;
  plantedCount: number;
  plantName: string;
  slots: number[];
  harvestAt: string;
}

export interface DailyResponse {
  claimed: boolean;
  alreadyClaimed: boolean;
  remainingHours?: number;
  coinsWon?: number;
  itemsWon?: Array<{
    itemId: string;
    name: string;
    count: number;
  }>;
  message?: string;
}

export interface ShopSeed {
  index: number;
  id: string;
  name: string;
  category: string;
  price: number;
  sellPrice: number;
  description: string;
  growthMinutes: number;
  dailyLimit: number;
  remainingToday: number;
}

export interface ShopDecoration {
  index: number;
  id: string;
  name: string;
  tier: string;
  price: number;
  sellPrice: number;
}

export interface ShopConsumable {
  index: number;
  id: string;
  name: string;
  color: string;
  effect: string;
  price: number;
  description: string;
  dailyLimit: number;
  remainingToday: number;
  spriteName?: string;
}

export interface ShopResponse {
  seeds: ShopSeed[];
  consumables?: ShopConsumable[];
  decorations: ShopDecoration[];
}

export interface BuyResponse {
  success: boolean;
  itemIndex: number;
  itemId: string;
  itemName: string;
  itemType?: string;
  spriteName?: string;
  stickerBase64?: string;
  quantityBought: number;
  totalCost: number;
  remainingCoins: number;
  newInventoryQuantity: number;
}

export interface InventoryItem {
  itemId: string;
  baseId?: string;
  catalogIndex?: number;
  name: string;
  type: string;
  quantity: number;
}

export interface InventoryResponse {
  userId: string;
  coins: number;
  items: InventoryItem[];
}

export interface SellResponse {
  success: boolean;
  totalCoinsEarned: number;
  soldItems: Array<{
    itemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  newCoinsBalance: number;
}

function extractErrorMessage(data: any, fallback: string): string {
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (data.message && data.message !== 'Bad Request') return data.message;
  if (data.error && data.error !== 'Bad Request') return data.error;
  if (data.message) return data.message;
  return fallback;
}

export class ShadowGardenClient {
  constructor(
    private baseUrl: string = process.env.API_URL || 'http://localhost:3040',
    private apiKey: string = process.env.API_KEY || 'jardim_secret_api_key_2026'
  ) {}

  async getStatus(userId: string): Promise<FarmStatus> {
    const res = await fetch(`${this.baseUrl}/farm/${userId}`);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: 'Falha na requisição' }))) as any;
      throw new Error(extractErrorMessage(err, `HTTP ${res.status}`));
    }
    return (await res.json()) as FarmStatus;
  }

  async getImageBuffer(userId: string, withTooltips: boolean = true, userName?: string): Promise<Buffer> {
    const params = new URLSearchParams();
    if (withTooltips) params.set('tooltips', 'true');
    if (userName) params.set('user_name', userName);
    const qs = params.toString();
    const url = `${this.baseUrl}/farm/${userId}/image${qs ? `?${qs}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Falha ao obter imagem da fazenda: HTTP ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async plant(userId: string, itemId: string | number, slot?: number, amount?: number): Promise<PlantResponse> {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/plant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ itemId, slot, amount }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(extractErrorMessage(data, 'Falha ao plantar'));
    return data as PlantResponse;
  }

  async harvest(userId: string, slot?: number, all: boolean = true): Promise<HarvestResponse> {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/harvest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ slot, all }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(extractErrorMessage(data, 'Falha ao colher'));
    return data as HarvestResponse;
  }

  async claimDaily(userId: string): Promise<DailyResponse> {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/daily`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({}),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(extractErrorMessage(data, 'Falha ao coletar recompensa diária'));
    return data as DailyResponse;
  }

  async getShop(userId: string): Promise<ShopResponse> {
    const res = await fetch(`${this.baseUrl}/shop?user_id=${userId}`);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as any;
      throw new Error(extractErrorMessage(data, 'Falha ao carregar loja'));
    }
    return (await res.json()) as ShopResponse;
  }

  async buy(userId: string, itemId: string | number, quantity: number = 1): Promise<BuyResponse> {
    const res = await fetch(`${this.baseUrl}/shop/buy/${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ itemId, quantity }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(extractErrorMessage(data, 'Falha ao comprar'));
    return data as BuyResponse;
  }

  async getInventory(userId: string): Promise<InventoryResponse> {
    const res = await fetch(`${this.baseUrl}/inventory/${userId}`);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as any;
      throw new Error(extractErrorMessage(data, 'Falha ao obter inventário'));
    }
    return (await res.json()) as InventoryResponse;
  }

  async useConsumable(
    userId: string,
    itemId: string | number,
    slot?: number
  ): Promise<{ success: boolean; message: string; itemId?: string; itemName?: string; [key: string]: any }> {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/use`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ itemId, slot }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(extractErrorMessage(data, 'Falha ao usar item consumível'));
    return data;
  }

  async decorate(
    userId: string,
    options: { slotIndex?: number; decorId: string | number; x?: number; y?: number }
  ): Promise<{ success: boolean; slotIndex: number; name: string; x?: number; y?: number }> {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/decorate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(options),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(extractErrorMessage(data, 'Falha ao equipar decoração'));
    return data;
  }

  async sell(userId: string, options: { itemId?: string | number; quantity?: number; all?: boolean }): Promise<SellResponse> {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/sell`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(options),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(extractErrorMessage(data, 'Falha ao vender'));
    return data as SellResponse;
  }

  async adminGive(userId: string, coins: number, itemId?: string, amount?: number) {
    const res = await fetch(`${this.baseUrl}/admin/give`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ userId, coins, itemId, amount }),
    });
    return (await res.json()) as any;
  }

  async getAdminUrl(userId: string): Promise<{ url: string; token: string; expiresAt: number; uuid: string }> {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/admin-url`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(extractErrorMessage(data, 'Falha ao gerar link de administração'));
    return data;
  }
}
