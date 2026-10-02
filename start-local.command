#!/usr/bin/env bash
# Kept en tu computador: un solo comando. Necesita Docker Desktop abierto.
set -e
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Falta Docker. Instala Docker Desktop (gratis): https://www.docker.com/products/docker-desktop y vuelve a abrir este archivo."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker está instalado pero apagado. Ábrelo, espera a que diga 'running' y vuelve a abrir este archivo."
  exit 1
fi

if [ ! -f .env ]; then
  secret="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48)"
  sed -e "s|^APP_SECRET=.*|APP_SECRET=${secret}|" -e "s|^APP_URL=.*|APP_URL=http://localhost:3000|" .env.example > .env
fi

export LOCAL_HTTP=1
echo "Construyendo Kept (la primera vez tarda unos minutos)…"
docker compose up -d --build

echo "Esperando a que arranque…"
for i in $(seq 1 90); do
  if curl -fs http://localhost:3000/api/health >/dev/null 2>&1; then break; fi
  sleep 2
done

if [ ! -f .kept-seeded ]; then
  echo "Cargando categorías y negocios de ejemplo…"
  docker compose exec -T -e NODE_ENV=development web npm run db:seed -- --demo
  docker compose exec -T -e NODE_ENV=development web npm run db:demo-media
  touch .kept-seeded
fi

echo
echo "Listo → http://localhost:3000"
echo "Cuentas de prueba (clave: kept-demo-2026):"
echo "  cliente   customer@kept.test"
echo "  negocio   pro@kept.test"
echo "  admin     admin@kept.test"
(command -v open >/dev/null && open http://localhost:3000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) || true
