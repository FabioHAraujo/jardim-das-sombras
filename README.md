# 🦇 Jardim das Sombras (Shadow Garden)

> Microsserviço RESTful Headless de minigame de fazenda gótica e cultivo sombrio para o ecossistema **Ravena-AI**.

---

## 📖 Visão Geral

O **Jardim das Sombras** é um minigame com estética gótica (inspirado em Niflheim / Ragnarok Online / 16-bit SNES Pixel Art) desenvolvido em arquitetura de microsserviço independente.

- **Backend:** Node.js 22 LTS, Fastify 4, TypeScript (strict), Prisma ORM, PostgreSQL.
- **Renderizador Gráfico 2.5D:** `@napi-rs/canvas` de alta performance gerando composições isométricas dinâmicas dos 9 canteiros e 4 slots decorativos periféricos em menos de 30ms.
- **Bot de Apresentação:** Telegram Test Bot construído em `grammy` com teclado inline interativo.

---

## 📁 Estrutura do Repositório

```
jardim-das-sombras/
├── api/                        # Microsserviço RESTful Headless
│   ├── prisma/                 # Schema e Migrations Prisma
│   ├── src/
│   │   ├── config.ts           # Variáveis de ambiente validadas com Zod
│   │   ├── errors/             # DomainError e ErrorCodes
│   │   ├── plugins/            # Plugins Fastify (Prisma, Auth)
│   │   ├── routes/             # Rotas REST (/farm, /shop, /inventory, /rankings, /admin)
│   │   ├── services/           # Regras de Negócio e CanvasRendererService
│   │   ├── utils/              # Catálogo estático das 12 plantas e 18 decorações
│   │   └── server.ts           # Instanciação Fastify
│   ├── tests/                  # Testes automatizados com Vitest
│   └── Dockerfile              # Imagem de produção multi-stage
├── assets/                     # Sprites recortados e fundos otimizados (1024x1024)
│   ├── backgrounds/            # Dia, Amanhecer e Noite
│   └── sprites/
│       ├── plants/             # 48 sprites (12 plantas x 3 estágios + variantes)
│       └── decorations/        # 18 itens decorativos de prestígio
├── artwork/                    # Artes brutas geradas por IA (backup/referência)
├── bot/                        # Bot de testes para Telegram (grammy)
├── docs/
│   └── INTEGRATION.md          # Guia Canônico de Integração para Ravena-AI
├── scripts/
│   └── slice_sprites.js        # Pipeline de chroma-key e corte de sprites
├── docker-compose.yml          # Orquestração do microsserviço + PostgreSQL 16
└── gdd_jardim_das_sombras.md   # Game Design Document canônico
```

---

## 🚀 Como Executar

### 1. Via Makefile (Atalhos Rápidos)
```bash
make up          # Sobe o ambiente completo (API + PostgreSQL)
make logs        # Acompanha logs unificados em tempo real
make status      # Exibe status e portas dos containers
make test        # Executa os testes automatizados
make down        # Encerra os containers
```

### 2. Via Docker Compose Direto (Produção)

```bash
docker compose up -d --build
```
A API iniciará em `http://127.0.0.1:3040`.

### 3. Execução Local para Desenvolvimento

#### API:
```bash
cd api
npm install
cp .env.example .env
npx prisma generate
npm run dev
```

#### Bot de Testes (Telegram):
```bash
cd bot
npm install
npm start
```

### 3. Rodando os Testes Automatizados
```bash
cd api
npm run test
```

---

## 🌾 As 12 Plantas Místicas

| ID | Nome | Categoria | Preço Semente | Tempo Crescimento | Lucro / Bônus |
|---|---|---|---|---|---|
| `01_nightshade` | Erva-Moura | Economia | 50 Ptl | 15 min | Gera 80 Ptl (+60%) |
| `02_tomb_shroom` | Cogumelo Tumular | Economia | 200 Ptl | 20 min | Gera 600 Ptl (+200%) |
| `03_corpse_lily` | Lírio Cadáver | Economia | 400 Ptl | 3 horas | Gera 1.000 Ptl (+150%) |
| `04_black_lotus` | Lótus Negra | Economia (Rara) | 1.000 Ptl | 8 horas | Gera 4.000 Ptl (+300%) |
| `05_mist_crawler_v2` | Rastejante de Névoa | Pesca | 80 Ptl | 45 min | 3x Iscas Pálidas |
| `06_styx_kelp_v2` | Alga do Estige | Pesca | 200 Ptl | 2 horas | +15% Peso Pesca |
| `07_spectral_gourd_v2` | Cabaça Espectral | Pesca | 500 Ptl | 6 horas | +5 Slots Pesca |
| `08_devouring_root_v2` | Raiz Devoradora | Pesca | 900 Ptl | 10 horas | 5x Iscas Vivas |
| `09_obsidian_clover` | Trevo de Obsidiana | Cassino | 150 Ptl | 1.5 horas | 5x Fichas Comuns |
| `10_golden_clover` | Trevo Dourado | Cassino | 750 Ptl | 1h 52m | 25x Fichas Ouro |
| `11_purple_heart` | Coração Púrpuro | Waifus | 300 Ptl | 3 horas | 2x Rolls Base |
| `12_blood_rose` | Rosa de Sangue | Waifus | 1.200 Ptl | 12 horas | 1x Ticket Raro |

---

## 🏛️ Itens Decorativos & Posicionamento Livre
- **Simples (500k Ptl):** Pedregulhos com Musgo, Velas Derretidas, Ossos e Crânios, Placas de Madeira, Cogumelos Necróticos, Poças do Estige.
- **Médios (1.5M Ptl):** Lampiões Quebrados, Lápides de Xisto, Cercas Amaldiçoadas, Vasos Canópicos, Carrinho do Coveiro, Espantalhos Assustadores.
- **Complexos (6.66M Ptl):** Gárgulas Vigias, Altares de Obsidiana, Fontes de Sangue, Árvores Retorcidas, Portais de Névoa, Estátuas de Anjos Caídos.

> 📍 **Posicionamento WhatsApp-Friendly:** O jogador pode posicionar itens enviando a imagem da fazenda com um emoji (ex: 📍) ou figurinha marcado no local desejado (fora da área dos canteiros 3x3) ou via coordenadas `(x, y)` / slots periféricos (1 a 4).

---

## 📱 Comandos do Bot (Paridade WhatsApp / Telegram)
- `!fazenda` ou `!jardim`: Envia a imagem atual da fazenda e **coleta automaticamente a Sacola do Coveiro** (bônus diário enviado logo abaixo em mensagem separada).
- `!plantar [slot] [semente]`: Planta semente em slot específico ou em todos os vazios.
- `!colher` ou `!colher_tudo`: Colhe colheitas prontas e exibe o resumo com Petalitas (🌱) e bônus externos.
- `!loja` ou `!loja [pagina]`: Catálogo numerado sequencialmente de 1 a 30 (1-12 sementes, 13-30 decorações).
- `!comprar [numero] [quantidade]`: Compra itens de forma prática digitando apenas o número do item.
- `!inventario`: Exibe sementes, colheitas e decorações no inventário com preços de venda.
- `!vender [item] [quantidade]`: Vende colheitas ou sementes por Petalitas.
- `!vender_tudo`: Vende todas as colheitas acumuladas no inventário.
- `!decorar [numero/id]` (com foto + emoji): Posiciona o enfeite no local indicado pela imagem.
- `!ranking`: Exibe o Top 10 fazendeiros do reino.

---

## 🔌 Rotas e Especificação da API REST

O microsserviço disponibiliza mais de 30 endpoints organizados por domínio (Cultivo, Decorações, Loja, Inventário, Rankings, Administração e Super Admin).

| Grupo | Endpoints Principais | Autenticação |
|---|---|---|
| **Fazenda & Gráficos** | `GET /farm/:user_id`, `GET /farm/:user_id/image`, `GET /farm` | Pública / Token |
| **Ações de Cultivo** | `POST /farm/:user_id/plant`, `POST /farm/:user_id/harvest`, `POST /farm/:user_id/use` | API_KEY / Token |
| **Economia & Loja** | `GET /shop`, `POST /shop/buy/:user_id`, `POST /farm/:user_id/sell` | Pública / API_KEY |
| **Mochila & Decoração** | `GET /inventory/:user_id`, `POST /farm/:user_id/decorate`, `PUT /farm/:user_id/decorations` | Pública / API_KEY |
| **Rankings & Digests** | `GET /rankings/wealth`, `GET /rankings/farmers`, `GET /rankings/digest` | Pública |
| **Administração Bot** | `POST /admin/give`, `POST /admin/give-all`, `POST /admin/buff`, `POST /admin/transfer` | API_KEY (Fail-closed) |
| **Super Admin** | `GET /super-admin`, `POST /super-admin/api/plants`, `POST /super-admin/api/reload` | Super Admin Password |

📖 **Acesse a documentação completa com todos os parâmetros, esquemas JSON e exemplos em:**
👉 **[`docs/API.md`](docs/API.md)**

---

## 📚 Documentação de Integração & Ravena-AI

O **Jardim das Sombras** foi concebido especificamente como o microsserviço de backend do ecossistema de bots **[Ravena-AI](https://github.com/moothz/ravena-ai)** (com suporte multiplataforma para WhatsApp, Telegram e Discord).

- Para payloads JSON de request/response, autenticação via chave de API e código cliente em TypeScript/JavaScript pronto para uso no bot, consulte o guia canônico:
  👉 **[`docs/INTEGRATION.md`](docs/INTEGRATION.md)**

---

## 🤝 Contribuição e Diretrizes para Agentes de IA

Contribuições de desenvolvedores e agentes autônomos de IA (LLMs) são muito bem-vindas! Consulte o arquivo **[`CONTRIBUTING.md`](CONTRIBUTING.md)** para conhecer:
- Regras de segurança e sanitização (Zero Leaks).
- Padrões de tipagem estrita com TypeScript ESM.
- Checklist obrigatório de testes antes de pull requests.
