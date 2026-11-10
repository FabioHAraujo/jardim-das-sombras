# 📖 Referência Completa da API REST — Jardim das Sombras

Este documento descreve detalhadamente todos os endpoints expostos pelo microsserviço **Jardim das Sombras**, incluindo métodos HTTP, regras de autenticação, parâmetros de consulta (*query string*), esquemas de corpo de requisição (*request body*) e respostas JSON.

---

## 🔐 1. Modelos de Autenticação

A API implementa 4 níveis de segurança:

1. **Pública:** Não exige cabeçalhos nem tokens. Utilizada para renderização pública de fazendas, placares e catálogo da loja.
2. **API_KEY (Bot / Integração):** Exigida em rotas de mutação disparadas pelo bot (Ravena-AI).
   - Header: `x-api-key: <API_KEY>` ou `Authorization: Bearer <API_KEY>`
3. **Admin Token do Usuário:** Token HMAC efémero gerado para a interface web de gestão da fazenda (`/farm?id=...&token=...`), válido por 3 dias e renovado a cada acesso.
   - Header: `Authorization: Bearer <TOKEN>`, `x-admin-token: <TOKEN>` ou query `?token=<TOKEN>` ou Cookie `jds_admin_token`.
4. **Super Admin Password:** Autenticação por hash SHA-256 e tempo constante para o painel de backoffice.
   - Header: `x-admin-password: <SUPER_ADMIN_PASSWORD>` (com rate-limit de 10 tentativas erradas / 15 minutos de bloqueio).

---

## 🧭 2. Visão Geral das Rotas

| Categoria | Método | Rota | Autenticação | Descrição |
|---|---|---|---|---|
| **Sistema** | `GET` | `/health` | Pública | Healthcheck e timestamp do serviço |
| **Sistema** | `GET` | `/texts` | Pública | Dicionário de emojis, nomes e textos de UX |
| **Fazenda** | `GET` | `/farm/:user_id` | Pública | Estado completo dos 9 canteiros, saldo e estatísticas |
| **Fazenda** | `GET` | `/farm/:user_id/image` | Pública | Buffer PNG/JPEG binário da fazenda renderizada |
| **Fazenda** | `GET` | `/farm/share/image` | Pública | Renderização gráfica pública por UUID |
| **Fazenda** | `GET` | `/farm` | Pública / Token | Página HTML interativa (Pública ou Painel Admin) |
| **Fazenda** | `GET` | `/farm/:user_id/admin-url` | `API_KEY` | Gera link seguro com token de sessão web |
| **Cultivo** | `POST` | `/farm/:user_id/plant` | `API_KEY` / User Token | Plantio de sementes em slots |
| **Cultivo** | `POST` | `/farm/:user_id/harvest` | `API_KEY` / User Token | Colheita de plantas e limpeza de murchas |
| **Cultivo** | `GET` | `/farm/:user_id/harvest-totals` | `API_KEY` | Histórico cumulativo de colheitas por planta |
| **Cultivo** | `POST` | `/farm/:user_id/daily` | `API_KEY` / User Token | Coleta da Sacola Diária do Coveiro |
| **Cultivo** | `POST` | `/farm/:user_id/use` | `API_KEY` / User Token | Uso de consumíveis e elixires mágicos |
| **Cultivo** | `POST` | `/farm/:user_id/sell` | `API_KEY` / User Token | Venda de colheitas do inventário |
| **Fazenda** | `PATCH` | `/farm/:user_id/name` | `API_KEY` / User Token | Altera o nome personalizado da fazenda |
| **Decorações** | `POST` | `/farm/:user_id/decorate` | `API_KEY` / User Token | Equipa/posiciona item decorativo |
| **Decorações** | `PUT` | `/farm/:user_id/decorations` | `API_KEY` / User Token | Atualização em lote de coordenadas livres |
| **Decorações** | `DELETE` | `/farm/:user_id/decorate/:slot_index` | `API_KEY` / User Token | Remove item decorativo de um slot |
| **Loja & Mochila** | `GET` | `/shop` | Pública | Catálogo da loja com estoque diário restante |
| **Loja & Mochila** | `POST` | `/shop/buy/:user_id` | `API_KEY` / User Token | Compra de sementes, itens e decorações |
| **Loja & Mochila** | `GET` | `/inventory/:user_id` | Pública | Inventário com sementes, colheitas e consumíveis |
| **Rankings** | `GET` | `/rankings/wealth` | Pública | Top 10 fazendeiros com maior saldo de Petalitas |
| **Rankings** | `GET` | `/rankings/farmers` | Pública | Top 10 jogadores com maior total colhido |
| **Rankings** | `GET` | `/rankings/digest` | Pública | Resumo consolidado para digests e eventos |
| **Administração** | `POST` | `/admin/give` | `API_KEY` (Fail Closed) | Concede Petalitas, sementes, itens ou VIPs |
| **Administração** | `POST` | `/admin/give-all` | `API_KEY` (Fail Closed) | Distribui recompensas para toda a comunidade |
| **Administração** | `POST` | `/admin/buff` | `API_KEY` (Fail Closed) | Aplica multiplicadores temporários ou permanentes |
| **Administração** | `POST` | `/admin/transfer` | `API_KEY` (Fail Closed) | Transfere itens e moedas entre jogadores |
| **Super Admin** | `GET` | `/super-admin` | Super Admin | Dashboard HTML de backoffice |
| **Super Admin** | `GET` | `/super-admin/api/data` | Super Admin | Dados brutos de plantas, itens e textos |
| **Super Admin** | `POST` | `/super-admin/api/plants` | Super Admin | Cria ou edita planta com upload de sprites |
| **Super Admin** | `POST` | `/super-admin/api/decorations` | Super Admin | Cria ou edita decoração com upload de sprite |
| **Super Admin** | `POST` | `/super-admin/api/consumables` | Super Admin | Cria ou edita consumível com upload de sprite |
| **Super Admin** | `POST` | `/super-admin/api/reload` | Super Admin | Recarrega catálogo e texturas em memória |

---

## 📋 3. Detalhamento dos Endpoints

---

### 3.1. Sistema & Healthcheck

#### `GET /health`
Verifica a integridade do serviço Fastify e conectividade interna.
- **Autenticação:** Nenhuma
- **Resposta Sucesso (200 OK):**
```json
{
  "status": "ok",
  "time": "2026-11-10T12:00:00.000Z"
}
```

#### `GET /texts`
Retorna dicionário de strings e emojis configurados no jogo.
- **Autenticação:** Nenhuma
- **Resposta Sucesso (200 OK):**
```json
{
  "currency_name": "Petalitas",
  "currency_symbol": "ptl",
  "currency_emoji": "🌱",
  "farm_title": "Jardim das Sombras"
}
```

---

### 3.2. Estado e Visualização da Fazenda

#### `GET /farm/:user_id`
Obtém o estado completo da fazenda do jogador.
- **Parâmetros de Rota:** `user_id` (string, ID único do jogador no bot)
- **Query Params:**
  - `include_image`: Se `'base64'`, inclui o buffer da fazenda no payload.
  - `time_override`: `'day'` | `'dawn'` | `'night'` (força ciclo de iluminação).
- **Resposta Sucesso (200 OK):**
```json
{
  "playerId": "5511999999999",
  "farmName": "Bosque dos Lamentos",
  "uuid": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "coins": 1250,
  "stats": {
    "totalPlanted": 42,
    "totalHarvested": 38,
    "totalWithered": 2
  },
  "slots": [
    {
      "slotIndex": 1,
      "plantId": "01_nightshade",
      "plantName": "Erva-Moura",
      "category": "economia",
      "stage": "growing",
      "remainingSecondsToHarvest": 420,
      "remainingSecondsToWither": 18420
    },
    {
      "slotIndex": 2,
      "plantId": null,
      "plantName": null,
      "category": null,
      "stage": "empty",
      "remainingSecondsToHarvest": 0,
      "remainingSecondsToWither": 0
    }
  ],
  "decorations": [
    {
      "slotIndex": 1,
      "decorId": "13_watcher_gargoyle",
      "name": "Gárgula Vigia",
      "x": 180,
      "y": 720
    }
  ],
  "shareUrl": "http://localhost:3040/farm?id=f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

#### `GET /farm/:user_id/image`
Gera e renderiza a composição isométrica da fazenda em alta velocidade (<30ms).
- **Parâmetros de Rota:** `user_id` (string)
- **Query Params:**
  - `format`: `'png'` (padrão) | `'jpeg'` | `'base64'`.
  - `tooltips`: `'true'` | `'false'` (se renderiza placas com tempos restantes).
  - `tooltip_style`: `1` (estilo suave) ou `2` (estilo chanfrado gótico).
  - `time_override`: `'day'` | `'dawn'` | `'night'`.
  - `user_name`: Nome exibido no topo do brasão da fazenda.
  - `header_style`: `1` a `4` (estilos de brasão/banner).
- **Headers de Resposta:** `Content-Type: image/png` (ou `image/jpeg`), `ETag`, `Cache-Control`.
- **Resposta:** Binário puro da imagem gerada (1024x1024px).

#### `GET /farm/:user_id/admin-url`
Gera link autenticado e efêmero para edição web da fazenda.
- **Autenticação:** `x-api-key`
- **Resposta Sucesso (200 OK):**
```json
{
  "url": "http://localhost:3040/farm?id=f47ac10b...&token=eyJhbGciOi...",
  "token": "eyJhbGciOi...",
  "expiresAt": 1794500000000,
  "uuid": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

---

### 3.3. Cultivo, Colheita e Consumíveis

#### `POST /farm/:user_id/plant`
Planta sementes nos canteiros da fazenda.
- **Autenticação:** `x-api-key` ou User Token
- **Corpo da Requisição (JSON):**
```json
{
  "itemId": 1,
  "slot": 3,
  "amount": 1,
  "witherMultiplier": 1.0
}
```
*Notas:*
- `itemId`: Aceita tanto o índice numérico da semente (`1` a `12`) quanto o ID textual (`"01_nightshade"` ou `"nightshade"`).
- Se `slot` for omitido, a API planta automaticamente em todos os canteiros vazios disponíveis até o limite de sementes no inventário.
- **Resposta Sucesso (200 OK):**
```json
{
  "success": true,
  "plantedCount": 1,
  "plantName": "Erva-Moura",
  "slots": [3],
  "harvestAt": "2026-11-10T12:15:00.000Z"
}
```

#### `POST /farm/:user_id/harvest`
Colhe plantas prontas e limpa canteiros com plantas murchas (*withered*).
- **Autenticação:** `x-api-key` ou User Token
- **Corpo da Requisição (JSON):**
```json
{
  "all": true,
  "slot": null
}
```
*Notas:*
- Se `all: true`, colhe todos os slots prontos. Se `slot` for informado (ex: `1`), colhe somente aquele slot.
- **Resposta Sucesso (200 OK):**
```json
{
  "success": true,
  "totalCoinsEarned": 320,
  "clearedWitheredCount": 0,
  "harvested": [
    {
      "plantId": "01_nightshade",
      "name": "Erva-Moura",
      "category": "economia",
      "bonusType": "coins",
      "bonusDescription": "Gera 80 Ptl (+60%)",
      "count": 4,
      "coinsEarned": 320
    }
  ]
}
```

#### `GET /farm/:user_id/harvest-totals`
Retorna a soma histórica cumulativa de colheitas feitas pelo jogador para cada tipo de planta. Utilizado pelo bot externo para reconciliação de drops (ex: iscas de pesca, rolls de waifus e fichas de cassino) sem depender do inventário temporário.
- **Autenticação:** `x-api-key`
- **Resposta Sucesso (200 OK):**
```json
{
  "userId": "5511999999999",
  "totals": [
    { "itemId": "crop_01_nightshade", "totalHarvested": 50 },
    { "itemId": "crop_08_devouring_root_v2", "totalHarvested": 12 }
  ]
}
```

#### `POST /farm/:user_id/daily`
Resgata a recompensa diária da **Sacola do Coveiro** (reseta diariamente às 03:00 BRT).
- **Autenticação:** `x-api-key` ou User Token
- **Corpo:** `{}`
- **Resposta Sucesso (200 OK):**
```json
{
  "claimed": true,
  "alreadyClaimed": false,
  "coinsWon": 500,
  "itemsWon": [
    { "itemId": "seed_01_nightshade", "name": "Semente de Erva-Moura", "count": 3 }
  ],
  "message": "Você abriu a Sacola do Coveiro e encontrou 500 🌱 e 3x Sementes de Erva-Moura!"
}
```

#### `POST /farm/:user_id/use`
Usa um consumível ou elixir mágico da mochila do jogador.
- **Autenticação:** `x-api-key` ou User Token
- **Corpo da Requisição (JSON):**
```json
{
  "itemId": 31,
  "slot": 1
}
```
*Notas:* Aceita número do catálogo (`31` a `39`) ou ID textual (ex: `"blood_ruby"`). O parâmetro `slot` é opcional e exigido apenas para elixires focados em um canteiro individual.
- **Resposta Sucesso (200 OK):**
```json
{
  "success": true,
  "itemId": "blood_ruby",
  "itemName": "Rubi Sanguíneo",
  "effectApplied": "growth_completed",
  "affectedSlots": [1],
  "remainingQuantity": 2
}
```

#### `POST /farm/:user_id/sell`
Vende colheitas do inventário em troca de Petalitas.
- **Autenticação:** `x-api-key` ou User Token
- **Corpo da Requisição (JSON):**
```json
{
  "all": true
}
```
*Ou para venda parcial:*
```json
{
  "itemId": "crop_01_nightshade",
  "quantity": 10
}
```
- **Resposta Sucesso (200 OK):**
```json
{
  "success": true,
  "totalCoinsEarned": 800,
  "soldItems": [
    {
      "itemId": "crop_01_nightshade",
      "name": "Erva-Moura (Colhida)",
      "quantity": 10,
      "unitPrice": 80
    }
  ],
  "newCoinsBalance": 2050
}
```

---

### 3.4. Gestão de Decorações & Personalização

#### `POST /farm/:user_id/decorate`
Equipa uma decoração no terreno.
- **Autenticação:** `x-api-key` ou User Token
- **Corpo da Requisição (JSON):**
```json
{
  "decorId": 13,
  "slotIndex": 1
}
```
*Ou com coordenadas livres (x, y):*
```json
{
  "decorId": "13_watcher_gargoyle",
  "x": 250,
  "y": 780
}
```
- **Resposta Sucesso (200 OK):**
```json
{
  "success": true,
  "equipped": {
    "slotIndex": 1,
    "decorId": "13_watcher_gargoyle",
    "name": "Gárgula Vigia",
    "x": 250,
    "y": 780
  }
}
```

#### `PUT /farm/:user_id/decorations`
Atualização em lote de coordenadas livres das decorações (usado pelo drag-and-drop web).
- **Autenticação:** `x-api-key` ou User Token
- **Corpo da Requisição (JSON):**
```json
{
  "decorations": [
    { "slotIndex": 1, "decorId": "13_watcher_gargoyle", "x": 210, "y": 750 },
    { "slotIndex": 2, "decorId": "14_obsidian_altar", "x": 820, "y": 730 }
  ]
}
```

#### `DELETE /farm/:user_id/decorate/:slot_index`
Desequipa o item decorativo de determinado slot e retorna-o para a mochila.
- **Autenticação:** `x-api-key` ou User Token
- **Resposta Sucesso (200 OK):**
```json
{
  "success": true,
  "unequippedSlot": 1,
  "returnedItemId": "13_watcher_gargoyle"
}
```

#### `PATCH /farm/:user_id/name`
Atualiza o título/nome da fazenda do jogador.
- **Autenticação:** `x-api-key` ou User Token
- **Corpo:** `{"farmName": "Jardim das Almas Perdidas"}`
- **Resposta Sucesso (200 OK):**
```json
{
  "success": true,
  "farmName": "Jardim das Almas Perdidas"
}
```

---

### 3.5. Loja e Inventário

#### `GET /shop`
Retorna o catálogo completo de compra, com preços, restrições e limites diários restantes para o jogador consultado.
- **Query Params:** `user_id` (opcional, calcula limites de compra do dia)
- **Resposta Sucesso (200 OK):**
```json
{
  "seeds": [
    {
      "index": 1,
      "id": "01_nightshade",
      "name": "Erva-Moura",
      "category": "economia",
      "price": 50,
      "sellPrice": 80,
      "growthMinutes": 15,
      "dailyLimit": 10,
      "remainingToday": 7
    }
  ],
  "decorations": [
    {
      "index": 13,
      "id": "13_dark_mossy_boulders",
      "name": "Pedregulhos com Musgo",
      "price": 500000,
      "tier": "simples"
    }
  ],
  "consumables": [
    {
      "index": 31,
      "id": "blood_ruby",
      "name": "Rubi Sanguíneo",
      "price": 1000,
      "dailyLimit": 10,
      "remainingToday": 10
    }
  ]
}
```

#### `POST /shop/buy/:user_id`
Realiza a compra de itens na loja com dedução imediata de Petalitas.
- **Autenticação:** `x-api-key` ou User Token
- **Corpo da Requisição (JSON):**
```json
{
  "itemId": 1,
  "quantity": 5
}
```
- **Resposta Sucesso (200 OK):**
```json
{
  "success": true,
  "itemIndex": 1,
  "itemId": "01_nightshade",
  "itemName": "Erva-Moura",
  "quantityBought": 5,
  "totalCost": 250,
  "remainingCoins": 1800,
  "newInventoryQuantity": 5,
  "stickerBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
}
```

#### `GET /inventory/:user_id`
Retorna a mochila completa do jogador com colheitas, sementes, decorações e consumíveis.
- **Autenticação:** Nenhuma
- **Resposta Sucesso (200 OK):**
```json
{
  "userId": "5511999999999",
  "coins": 1800,
  "items": [
    {
      "itemId": "crop_01_nightshade",
      "baseId": "01_nightshade",
      "catalogIndex": 1,
      "name": "Erva-Moura (Colhida)",
      "type": "crop",
      "quantity": 12
    },
    {
      "itemId": "01_nightshade",
      "baseId": "01_nightshade",
      "catalogIndex": 1,
      "name": "Erva-Moura",
      "type": "seed",
      "quantity": 5
    }
  ]
}
```

---

### 3.6. Rankings & Comunidade

#### `GET /rankings/wealth`
Top 10 jogadores com maior riqueza acumulada em Petalitas.
- **Query Params:** `limit` (padrão: 10, máx: 50)
- **Resposta:**
```json
{
  "type": "wealth",
  "ranking": [
    { "rank": 1, "userId": "551188888888", "coins": 9500000, "totalHarvested": 1240 }
  ]
}
```

#### `GET /rankings/farmers`
Top 10 jogadores com maior volume de plantas colhidas.
- **Query Params:** `limit` (padrão: 10, máx: 50)

#### `GET /rankings/digest`
Estatísticas globais e resumo coletivo para resumos semanais do bot.
- **Resposta:**
```json
{
  "players": [...],
  "topCrop": { "itemId": "crop_01_nightshade", "count": 8420 },
  "topDecorator": { "playerId": "551177777777", "count": 18 },
  "topDecorators": [...]
}
```

---

### 3.7. Operações Administrativas (Restrito ao Bot)

Todas as rotas `/admin/*` **falham fechado** (`401/403 UNAUTHORIZED`) caso o cabeçalho `x-api-key` não seja fornecido ou seja inválido.

#### `POST /admin/give`
Concede moedas, sementes, decorações regulares ou decorações exclusivas VIP (IDs `40` a `48`).
- **Autenticação:** `x-api-key`
- **Corpo:**
```json
{
  "userId": "5511999999999",
  "coins": 10000,
  "itemId": "40",
  "amount": 1,
  "reason": "apoiador_vip"
}
```

#### `POST /admin/give-all`
Concede itens ou moedas para toda a base de jogadores da comunidade de forma transacional.
- **Autenticação:** `x-api-key`
- **Corpo:**
```json
{
  "coins": 2000,
  "itemId": "seed_01_nightshade",
  "amount": 3,
  "reason": "evento_lua_de_sangue"
}
```

#### `POST /admin/buff`
Aplica multiplicador de crescimento ou bônus temporário.
- **Autenticação:** `x-api-key`
- **Corpo:**
```json
{
  "userId": "5511999999999",
  "type": "growth_time_multiplier",
  "value": 0.8,
  "durationHours": 24,
  "source": "waifu_tier_bonus",
  "replaceSource": true
}
```

#### `POST /admin/transfer`
Transfere itens ou moedas entre dois usuários de maneira atômica e segura.
- **Autenticação:** `x-api-key`
- **Corpo:**
```json
{
  "fromUserId": "551111111111",
  "toUserId": "552222222222",
  "items": [
    { "itemId": "crop_01_nightshade", "amount": 5 }
  ]
}
```
