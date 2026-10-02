# Kept en tu computador (sin GitHub, sin internet)

## Qué necesitas
**Docker Desktop** (gratis): https://www.docker.com/products/docker-desktop — instálalo y ábrelo una vez.

## Arrancar
- **Mac:** doble clic en `start-local.command` (si dice que no se puede abrir: clic derecho → Abrir).
- **Windows:** doble clic en `start-local.bat`.
- **Linux:** `./start-local.sh`

La primera vez tarda unos minutos (construye la app y carga negocios de ejemplo). Después se abre sola en
**http://localhost:3000**.

## Compartir con un link público (gratis, sin cuenta)
Para probarla desde tu celular o mandársela a alguien:
- **Mac:** doble clic en `compartir-link.command`
- **Windows:** doble clic en `compartir-link.bat`
- **Linux:** `./compartir-link.sh`

Al final verás un link tipo **https://algo-al-azar.trycloudflare.com**. Ábrelo en cualquier celular o computador, en
cualquier red. Funciona por https, así que también puedes **instalarla como app** desde el navegador del celular
("Añadir a pantalla de inicio").

- El link funciona mientras tu computador y Docker estén encendidos, y **cambia cada vez** que abres el archivo.
- Usa los mismos datos de ejemplo que la versión local.
- Para dejar de compartir: `docker compose --profile share stop tunnel` (o abre `start-local` para volver a solo-tu-computador).
- Es para probar. Para un sitio fijo con tu dominio, mira la sección "Put it online" del README.

## Cuentas de prueba (clave `kept-demo-2026`)
| Rol | Correo | Qué ves |
|---|---|---|
| Cliente | `customer@kept.test` | Reservas, mensajes, cuenta |
| Negocio | `pro@kept.test` | Panel: agenda, clientes, ajustes, aspecto de la página |
| Admin | `admin@kept.test` | Consola de administración en `/admin` |

## Cosas útiles
- **Probarla en tu celular:** lo más fácil es `compartir-link` (arriba). En la misma red Wi-Fi también puedes abrir `http://IP-de-tu-computador:3000`, pero así no se puede iniciar sesión ni instalar como app.
- **Parar:** `docker compose down` (tus datos se conservan). **Borrar todo:** `docker compose down -v` y borra el archivo `.kept-seeded`.
- **Pagos y correos reales:** en tu computador los pagos con tarjeta están apagados (solo "pagar en persona") y los correos se muestran en la consola (`docker compose logs web`). Para activarlos pon tus claves en `.env` (ver `.env.example`) y reinicia.
- **Ver qué falta para publicarla:** `docker compose exec web npm run launch:check`.
