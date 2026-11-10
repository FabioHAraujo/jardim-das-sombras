# GDD: Jardim das Sombras (Minigame de Fazenda - Ravena-AI)

## 1. Visão Geral e Arquitetura

**Nome do Módulo:** Jardim das Sombras (Shadow Garden)
**Estética:** Gótica, Niflheim, Ragnarok Online, Sombrio, Neblina. High-end 16-bit SNES Pixel Art.
**Plataforma Base:** Telegram / WhatsApp (Interação por comandos de texto iniciados por `!`).
**Arquitetura:** Microsserviço Independente (API REST). O minigame não rodará no mesmo processo do bot principal. Será uma aplicação Dockerizada, rodando na rede interna, escutando uma porta específica. O bot cliente fará requisições HTTP passando o `user_id` e receberá JSON ou Buffers de imagem como resposta.

## 2. Layout da Fazenda e Composições

A fazenda será gerada no backend usando `node-canvas` e retornada como uma imagem nas respostas.

* **Perspectiva:** Isométrica (2.5D).
* **Proporção:** Quadrada (1:1).
* **Grid Base:** 3x3 tiles de terra com bordas de madeira/pedra (9 espaços no total). Posicionamento estrito e idêntico.
* **Cenários (Ciclos de Tempo):** Dia, Entardecer, Noite.
* **Camadas de Renderização (Z-Index):** Background da Fazenda -> Enfeites -> Tiles/Sprites das Plantas -> Ícones flutuantes de Status.

## 3. As 12 Plantas Místicas e Estágios (Sprite Sheets)

Todas as plantas possuem 3 estágios visuais (Semente, Crescendo, Pronta).

### 🌱 Plantas de Economia (Venda / Moeda Padrão: Petalitas [Ptl])
1. **Erva-Moura (Nightshade):** Semente roxa -> Caule torto -> Arbusto com bagas roxas brilhantes.
2. **Cogumelo Tumular (Tomb Shroom):** Esporos esverdeados -> Aglomerado cinzento -> Colônia com brilho fantasmagórico.
3. **Lírio Cadáver (Corpse Lily):** Semente/casulo -> Bulbo marrom fechado -> Flor escarlate monstruosa emitindo névoa tóxica.
4. **Lótus Negra (Black Lotus):** Botão negro -> Pétalas cor de ônix -> Flor negra com contornos roxos e joia no miolo.

### 🎣 Plantas de Pesca (Sinergia)
5. **Rastejante de Névoa (Mist Crawler) [Dá Isca]:** Bolsa verde-clara -> Caule pálido -> Caules retorcidos com esferas roxas.
6. **Alga do Estige (Styx Kelp) [Aumenta Peso]:** Concha negra -> Algas gosmentas -> Monte denso de algas verde-escuras molhadas.
7. **Cabaça Espectral (Spectral Gourd) [Boost Inventário]:** Gota esbranquiçada -> Caule flutuante mágico -> Abóbora com rosto de lamento.
8. **Raiz Devoradora (Devouring Root) [Boost Qtd Iscas]:** Ninho negro -> Tentáculos se espalhando -> Ninho caótico com raízes vermelho-sangue.

### 🎰 Plantas do Cassino (Slots)
9. **Trevo de Obsidiana (Obsidian Clover) [Fichas Base]:** Duas moedas de obsidiana -> Broto escuro -> Arbusto prateado com trevos metálicos escuros.
10. **Trevo Dourado (Golden Clover) [Fichas Premium]:** Duas moedas de ouro -> Broto dourado -> Arbusto com trevos de ouro puro e brilhante.

### 💖 Plantas de Waifus (Gacha)
11. **Coração Púrpuro (Purple Heart) [Recupera Rolls Base]:** Coração roxo no chão -> Coração flutuante emitindo névoa roxa -> Coração roxo gigante flutuando sobre folhas escuras.
12. **Rosa de Sangue (Blood Rose) [Recupera Rolls Premium]:** Coração escarlate com espinhos -> Flor-coração com aura flamejante -> Rosa vermelho-sangue flamejante protegida por espinhos espessos.

## 4. Engenharia e Otimização do Node-Canvas

Para garantir performance na API Dockerizada:
* **Geração em Duas Etapas:** A "Base" (Chão + Muros + Enfeites comprados) é cacheada no servidor por `user_id`.
* O endpoint de visualização da fazenda apenas pega a "Base" do usuário e aplica um `composite` (carimba) com as sementes/plantas ativas usando `node-canvas`.

## 5. Loja e Mecânicas de Recompensa

* **Sacola do Coveiro (Daily Reward):** Um pacote diário que concede sementes aleatórias, Petalitas (Ptl) do jogo e chance de itens raros.
* **Loja de Itens:** Usuários podem comprar sementes e cosméticos.
  * **Sistema de Estoque (Limites):** Alguns itens possuem limites globais (ex: Apenas 10 Lótus Negras vendidas no servidor por dia) e limites por player (ex: Máximo de 5 sementes normais por dia). Restaura a cada X horas.
* **VIP / Donator:** Jogadores marcados com a flag VIP possuem multiplicadores de ganho, tempo reduzido de crescimento e sobrevida (wither) estendida das plantas.

## 6. Endpoints da API (Microsserviço)

A comunicação entre o Bot (Ravena-AI) e a API da Fazenda se dará pelos seguintes endpoints:

### Core e Status
* `GET /farm/:user_id` -> Retorna os dados da fazenda em JSON (Status das 9 slots, Petalitas) e um link/buffer da Imagem renderizada. Aceita query `?vip=true` ou `?multiplier=1.5` vindos do bot.

### Ações do Jogador
* `POST /farm/:user_id/daily` -> Coleta a "Sacola do Coveiro".
* `POST /farm/:user_id/plant` -> Planta uma semente. Body: `{ item_id, slot (opcional), random (boolean), amount }`. Permite plantar em slot específico, espalhar sementes em slots aleatórios vazios, ou plantar `X` sementes de uma vez.
* `POST /farm/:user_id/harvest` -> Colhe plantas. Body: `{ slot (opcional), all (boolean) }`.

### Economia e Loja
* `GET /shop` -> Lista o catálogo atual e os estoques restantes (Globais e por Player).
* `POST /shop/buy/:user_id` -> Compra itens. Body: `{ item_id, quantity }`.

### Rankings
* `GET /rankings/wealth` -> Retorna o top N de jogadores com mais Petalitas do minigame.
* `GET /rankings/farmers` -> Retorna o top N de jogadores por volume de plantações colhidas com sucesso.

### Admin
* `POST /admin/give` -> Endpoint privado. Body: `{ user_id, item_id, amount, reason }`. Dá Petalitas, sementes ou itens mágicos para usuários diretamente.

## 7. Interface e UX (Texto no Chatbot)

O limite da legenda na mensagem é de **900 caracteres**. O prefixo padrão no bot será `!`, mas a API independe disso.

**Mockup Visual da Resposta do Bot (Interpretando a API):**

```text
🦇 Jardim Sombrio de @Jogador 
📅 Cultivando desde: 12/10/2026

📊 Status:
🌱 Plantadas: 142 | 📦 Colhidas: 120 | 💀 Mortas: 22

[1] 🌱 Erva-Moura (Crescendo) - ⏳ 1h 20m
[2] 🟩 Vazio
[3] ✨ Trevo Dourado (Pronta!) - ⚠️ Colha em < 4h
[4] 💀 Lótus Negra (Morta)
[5] 🪱 Rastejante de Névoa (Semente) - ⏳ 5h
... (até o 9)

💡 Dicas: !plantar [slot] [item] ou !plantar_tudo [item]
```

## 8. Banco de Dados e Modelagem (Prisma ORM + PostgreSQL)

Utilizaremos **PostgreSQL** para facilitar backups (ex: via Supabase) e manter robustez relacional. O **Prisma** será o ORM da API.

**Rascunho do Schema (`schema.prisma`):**

```prisma
model Player {
  id              String          @id // User ID do Telegram/WhatsApp
  coins           Int             @default(0)
  createdAt       DateTime        @default(now())
  lastDailyAt     DateTime?       // Rastreio da Sacola do Coveiro
  
  // Estatísticas
  totalPlanted    Int             @default(0)
  totalHarvested  Int             @default(0)
  totalWithered   Int             @default(0)

  slots           FarmSlot[]
  inventory       Inventory[]
  purchases       DailyPurchase[] // Rastreio de limite de loja
}

model FarmSlot {
  id          Int       @id @default(autoincrement())
  playerId    String
  player      Player    @relation(fields: [playerId], references: [id])
  slotIndex   Int       // 1 a 9
  plantId     String?   // ID da planta ou null se vazio
  plantedAt   DateTime?
  harvestAt   DateTime? // Quando fica pronta
  witherAt    DateTime? // Quando morre (se passar do tempo)
}

model Inventory {
  id        Int     @id @default(autoincrement())
  playerId  String
  player    Player  @relation(fields: [playerId], references: [id])
  itemId    String
  quantity  Int     @default(0)

  @@unique([playerId, itemId])
}

// Controle de Estoque da Loja Global
model GlobalShopLimit {
  itemId         String   @id
  maxPerDay      Int
  currentSold    Int      @default(0)
  lastResetAt    DateTime @default(now())
}

// Controle de Compras por Jogador (Limite por Player)
model DailyPurchase {
  id        Int      @id @default(autoincrement())
  playerId  String
  player    Player   @relation(fields: [playerId], references: [id])
  itemId    String
  quantity  Int
  date      DateTime @db.Date // Salva apenas a data para resetar meia-noite

  @@unique([playerId, itemId, date])
}
```

## 9. Instruções de Implementação (Prompt / Diretrizes para Agentes)

* **Contexto do Repositório:** A estrutura da API do Jardim das Sombras funciona como um módulo de jogo desacoplado do ecossistema `ravena-ai`.
* **Stack Obrigatória:** Node.js, Fastify (roteamento REST), `@napi-rs/canvas` (renderização de alta performance), Prisma ORM, PostgreSQL, Docker e Docker Compose.
* **Paradigma:** O código não deve conter comandos do bot de chat diretamente. Ele funciona estritamente como uma API Headless na rede interna aguardando payloads.
* O bot externo tratará a UX, os prefixos (`!`) e chamará a API nos endpoints designados para buscar a imagem e o JSON de resposta.