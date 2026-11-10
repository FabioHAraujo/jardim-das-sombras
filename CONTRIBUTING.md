# Guia de Contribuição — Jardim das Sombras (Shadow Garden)

Bem-vindo ao repositório do **Jardim das Sombras**! Este projeto é um microsserviço RESTful headless de fazenda gótica desenvolvido como parte do ecossistema do bot **Ravena-AI**.

Este documento serve de guia para **desenvolvedores humanos** e **agentes autônomos de IA** (Coding Agents como Gemini, Claude, Cursor, Copilot, etc.) que forem criar novas funcionalidades, corrigir bugs ou estender a integração.

---

## 🏗️ 1. Arquitetura e Filosofia do Projeto

- **Headless & Desacoplado:** A API não lida diretamente com mensagens ou protocolos de chat (WhatsApp, Telegram, Discord). A API fornece endpoints REST protegidos e renderiza imagens isométricas via `@napi-rs/canvas`.
- **Ecosistema Ravena-AI:** O bot externo ([Ravena-AI](https://github.com/moothz/ravena-ai)) orquestra os comandos de chat (`!fazenda`, `!plantar`, `!colher`), interage com o usuário e consome esta API.
- **Fail Closed & Validações:** Erros de domínio usam `DomainError` com códigos HTTP semânticos e mensagens em Português. Nenhuma exceção de validação deve passar silenciosamente.

---

## 🤖 2. Diretrizes Específicas para Agentes de IA (AI Agents Guidelines)

Se você é um agente de IA operando neste repositório, você **DEVE** seguir rigorosamente as regras abaixo:

### 2.1. Segurança e Privacidade (Privacidade Zero Leaks)
1. **Nunca use caminhos absolutos do host:** Proibido usar caminhos como `/home/...`, `/Users/...` ou referências à máquina local. Use caminhos relativos ou construídos dinamicamente via `path.resolve(__dirname, ...)`.
2. **Sem domínios privados como padrão:** Variáveis como `PUBLIC_URL` e `API_URL` devem ter como fallback padrão `http://localhost:3040`. Domínios de produção devem vir estritamente de variáveis de ambiente.
3. **Sem segredos no código ou git:** Nunca commite tokens reais, senhas, telefones de usuários ou chaves no repositório. Use `.env.example` para documentar variáveis.

### 2.2. Padrões de Código e TypeScript
1. **Node.js ESM Strict:** O projeto usa ECMAScript Modules (`"type": "module"`). Todas as importações relativas em arquivos TypeScript **precisam** conter a extensão `.js`:
   ```typescript
   // ✅ Correto:
   import { config } from '../config.js';
   import { DomainError } from '../errors/DomainError.js';

   // ❌ Errado:
   import { config } from '../config';
   ```
2. **Tipagem Estrita:** Evite o uso de `any` em assinaturas públicas e rotas. Valide entradas de API e variáveis de ambiente com esquemas `zod`.

### 2.3. Verificação Obrigatória (Checklist Pré-Conclusão)
Antes de finalizar qualquer alteração ou abrir pull request:
1. **Testes Unitários:** Execute `npm test` dentro de `api/` (Vitest). Todos os testes devem passar (100% green).
2. **Typecheck:** Execute `npx tsc --noEmit` em `api/` e em `bot/`. Não deve haver erros de compilação.
3. **Integridade de Documentação:** Mantenha a documentação sincronizada em `README.md` e [`docs/INTEGRATION.md`](docs/INTEGRATION.md) se criar ou alterar rotas.

---

## 🚀 3. Como Configurar o Ambiente de Desenvolvimento

### Pré-requisitos
- Node.js 22 LTS ou superior
- Docker e Docker Compose (opcional para rodar com banco)
- npm 10+

### Instalação Rápida com Docker
```bash
# 1. Clone o repositório
git clone https://github.com/moothz/jardim-das-sombras.git
cd jardim-das-sombras

# 2. Configure as variáveis de ambiente
cp .env.example .env

# 3. Inicie os containers com o Makefile
make up

# 4. Acompanhe os logs
make logs
```

### Execução Local (Sem Docker)
```bash
# API
cd api
npm install
cp .env.example .env
npx prisma generate
npm run dev

# Bot de testes (opcional)
cd ../bot
npm install
npm run dev
```

---

## 🧪 4. Testes Automatizados

O repositório conta com uma suíte de testes unitários abrangente cobrindo:
- Catálogo de sementes e decorações
- Cálculos econômicos de colheita e sacola diária
- Renderização isométrica de canteiros com Canvas
- Limites de compra e consumíveis mágicos

```bash
cd api
npm run test
```

---

## 📦 5. Convenção de Commits

Seguimos a convenção [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` Nova funcionalidade
- `fix:` Correção de bug
- `test:` Inclusão ou ajuste de testes
- `docs:` Alterações em documentação
- `refactor:` Refatoração de código sem alteração funcional
- `chore:` Tarefas de manutenção e infraestrutura
