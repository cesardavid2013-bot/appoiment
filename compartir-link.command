#!/usr/bin/env bash
# Kept con un link público (https://….trycloudflare.com) para probarla desde cualquier celular o computador.
# Gratis y sin cuenta. El link funciona mientras este computador y Docker estén encendidos.
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

# Served over https through the tunnel, so the app runs with its normal production security.
export LOCAL_HTTP=
rm -f .env.share

echo "Pidiendo un link público a Cloudflare…"
docker compose --profile share up -d --force-recreate tunnel
url=""
for i in $(seq 1 60); do
  url="$(docker compose --profile share logs tunnel 2>/dev/null | grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"
  [ -n "$url" ] && break
  sleep 2
done
if [ -z "$url" ]; then
  echo "Cloudflare no entregó el link. Revisa tu conexión a internet y vuelve a intentarlo."
  docker compose --profile share logs --tail 20 tunnel
  exit 1
fi
echo "APP_URL=${url}" > .env.share

echo "Construyendo Kept (la primera vez tarda unos minutos)…"
docker compose up -d --build db web worker

echo "Esperando a que arranque…"
for i in $(seq 1 120); do
  if curl -fs http://localhost:3000/api/health >/dev/null 2>&1; then break; fi
  sleep 2
done

if [ ! -f .kept-seeded ]; then
  echo "Cargando categorías y negocios de ejemplo…"
  docker compose exec -T -e NODE_ENV=development web npm run db:seed -- --demo
  docker compose exec -T -e NODE_ENV=development web npm run db:demo-media
  touch .kept-seeded
fi

echo "Comprobando el link…"
for i in $(seq 1 30); do
  if curl -fs "${url}/api/health" >/dev/null 2>&1; then break; fi
  sleep 2
done

echo
echo "Listo. Tu link público:"
echo
echo "   ${url}"
echo
echo "Ábrelo en cualquier celular o computador. Cuentas de prueba (clave: kept-demo-2026):"
echo "  cliente   customer@kept.test"
echo "  negocio   pro@kept.test"
echo "  admin     admin@kept.test"
echo
echo "El link cambia cada vez que abres este archivo. Para dejar de compartir: docker compose --profile share stop tunnel"
(command -v open >/dev/null && open "$url") || (command -v xdg-open >/dev/null && xdg-open "$url") || true
