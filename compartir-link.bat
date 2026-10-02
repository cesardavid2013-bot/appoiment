@echo off
rem Kept con un link publico (https://....trycloudflare.com). Gratis y sin cuenta. Necesita Docker Desktop abierto.
cd /d "%~dp0"
where docker >nul 2>nul || (echo Falta Docker. Instala Docker Desktop: https://www.docker.com/products/docker-desktop & pause & exit /b 1)
docker info >nul 2>nul || (echo Docker esta apagado. Abrelo, espera a que diga running y vuelve a abrir este archivo. & pause & exit /b 1)
if not exist .env (
  powershell -NoProfile -Command "$s=-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | %% {[char]$_}); (Get-Content .env.example) -replace '^APP_SECRET=.*',('APP_SECRET='+$s) -replace '^APP_URL=.*','APP_URL=http://localhost:3000' | Set-Content .env"
)
set LOCAL_HTTP=
if exist .env.share del .env.share
echo Pidiendo un link publico a Cloudflare...
docker compose --profile share up -d --force-recreate tunnel || (pause & exit /b 1)
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){ $m = (docker compose --profile share logs tunnel 2>$null | Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches); if($m){ $u=$m[-1].Matches[-1].Value; Set-Content -Encoding ascii .env.share ('APP_URL='+$u); break }; Start-Sleep 2 }"
if not exist .env.share (echo Cloudflare no entrego el link. Revisa tu conexion a internet y vuelve a intentarlo. & pause & exit /b 1)
for /f "tokens=2 delims==" %%a in (.env.share) do set KEPT_URL=%%a
echo Construyendo Kept (la primera vez tarda unos minutos)...
docker compose up -d --build db web worker || (pause & exit /b 1)
echo Esperando a que arranque...
powershell -NoProfile -Command "for($i=0;$i -lt 120;$i++){ try { Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health | Out-Null; break } catch { Start-Sleep 2 } }"
if not exist .kept-seeded (
  echo Cargando categorias y negocios de ejemplo...
  docker compose exec -T -e NODE_ENV=development web npm run db:seed -- --demo
  docker compose exec -T -e NODE_ENV=development web npm run db:demo-media
  type nul > .kept-seeded
)
powershell -NoProfile -Command "for($i=0;$i -lt 30;$i++){ try { Invoke-WebRequest -UseBasicParsing '%KEPT_URL%/api/health' | Out-Null; break } catch { Start-Sleep 2 } }"
echo.
echo Listo. Tu link publico:
echo.
echo    %KEPT_URL%
echo.
echo Abrelo en cualquier celular o computador. Cuentas de prueba (clave: kept-demo-2026):
echo   customer@kept.test / pro@kept.test / admin@kept.test
echo El link cambia cada vez que abres este archivo. Para dejar de compartir: docker compose --profile share stop tunnel
start %KEPT_URL%
pause
