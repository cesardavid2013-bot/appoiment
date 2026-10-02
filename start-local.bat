@echo off
rem Kept en tu computador: doble clic. Necesita Docker Desktop abierto.
cd /d "%~dp0"
where docker >nul 2>nul || (echo Falta Docker. Instala Docker Desktop: https://www.docker.com/products/docker-desktop & pause & exit /b 1)
docker info >nul 2>nul || (echo Docker esta apagado. Abrelo, espera a que diga running y vuelve a abrir este archivo. & pause & exit /b 1)
if not exist .env (
  powershell -NoProfile -Command "$s=-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | %% {[char]$_}); (Get-Content .env.example) -replace '^APP_SECRET=.*',('APP_SECRET='+$s) -replace '^APP_URL=.*','APP_URL=http://localhost:3000' | Set-Content .env"
)
set LOCAL_HTTP=1
echo Construyendo Kept (la primera vez tarda unos minutos)...
docker compose up -d --build || (pause & exit /b 1)
echo Esperando a que arranque...
powershell -NoProfile -Command "for($i=0;$i -lt 90;$i++){ try { Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health | Out-Null; break } catch { Start-Sleep 2 } }"
if not exist .kept-seeded (
  echo Cargando categorias y negocios de ejemplo...
  docker compose exec -T -e NODE_ENV=development web npm run db:seed -- --demo
  docker compose exec -T -e NODE_ENV=development web npm run db:demo-media
  type nul > .kept-seeded
)
echo.
echo Listo: http://localhost:3000
echo Cuentas de prueba (clave: kept-demo-2026): customer@kept.test / pro@kept.test / admin@kept.test
start http://localhost:3000
pause
