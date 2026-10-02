# Kept en tu computador (sin GitHub, sin internet)

## Qué necesitas
**Docker Desktop** (gratis): https://www.docker.com/products/docker-desktop — instálalo y ábrelo una vez.

## Arrancar
- **Mac:** doble clic en `start-local.command` (si dice que no se puede abrir: clic derecho → Abrir).
- **Windows:** doble clic en `start-local.bat`.
- **Linux:** `./start-local.sh`

La primera vez tarda unos minutos (construye la app y carga negocios de ejemplo). Después se abre sola en
**http://localhost:3000**.

## Cuentas de prueba (clave `kept-demo-2026`)
| Rol | Correo | Qué ves |
|---|---|---|
| Cliente | `customer@kept.test` | Reservas, mensajes, cuenta |
| Negocio | `pro@kept.test` | Panel: agenda, clientes, ajustes, aspecto de la página |
| Admin | `admin@kept.test` | Consola de administración en `/admin` |

## Cosas útiles
- **Probarla en tu celular** (misma red Wi-Fi): abre `http://IP-de-tu-computador:3000`. Para instalarla como app necesitas https, así que eso solo funciona ya publicada.
- **Parar:** `docker compose down` (tus datos se conservan). **Borrar todo:** `docker compose down -v` y borra el archivo `.kept-seeded`.
- **Pagos y correos reales:** en tu computador los pagos con tarjeta están apagados (solo "pagar en persona") y los correos se muestran en la consola (`docker compose logs web`). Para activarlos pon tus claves en `.env` (ver `.env.example`) y reinicia.
- **Ver qué falta para publicarla:** `docker compose exec web npm run launch:check`.
