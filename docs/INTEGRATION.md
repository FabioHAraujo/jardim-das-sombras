# 🦇 Guia Canônico de Integração — Jardim das Sombras & Ravena-AI

> **Documento técnico canônico** para implementar a integração da API do **Jardim das Sombras** no bot **Ravena-AI** para WhatsApp, Telegram e Discord.

---

## 📌 1. Arquitetura e Visão Geral

O **Jardim das Sombras** é um microsserviço RESTful independente de alta performance construído com **Fastify 4**, renderização gráfica acelerada por hardware via **`@napi-rs/canvas`** e persistência **PostgreSQL (Prisma ORM)**.

```
┌─────────────────────────────────┐
│     Usuários (Chat / Grupos)    │
│   WhatsApp / Telegram / Discord │
└────────────────┬────────────────┘
                 │ (Texto / Imagem / Stickers)
                 ▼
┌─────────────────────────────────┐
│            Ravena-AI            │ ◄─── Comandos (!fazenda, !plantar, !colher, etc.)
│     (Bot Host / Container)      │ ───► Despacha bônus externos (Pesca, Waifus, Cassino)
└────────────────┬────────────────┘
                 │ HTTP REST (JSON + Buffer PNG)
                 ▼
┌─────────────────────────────────┐
│     Jardim das Sombras API      │ ◄─── Porta 3040 (http://localhost:3040)
│   (jardim-api / Fastify 4)      │ ───► Banco Postgres + Renderizador Isométrico
└─────────────────────────────────┘
```

### Configurações de Conexão
- **Host Local / Desenvolvimento:** `http://localhost:3040`
- **Host Docker (na mesma rede):** `http://jardim-api:3040`
- **Cabeçalho de Autenticação:** `x-api-key: <API_KEY>` ou `Authorization: Bearer <API_KEY>`
- **API Key Padrão (Ambiente Local):** Configurada no `.env` como `API_KEY` (ex: `jardim_secret_api_key_2026`).

> [!NOTE]
> O container `jardim-bot` (bot de testes do Telegram) está configurado no perfil `profiles: ["test"]` no `docker-compose.yml`. Ele **não** roda por padrão em produção e não interfere na Ravena-AI.

---

## 🔑 2. Headers e Autenticação

Para requisições que alteram estado (plantio, colheita, compras, uso de itens, recompensas e administração), envie:

```http
Content-Type: application/json
x-api-key: jardim_secret_api_key_2026
```

Ou:

```http
Content-Type: application/json
Authorization: Bearer jardim_secret_api_key_2026
```

Rotas de consulta pública (`GET /health`, `GET /farm/:user_id`, `GET /farm/:user_id/image`, `GET /shop`, `GET /inventory/:user_id`, `GET /rankings/*`) não exigem autenticação.

---

## 🗺️ 3. Catálogo Completo de Endpoints

> 📖 **Nota:** Para a especificação técnica exaustiva de cada rota com esquemas JSON completos e respostas de erro, consulte também [`docs/API.md`](API.md).

### 3.1. Estado da Fazenda e Renderização Gráfica

| Método | Endpoint | Auth | Descrição |
|---|---|---|---|
| `GET` | `/health` | Pública | Healthcheck e status do serviço. |
| `GET` | `/farm/:user_id` | Pública | Retorna JSON com o status dos 9 canteiros, Petalitas, estatísticas, inventário e buffs ativos. |
| `GET` | `/farm/:user_id/image` | Pública | Retorna o **Buffer binário PNG (1024x1024)** da fazenda renderizada. |
| `GET` | `/farm/:user_id/admin-url` | `API_KEY` | Retorna link único autenticado para o Farm Admin web interativo. |

#### Parâmetros de Query úteis em `/farm/:user_id/image`:
- `?tooltips=true`: Renderiza badges estilizadas sobre os canteiros indicando a planta e o tempo restante.
- `?tooltip_style=1|2`: Estilo visual das placas (`1` = padrão gótico suave, `2` = placa gótica chanfrada com dourado).
- `?format=base64`: Retorna `{ image: "data:image/png;base64,..." }` em vez de binário puro.
- `?time_override=day|dawn|night`: Força ciclo de iluminação (dia, alvorecer ou noite).

---

### 3.2. Ações de Cultivo, Colheita e Consumíveis

| Método | Endpoint | Auth | Payload Exemplo | Descrição |
|---|---|---|---|---|
| `POST` | `/farm/:user_id/plant` | `API_KEY` | `{"itemId": 1, "slot": 3}` ou `{"itemId": "nightshade"}` | Planta semente. Se `slot` for omitido, planta em todos os canteiros vazios disponíveis. |
| `POST` | `/farm/:user_id/harvest` | `API_KEY` | `{"all": true}` ou `{"slot": 1}` | Colhe plantas prontas, limpa canteiros mortos e retorna relatório de Petalitas e bônus. |
| `POST` | `/farm/:user_id/use` | `API_KEY` | `{"itemId": 31, "slot": 1}` | Usa um consumível/elixir da mochila (pelo número 31 a 39 ou pelo ID). |
| `POST` | `/farm/:user_id/daily` | `API_KEY` | `{}` | Reivindica a Sacola do Coveiro (Petalitas e sementes diárias aleatórias). |
| `POST` | `/farm/:user_id/decorate` | `API_KEY` | `{"decorId": 13, "slotIndex": 1}` ou `{"decorId": 13, "x": 200, "y": 750}` | Posiciona item decorativo por slot periférico (1 a 4) ou coordenadas livres `(x, y)`. |
| `POST` | `/farm/:user_id/sell` | `API_KEY` | `{"all": true}` ou `{"itemId": "crop_01_nightshade", "quantity": 5}` | Vende colheitas do inventário por Petalitas. Enfeites VIP têm venda bloqueada. |
| `GET` | `/farm/:user_id/harvest-totals` | `API_KEY` | Nenhum | Retorna o total acumulado histórico colhido de cada planta (para reconciliação de bônus). |

---

### 3.3. Loja, Inventário e Rankings

| Método | Endpoint | Auth | Descrição |
|---|---|---|---|
| `GET` | `/shop?user_id=:user_id` | Pública | Retorna sementes (1-12), consumíveis (31-34, 39) e enfeites (13-30), com limites diários restantes. Enfeites ocultos/VIP não aparecem. |
| `POST` | `/shop/buy/:user_id` | `API_KEY` | Compra sementes, consumíveis ou enfeites. Retorna dados da compra e `stickerBase64` com a figurinha da badge. |
| `GET` | `/inventory/:user_id` | Pública | Retorna inventário ordenado do jogador: colheitas, sementes, consumíveis e decorações. |
| `GET` | `/rankings/wealth` | Pública | Placar dos 10 jogadores com maior saldo de Petalitas. |
| `GET` | `/rankings/farmers` | Pública | Placar dos 10 jogadores com maior total de colheitas bem-sucedidas. |

---

### 3.4. Administração e Doações VIP

| Método | Endpoint | Auth | Payload Exemplo | Descrição |
|---|---|---|---|---|
| `POST` | `/admin/give` | `API_KEY` | `{"userId": "123", "itemId": "40", "amount": 1, "coins": 5000}` | Concede Petalitas, sementes, elixires ou decorações VIP (IDs 40 a 48). |
| `POST` | `/admin/buff` | `API_KEY` | `{"userId": "123", "type": "growth_time_multiplier", "value": 0.8, "durationHours": 24}` | Aplica multiplicadores temporários ou permanentes na fazenda (ex: benefícios para apoiadores do bot). |

---

## 🌾 4. Despacho de Bônus de Colheita (Pesca, Waifus e Cassino)

Ao executar `POST /farm/:user_id/harvest`, a API computa o rendimento das plantas e retorna a lista de bônus prontos para serem despachados no ecossistema da Ravena.

### 4.1. Mapeamento Canônico de Bônus das 12 Plantas

| ID | Planta | Categoria | `bonusType` | Descrição / Efeito | Como a Ravena-AI deve despachar |
|:---:|---|---|---|---|---|
| **1** | Erva-Moura | Economia | `none` | Erva simples, barata, difícil de morrer e pouco retorno | **Venda no Empório**: 80 Ptl ao vender a colheita. |
| **2** | Cogumelo Tumular | Economia | `none` | Cogumelos delicados, morre fácil, mas dá um bom retorno | **Venda no Empório**: 600 Ptl ao vender a colheita. |
| **3** | Lírio Cadáver | Economia | `none` | Planta complexa, bom para cultivos longos com bom retorno | **Venda no Empório**: 1.000 Ptl ao vender a colheita. |
| **4** | Lótus Negra | Economia | `none` | Planta rara, delicada, excelente retorno | **Venda no Empório**: 4.000 Ptl ao vender a colheita. |
| **5** | Rastejante de Névoa | Pesca | `fishing_buff` | 1x Item de buff aleatório de pesca | Concede item de buff no inventário de pesca (`fishingService.grantRandomBuff(userId, 1 * drop.count)`) |
| **6** | Alga do Estige | Pesca | `fishing_weight_buff` | +15% a 50% peso no próximo peixe | Ativa buff de peso na próxima pescaria (`fishingService.addNextFishWeightBuff(userId, drop.count)`) |
| **7** | Cabaça Espectral | Pesca | `fishing_inventory_boost` | 1x Item de inventário de pesca | Concede equipamento ou expansão de bolsa (`fishingService.grantRandomEquipment(userId, 1 * drop.count)`) |
| **8** | Raiz Devoradora | Pesca | `fishing_baits_5` | 5x Iscas Vivas Sangrentas | Adiciona 5 iscas vivas por planta (`fishingService.addBait(userId, 'live_blood_bait', 5 * drop.count)`) |
| **9** | Trevo de Obsidiana | Cassino | `casino_standard_chips` | 5x Fichas comuns de aposta | Credita 5 fichas comuns por planta (`casinoService.addChips(userId, 5 * drop.count)`) |
| **10** | Trevo Dourado | Cassino | `casino_gold_chips` | 25x Fichas de Ouro | Credita 25 fichas de ouro por planta (`casinoService.addGoldChips(userId, 25 * drop.count)`) |
| **11** | Coração Púrpuro | Waifus | `waifu_rolls` | 2x Rolls de invocação do Waifuletes | Adiciona 2 rolls por planta (`waifuService.addRolls(userId, 2 * drop.count)`) |
| **12** | Rosa de Sangue | Waifus | `waifu_premium_ticket` | 1x Ticket Especial de Waifu Rara | Adiciona 1 ticket raro por planta (`waifuService.addPremiumTickets(userId, 1 * drop.count)`) |

### 4.2. Exemplo de Resposta do `POST /farm/:user_id/harvest`:
```json
{
  "success": true,
  "totalCoinsEarned": 5900,
  "clearedWitheredCount": 0,
  "harvested": [
    {
      "plantId": "04_black_lotus",
      "name": "Lótus Negra",
      "category": "economia",
      "bonusType": "coins",
      "bonusDescription": "Gera 4.000 Petalitas na colheita",
      "count": 1,
      "coinsEarned": 4000
    },
    {
      "plantId": "08_devouring_root_v2",
      "name": "Raiz Devoradora",
      "category": "pesca",
      "bonusType": "fishing_baits_5",
      "bonusDescription": "Concede 5x Iscas Vivas Sangrentas",
      "count": 1,
      "coinsEarned": 1100
    },
    {
      "plantId": "10_golden_clover",
      "name": "Trevo Dourado",
      "category": "cassino",
      "bonusType": "casino_gold_chips",
      "bonusDescription": "Concede 25x Fichas de Ouro para máquinas de alta aposta",
      "count": 1,
      "coinsEarned": 900
    }
  ]
}
```

### 4.3. Handler de Despacho Completo na Ravena-AI:
```javascript
// Exemplo canônico em ravena-ai/src/commands/jardim/colher.js
const harvestResult = await shadowGarden.harvest(userId);

for (const drop of harvestResult.harvested) {
  switch (drop.bonusType) {
    case 'coins':
      // As Petalitas já são somadas e persistidas diretamente na API da fazenda.
      break;

    // --- PESCA ---
    case 'fishing_buff':
      // ID 5: Rastejante de Névoa — concede 1 buff aleatório de pesca por planta
      await fishingService.grantRandomBuff(userId, 1 * drop.count);
      break;

    case 'fishing_weight_buff':
      // ID 6: Alga do Estige — concede bônus de peso (+15% a +50%) no próximo peixe
      await fishingService.addNextFishWeightBuff(userId, drop.count);
      break;

    case 'fishing_inventory_boost':
      // ID 7: Cabaça Espectral — concede 1 item/equipamento de pesca por planta
      await fishingService.grantRandomEquipment(userId, 1 * drop.count);
      break;

    case 'fishing_baits_5':
      // ID 8: Raiz Devoradora — concede 5 iscas vivas sangrentas por planta
      await fishingService.addBait(userId, 'live_blood_bait', 5 * drop.count);
      break;

    // --- CASSINO ---
    case 'casino_standard_chips':
      // ID 9: Trevo de Obsidiana — concede 5 fichas comuns por planta
      await casinoService.addChips(userId, 5 * drop.count);
      break;

    case 'casino_gold_chips':
      // ID 10: Trevo Dourado — concede 25 fichas de ouro por planta
      await casinoService.addGoldChips(userId, 25 * drop.count);
      break;

    // --- WAIFUS ---
    case 'waifu_rolls':
      // ID 11: Coração Púrpuro — concede 2 rolls de Waifuletes por planta
      await waifuService.addRolls(userId, 2 * drop.count);
      break;

    case 'waifu_premium_ticket':
      // ID 12: Rosa de Sangue — concede 1 ticket raro de waifu por planta
      await waifuService.addPremiumTickets(userId, 1 * drop.count);
      break;

    default:
      console.warn(`[Jardim] bonusType desconhecido: ${drop.bonusType}`);
      break;
  }
}
```

---

## ⚗️ 5. Catálogo de Consumíveis & Elixires (IDs 31 a 39)

Consumíveis ficam guardados na mochila e são acionados via `!usar [elixir] [slot?]`:

| N° | ID | Nome | Efeito | Loja |
|---|---|---|---|---|
| **31** | `blood_ruby` | Rubi Sanguíneo | Finaliza imediatamente o crescimento da planta com maior tempo restante. | 1.000 Ptl (10/dia) |
| **32** | `niflheim_frost` | Geada de Niflheim | Congela o tempo de apodrecimento (*wither*) das plantas por 24 horas. | 1.500 Ptl (5/dia) |
| **33** | `styx_essence` | Essência do Estige | Finaliza imediatamente o crescimento de todas as plantas da fazenda. | 10.000 Ptl (5/dia) |
| **34** | `void_nectar` | Néctar do Vazio | Reduz o tempo de crescimento das plantas pela metade durante 24 horas. | 10.000 Ptl (5/dia) |
| **35** | `midas_tear` | Lágrima de Midas | +10% permanente de ganho de Petalitas na colheita (efeito cumulativo). | Exclusivo VIP / Doações |
| **36** | `gargoyle_bile` | Bílis de Gárgula | Item místico misterioso (sem efeito ativo ainda; item preservado ao usar). | Exclusivo VIP / Doações |
| **37** | `spectral_sigh` | Suspiro Espectral | -5% tempo de crescimento permanente (aditivo, **limitado rigorosamente a 75%**). | Exclusivo VIP / Doações |
| **38** | `liquid_ashes` | Cinzas Líquidas | +5% permanente de chance de itens raros na sacola diária. | Exclusivo VIP / Doações |
| **39** | `widows_filter` | Filtro da Viúva | Dobra a chance de itens especiais na sacola diária durante 7 dias. | 20.000 Ptl (1/dia) |

---

## 🏛️ 6. Catálogo de Enfeites & Decorações

### 6.1. Enfeites Comuns da Loja (IDs 13 a 30)
Itens decorativos para embelezar o terreno, compráveis na loja e equipáveis com `!decorar`:
- **Simples (500k Ptl):** 13 (Pedregulhos), 14 (Velas Derretidas), 15 (Ossos e Crânios), 16 (Placas de Madeira), 17 (Cogumelos Necróticos), 18 (Poças do Estige).
- **Médios (1.5M Ptl):** 19 (Lampiões Quebrados), 20 (Lápides de Xisto), 21 (Cercas Amaldiçoadas), 22 (Vasos Canópicos), 23 (Carrinho do Coveiro), 24 (Espantalhos Assustadores).
- **Complexos (6.66M Ptl):** 25 (Gárgulas Vigias), 26 (Altares de Obsidiana), 27 (Fontes Góticas), 28 (Árvores Retorcidas), 29 (Portais de Névoa), 30 (Estátuas de Anjos Caídos).

### 6.2. Enfeites VIP Ocultos (IDs 40 a 48)
Não aparecem na loja nem podem ser vendidos. Podem ser dados aos usuários via comando de admin ou sistema de doação (`/admin/give`):
- **40:** Coroa do Rei Caído (`decor_19_fallen_king_crown`)
- **41:** Aglomerado de Diamantes Sanguíneos (`decor_20_blood_diamond_cluster`)
- **42:** Cálice de Ouro Derretido (`decor_21_molten_gold_chalice`)
- **43:** Lápide de Mármore e Ouro (`decor_22_marble_gold_tombstone`)
- **44:** Lampião de Fogo de Safira (`decor_23_sapphire_fire_lantern`)
- **45:** Gárgula de Ouro Maciço (`decor_24_solid_gold_gargoyle`)
- **46:** Lua de Cristal Aprisionada (`decor_25_imprisoned_crystal_moon`)
- **47:** Fonte Imperial de Platina (`decor_26_platinum_imperial_fountain`)
- **48:** Sol Obscuro de Niflheim (`decor_27_dark_sun_niflheim`)

---

## 📍 7. Posicionamento de Decorações via Foto com Emoji

O bot suporta posicionamento interativo de decorações quando o usuário envia uma foto com legenda `!decorar [enfeite]` contendo um emoji (como 📍 ou 🕯️):

```javascript
// Algoritmo de Centróide implementado na Ravena:
// 1. Baixar a imagem original renderizada da fazenda do jogador (sem decorações extras)
// 2. Comparar os pixels da imagem recebida com a imagem original usando Sharp
// 3. Detectar a maior concentração de pixels divergentes (o emoji colado)
// 4. Calcular o centroide (avgX, avgY)
// 5. Chamar shadowGarden.decorate(userId, { decorId, x: Math.round(avgX), y: Math.round(avgY) })
```

Caso o usuário use texto puro, os seguintes formatos são suportados:
- `!decorar 13 1` (Posiciona no slot periférico 1)
- `!decorar 13 250 750` (Posiciona nas coordenadas X=250, Y=750)
- `!decorar 13 250,750` (Posiciona nas coordenadas X=250, Y=750)

---

## 💻 8. Cliente Canônico para Ravena-AI (`ShadowGardenClient.js`)

Crie o arquivo em `ravena-ai/src/services/ShadowGardenClient.js`:

```javascript
/**
 * ShadowGardenClient — Cliente de Integração com a API do Jardim das Sombras
 */
export class ShadowGardenClient {
  constructor(baseUrl = process.env.JARDIM_API_URL || 'http://localhost:3040', apiKey = process.env.JARDIM_API_KEY || 'jardim_secret_api_key_2026') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
    };
  }

  async _handleResponse(res, fallbackError) {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.message || err.error || `${fallbackError} (HTTP ${res.status})`;
      throw new Error(msg);
    }
    return await res.json();
  }

  // 1. Status da Fazenda
  async getStatus(userId) {
    const res = await fetch(`${this.baseUrl}/farm/${userId}`);
    return this._handleResponse(res, 'Falha ao buscar status da fazenda');
  }

  // 2. Imagem Renderizada (Buffer binário PNG)
  async getImageBuffer(userId, withTooltips = true) {
    const url = `${this.baseUrl}/farm/${userId}/image${withTooltips ? '?tooltips=true' : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao obter imagem da fazenda: HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // 3. Plantar
  async plant(userId, itemId, slot = null, amount = null) {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/plant`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ itemId, slot, amount }),
    });
    return this._handleResponse(res, 'Falha ao plantar semente');
  }

  // 4. Colher
  async harvest(userId, slot = null, all = true) {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/harvest`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ slot, all }),
    });
    return this._handleResponse(res, 'Falha ao colher plantas');
  }

  // 5. Usar Consumível / Elixir
  async useConsumable(userId, itemId, slot = null) {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/use`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ itemId, slot }),
    });
    return this._handleResponse(res, 'Falha ao usar elixir');
  }

  // 6. Sacola Diária do Coveiro
  async claimDaily(userId) {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/daily`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({}),
    });
    return this._handleResponse(res, 'Falha ao coletar recompensa diária');
  }

  // 7. Loja
  async getShop(userId) {
    const res = await fetch(`${this.baseUrl}/shop?user_id=${userId}`);
    return this._handleResponse(res, 'Falha ao carregar catálogo da loja');
  }

  // 8. Comprar
  async buy(userId, itemId, quantity = 1) {
    const res = await fetch(`${this.baseUrl}/shop/buy/${userId}`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ itemId, quantity }),
    });
    return this._handleResponse(res, 'Falha ao comprar item');
  }

  // 9. Inventário
  async getInventory(userId) {
    const res = await fetch(`${this.baseUrl}/inventory/${userId}`);
    return this._handleResponse(res, 'Falha ao buscar inventário');
  }

  // 10. Vender Colheitas
  async sell(userId, options = {}) {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/sell`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(options),
    });
    return this._handleResponse(res, 'Falha ao vender colheitas');
  }

  // 11. Posicionar Enfeite
  async decorate(userId, options) {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/decorate`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(options),
    });
    return this._handleResponse(res, 'Falha ao posicionar enfeite');
  }

  // 12. Link de Acesso do Farm Admin
  async getAdminUrl(userId) {
    const res = await fetch(`${this.baseUrl}/farm/${userId}/admin-url`, {
      headers: this._headers(),
    });
    return this._handleResponse(res, 'Falha ao gerar link do Farm Admin');
  }

  // 13. Concessão de Admin (Dar Petalitas / Itens / VIPs)
  async adminGive(userId, { coins = 0, itemId = null, amount = 1, reason = 'admin_grant' } = {}) {
    const res = await fetch(`${this.baseUrl}/admin/give`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ userId, coins, itemId, amount, reason }),
    });
    return this._handleResponse(res, 'Falha ao conceder itens via admin');
  }

  // 14. Aplicar Buffs de Status (Apoiadores / Doações)
  async adminBuff(userId, { type, value, durationHours = null, source = 'vip_grant' }) {
    const res = await fetch(`${this.baseUrl}/admin/buff`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ userId, type, value, durationHours, source }),
    });
    return this._handleResponse(res, 'Falha ao aplicar buff');
  }

  // 15. Rankings
  async getWealthRanking() {
    const res = await fetch(`${this.baseUrl}/rankings/wealth`);
    return this._handleResponse(res, 'Falha ao buscar ranking de riqueza');
  }

  async getFarmersRanking() {
    const res = await fetch(`${this.baseUrl}/rankings/farmers`);
    return this._handleResponse(res, 'Falha ao buscar ranking de colheitas');
  }
}
```

---

## 💬 9. Formatação Recomendada para os Comandos no Chat

### 9.1. `!fazenda` / `!jardim`
Envia a imagem renderizada (`imageBuffer`) com a legenda:
```text
🦇 Jardim das Sombras de @Jogador
🌱 Petalitas: 1.450 Ptl | 🌾 Colheitas: 48 | 💀 Murchas: 2

[1] 🌱 Erva-Moura (Crescendo) - ⏳ 14m
[2] 🟩 Canteiro Vazio
[3] ✨ Lótus Negra (Pronta!) - ⚠️ Colha antes de apodrecer
[4] 🪱 Rastejante de Névoa (Semente) - ⏳ 38m
[5] 🟩 Canteiro Vazio
[6] 💀 Cogumelo Tumular (Morta)
[7] 🟩 Canteiro Vazio
[8] 🪨 Trevo Dourado (Crescendo) - ⏳ 1h 45m
[9] 🟩 Canteiro Vazio

🏛️ Decorações:
• [Slot 1]: 🎃 Espantalhos Assustadores
• [Slot 4]: ⛓️ Estátuas de Anjos Caídos

⚡ Bônus Ativos:
• ⚡ Velocidade de Crescimento: 2.0x (Néctar do Vazio)
• 🌱 Ganho de Petalitas: +20% (Lágrima de Midas)

💡 Comandos: !plantar [semente] | !colher | !usar [elixir] | !loja | !inventario
```

### 9.2. `!colher`
Formatação estrita de rendimento sem porcentagens confusas:
```text
🌾 Colheita Concluída!

🌱 Petalitas Totais: +2.000 Ptl

📦 Itens e Bônus Despachados:
• Raiz Devoradora (x1) -> 5x Iscas Vivas Sangrentas enviadas ao seu cesto de pesca!
• Trevo Dourado (x1) -> 25x Fichas de Ouro creditadas na sua conta do Cassino!
```

### 9.3. `!comprar [item] [qtd?]`
Se a resposta incluir `stickerBase64`, converta para sticker no WhatsApp/Telegram:
```text
✅ Compra Realizada com Sucesso!

🛒 Item: 5x Rubi Sanguíneo
🌱 Custo Total: 5.000 Ptl
🌱 Saldo Restante: 22.450 Ptl
🎒 Quantidade na Mochila: 5x

💡 Dica: Use `!usar 31` para ativar este elixir!
```

### 9.4. `!inventario`
Estrutura em seções rigorosamente ordenadas:
```text
🎒 Inventário — Jardim das Sombras
🌱 Saldo: 12.350 Ptl

🌾 Colheitas (Prontas para Venda):
• Lírio Cadáver (Colhida): x3 (🌱 800 Ptl/un)

🌱 Sementes:
• [1] Semente de Erva-Moura: x10
• [4] Semente de Lótus Negra: x2

⚗️ Consumíveis & Elixires:
• [31] Rubi Sanguíneo: x2 (Finaliza planta mais lenta)
• [35] Lágrima de Midas: x1 (+10% Petalitas permanente)

🏛️ Enfeites & Decorações:
• [13] Pedregulhos com Musgo Sombrio: x1 (📍 No Terreno)
• [40] Coroa do Rei Caído (VIP): x1 (🎒 Na Mochila)

💡 Comandos: !plantar [id] | !usar [id] | !decorar [id] | !vender tudo
```

### 9.5. `!fazenda-admin`
Gera URL segura e efémera para visualização e edição web:
```text
🛠️ Painel da Sua Fazenda

Acesse o link abaixo para gerenciar seu terreno, arrastar enfeites livremente e visualizar seus bônus:
🔗 https://jds.seudominio.com/farm/admin/a1b2c3d4e5f6...

⚠️ Este link é pessoal e expira em 30 minutos.
```

---

## 🤖 10. Como Replicar a Implementação do Bot do Telegram na Ravena-AI

O bot de referência em [`bot/src/telegram-bot.ts`](../bot/src/telegram-bot.ts) foi construído para servir de modelo de implementação direto para chatbots (Telegram, WhatsApp via Baileys/Wppconnect ou Discord). Abaixo estão os 7 padrões canônicos que devem ser espelhados na Ravena-AI:

### 10.1. `!fazenda`: Execução Paralela + Auto-Claim da Sacola Diária
Ao invés de exigir um comando isolado para coletar o bônus diário, o bot executa a coleta silenciosa em paralelo no momento em que o jogador abre a fazenda:

```javascript
// Exemplo em ravena-ai/src/commands/jardim/fazenda.js
const isPrivateChat = chat.isPrivate; // WhatsApp DM / Telegram PV

// 1. Busca imagem, status, link de admin e tenta coletar a diária simultaneamente
const [status, imageBuffer, dailyResult, adminData] = await Promise.all([
  client.getStatus(userId),
  client.getImageBuffer(userId, true), // com tooltips
  client.claimDaily(userId).catch(() => ({ claimed: false, alreadyClaimed: true })),
  isPrivateChat ? client.getAdminUrl(userId).catch(() => null) : Promise.resolve(null),
]);

// 2. Envia a foto da fazenda com a legenda formatada dos 9 canteiros
const caption = buildFarmCaption(status, userName, adminData?.url);
await bot.sendPhoto(chatId, imageBuffer, { caption });

// 3. Se a sacola diária foi resgatada agora, dispara notificação de presente logo abaixo!
if (dailyResult.claimed && dailyResult.coinsWon) {
  let dailyMsg = `🎁 *Sacola do Coveiro Coletada!* (Bônus Diário)\n`;
  dailyMsg += `🌱 Petalitas encontradas: *+${dailyResult.coinsWon.toLocaleString('pt-BR')} Ptl*\n`;
  if (dailyResult.itemsWon?.length > 0) {
    dailyMsg += `🌱 Sementes recebidas:\n`;
    for (const it of dailyResult.itemsWon) {
      dailyMsg += `• *${it.name}* (x${it.count})\n`;
    }
  }
  dailyMsg += `\n_Volte amanhã para resgatar mais recompensas!_`;
  await bot.sendMessage(chatId, dailyMsg);
}
```

### 10.2. `!plantar` e `!plantar_tudo`: Flexibilidade de Entrada
- O bot aceita tanto o número da semente (`1` a `12`) quanto o nome textual aproximado (ex: `erva`, `lotus`, `obsidiana`).
- Suporta plantio pontual: `!plantar 1 1` (slot 1, semente 1) ou `!plantar 1 nightshade`.
- Suporta plantio rápido em todos os slots vazios: `!plantar_tudo 4` (chama `client.plant(userId, 4, undefined, 9)`).

### 10.3. `!colher`: Colheita Total e Despacho de Bônus
- `!colher` sempre chama `client.harvest(userId, null, true)` (colhendo todos os canteiros prontos de uma vez e limpando canteiros murchos).
- Itera sobre `harvestResult.harvested` e executa o `switch (drop.bonusType)` documentado na **Seção 4**.
- Se `harvestResult.clearedWitheredCount > 0`, adiciona à mensagem: `🧹 Plantas apodrecidas removidas: ${res.clearedWitheredCount}`.

### 10.4. `!comprar`: Emissão de Sticker / Figurinha
A API retorna `res.stickerBase64` contendo a imagem gerada da semente ou item com selo temático:
```javascript
// Exemplo em ravena-ai/src/commands/jardim/comprar.js
const res = await client.buy(userId, itemId, quantity);

if (res.stickerBase64) {
  const stickerBuffer = Buffer.from(res.stickerBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  // WhatsApp: envia como sticker WebP
  // Telegram: envia via sendSticker
  await bot.sendSticker(chatId, stickerBuffer);
}

await bot.sendMessage(chatId, `✅ Compra realizada!\n📦 Item: *${res.itemName}* (x${res.quantityBought})\n🌱 Total: ${res.totalCost.toLocaleString('pt-BR')} Ptl`);
```

### 10.5. `!decorar`: Detecção de Foto com Emoji (Sharp) ou Coordenadas
O comando aceita 3 modalidades:
1. `!decorar [id] [slot]` (slots periféricos 1 a 4).
2. `!decorar [id] [X] [Y]` ou `!decorar [id] [X,Y]` (coordenadas livres).
3. Foto com emoji (o usuário responde a foto da fazenda com um emoji no local desejado):
   - O bot compara a imagem enviada com o buffer base da fazenda redimensionados em matriz `256x256` via `sharp`.
   - Localiza a média ponderada dos pixels divergentes (o centróide) e multiplica por 4 para mapear de volta ao canvas `1024x1024`.

### 10.6. `!inventario` e `!vender_tudo`: Gestão de Itens
- **Prefixação `crop_`**: Toda planta colhida vai para a mochila com o prefixo `crop_` (ex: `crop_01_nightshade`).
- Ao renderizar o `!inventario`, separe os itens em 4 blocos:
  1. `🌾 Colheitas`: itens com prefixo `crop_` (indicando preço de venda unitário).
  2. `🌱 Sementes`: itens com ID de semente pura (1 a 12).
  3. `⚗️ Consumíveis`: itens com ID de elixires (31 a 39).
  4. `🏛️ Enfeites`: decorações compradas ou VIP.
- `!vender_tudo`: Chama `client.sell(userId, { all: true })` para liquidar todas as colheitas acumuladas instantaneamente.

### 10.7. `!fazenda-admin`: Painel Interativo Web Seguro
- Chama `client.getAdminUrl(userId)` e envia o link gerado exclusivamente no privado (PV / DM) do usuário.
- O link possui token efémero com validade de 30 minutos e permite ao usuário arrastar enfeites livremente e acompanhar sua plantação em tempo real pelo navegador.

