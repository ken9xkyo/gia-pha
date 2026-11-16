SHELL := /bin/bash
DC := docker compose
ENV_GET = $$(grep ^$(1)= .env | cut -d= -f2-)

.PHONY: init up down logs ps link admin seed backup restore test test-backend test-frontend dev

init: ## Tạo .env với bí mật ngẫu nhiên
	@if [ -f .env ]; then echo ".env đã tồn tại"; else \
	  cp .env.example .env; \
	  sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$$(openssl rand -hex 32)|" .env; \
	  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$$(openssl rand -hex 16)|" .env; \
	  sed -i "s|^INITIAL_ADMIN_PASSWORD=.*|INITIAL_ADMIN_PASSWORD=Gp-$$(openssl rand -hex 6)-Ad9!|" .env; \
	  echo "Đã tạo .env. Mật khẩu admin đầu tiên:"; grep ^INITIAL_ADMIN_PASSWORD .env; fi

up: ## Build và chạy toàn bộ hệ thống
	$(DC) up -d --build
	@$(MAKE) --no-print-directory link

down:
	$(DC) down

logs:
	$(DC) logs -f --tail=100

ps:
	$(DC) ps

link: ## In đường link công khai cho người xem
	@echo "Link công khai: https://$(call ENV_GET,DOMAIN)$$($(DC) exec -T backend python -m app.cli public-link)"
	@echo "Trang quản trị: https://$(call ENV_GET,DOMAIN)/admin"

admin: ## Tạo thêm admin: make admin EMAIL=a@b.c NAME="Họ tên"
	$(DC) exec backend python -m app.cli create-admin "$(EMAIL)" "$(NAME)"

seed: ## Nạp dữ liệu mẫu (chỉ khi cây trống)
	$(DC) exec backend python -m app.cli seed-demo

backup: ## Sao lưu ngay
	$(DC) exec backup /bin/sh /backup.sh now

restore: ## Khôi phục: make restore FILE=giapha-YYYYMMDD-HHMMSS.dump
	./scripts/restore.sh "$(FILE)"

test: test-frontend test-backend

test-frontend:
	cd frontend && npm ci --no-audit --no-fund && npm test && npx tsc -b --noEmit

test-backend: ## Kiểm thử backend trên một database tạm (giapha_test)
	$(DC) exec -T db psql -U $(call ENV_GET,POSTGRES_USER) -d postgres -c "DROP DATABASE IF EXISTS giapha_test" -c "CREATE DATABASE giapha_test"
	$(DC) -f docker-compose.yml -f docker-compose.dev.yml run --rm --no-deps \
	  -e TEST_DATABASE_URL=postgresql+asyncpg://$(call ENV_GET,POSTGRES_USER):$(call ENV_GET,POSTGRES_PASSWORD)@db:5432/giapha_test \
	  backend pytest -q

dev: ## Môi trường phát triển (http://localhost:5173)
	$(DC) -f docker-compose.yml -f docker-compose.dev.yml up --build db redis migrate backend vite
