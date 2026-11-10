.PHONY: help up up-api up-all down up-bot down-bot logs-bot restart restart-api restart-db logs logs-api logs-db build status shell-api shell-db test test-watch bot-start clean

# Habilita o Docker BuildKit por padrão para builds mais rápidas
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

help:
	@echo "🦇 Jardim das Sombras - Atalhos Make"
	@echo "======================================"
	@echo "  make up          - Atualização rápida da API (build incremental sem reiniciar o DB)"
	@echo "  make up-api      - Alias para 'make up' (atualização rápida da API)"
	@echo "  make up-all      - Constrói e inicia todos os serviços (--build full)"
	@echo "  make up-bot      - Atualiza e inicia o container do bot de testes (Telegram)"
	@echo "  make down-bot    - Para e remove o container do bot de testes"
	@echo "  make down        - Para e remove os containers da rede"
	@echo "  make build       - Reconstrói a imagem Docker da API"
	@echo "  make restart     - Reinicia os containers"
	@echo "  make restart-api - Reinicia apenas o container da API"
	@echo "  make restart-db  - Reinicia apenas o container do PostgreSQL"
	@echo "  make status      - Exibe status e portas dos containers"
	@echo "  make logs        - Acompanha logs unificados em tempo real"
	@echo "  make logs-api    - Acompanha apenas os logs da API"
	@echo "  make logs-bot    - Acompanha apenas os logs do bot de testes"
	@echo "  make logs-db     - Acompanha apenas os logs do PostgreSQL"
	@echo "  make shell-api   - Abre shell sh interativo dentro do container da API"
	@echo "  make shell-db    - Abre shell interativo psql no PostgreSQL"
	@echo "  make test        - Executa a suíte de testes Vitest na API"
	@echo "  make test-watch  - Executa os testes no modo observador (watch)"
	@echo "  make bot-start   - Inicia o bot conector de testes localmente (Node host)"
	@echo "  make clean       - Remove volumes Docker e dados do banco"

up:
	docker compose up -d postgres
	docker compose up -d --build --no-deps api

up-api: up

up-all:
	docker compose up -d --build

up-bot:
	docker compose --profile test up -d --build --no-deps bot

down-bot:
	docker compose stop bot && docker compose rm -f bot

down:
	docker compose down

build:
	docker compose build

restart:
	docker compose restart

restart-api:
	docker compose restart api

restart-db:
	docker compose restart postgres

status:
	docker compose ps

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f api

logs-bot:
	docker compose logs -f bot

logs-db:
	docker compose logs -f postgres

shell-api:
	docker compose exec -it api sh

shell-db:
	docker compose exec -it postgres psql -U jardim -d jardim_das_sombras

test:
	cd api && npm test

test-watch:
	cd api && npx vitest

bot-start:
	cd bot && npm start

clean:
	docker compose down -v
