# Sistema de Gestión de Importaciones — SIM/Malvina

Sistema backend para registrar, seguir y reportar procesos de importación,
con integración al **Sistema Informático Malvina (SIM)** de AFIP/Aduana Argentina.

---

## Tabla de contenidos

1. [Descripción general](#descripción-general)
2. [Tecnologías utilizadas](#tecnologías-utilizadas)
3. [Instalación y ejecución local](#instalación-y-ejecución-local)
4. [Ejecución con Docker](#ejecución-con-docker)
5. [Variables de entorno](#variables-de-entorno)
6. [API Reference](#api-reference)
7. [Ciclo de vida de un pedido](#ciclo-de-vida-de-un-pedido)
8. [Arquitectura](#arquitectura)
9. [Tests automatizados (57 casos)](#tests-automatizados-57-casos)
10. [Pruebas de carga con k6](#pruebas-de-carga-con-k6)
11. [CI/CD — GitHub Actions](#cicd--github-actions)
12. [Decisiones de diseño](#decisiones-de-diseño)
13. [Estructura del proyecto](#estructura-del-proyecto)

---

## Descripción general

| Funcionalidad | Detalle |
|---|---|
| Registro de pedidos | Proveedor, fecha, ítems (código, nombre, cantidad, precio, moneda) |
| Seguimiento de estado | FSM estricta: pendiente → en_transito → en_aduana → recibido / cancelado |
| Notificaciones automáticas | Al cambiar estado se notifica al creador del pedido y a todos los admins |
| Reportes de gestión | Dashboard, ranking de proveedores, evolución mensual |
| Autenticación JWT | Roles `admin` y `operator` con permisos diferenciados |
| Integración Malvina | Registra la declaración de importación; mock reemplazable por SOAP/REST real de AFIP |
| Plan de contingencia | Clasificación P1-P4, rollback en 8 pasos, backups automatizados |

---

## Tecnologías utilizadas

| Capa | Tecnología | Por qué |
|---|---|---|
| Runtime | **Node.js 24** | `node:sqlite` built-in, sin dependencias nativas |
| Lenguaje | **TypeScript 5** (strict) | Tipado fuerte, reducción de errores en producción |
| Framework | **Express.js** | Ecosistema maduro, middleware composable |
| Base de datos | **SQLite** vía `node:sqlite` | Zero-config, sin node-gyp, sin servidor externo |
| Validación | **Zod** | Schema-first con inferencia de tipos automática |
| Autenticación | **JWT + bcryptjs** | Stateless, sin sesiones en servidor |
| ID únicos | **uuid v4** | Resistente a colisiones, no predecible |
| Tests | **Jest + Supertest** | 57 tests, DB en memoria `:memory:` |
| Carga | **k6** | Umbrales que rompen CI si no se cumplen |
| Contenedor | **Docker** multi-stage + compose | Imagen liviana (~180 MB), volumen persistente |
| CI/CD | **GitHub Actions** | 5 jobs: test → build → carga → docker → rollback |

---

## Instalación y ejecución local

### Requisitos previos

- **Node.js 24** (requiere el módulo `node:sqlite` built-in)
- npm 10+

```bash
# Verificar versión
node --version   # debe ser v24.x.x
```

### Pasos

```bash
# 1. Clonar y entrar al directorio
git clone https://github.com/<tu-usuario>/import-management-system.git
cd import-management-system

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# (opcional) editar .env para cambiar el puerto o el JWT_SECRET

# 4. Cargar datos de prueba
npm run db:seed

# 5. Iniciar servidor en modo desarrollo (hot-reload)
npm run dev
```

El servidor queda en **http://localhost:3000**

### Credenciales de prueba

| Rol | Email | Contraseña |
|---|---|---|
| admin | admin@empresa.com | Admin1234! |
| operator | operador1@empresa.com | Oper1234! |
| operator | operador2@empresa.com | Oper1234! |

### Verificar que funciona

```bash
# Health check
curl http://localhost:3000/health

# Login y obtener token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","password":"Admin1234!"}'
```

---

## Ejecución con Docker

```bash
# Levantar con docker-compose (la DB se persiste en un volumen)
JWT_SECRET=mi_secreto_seguro docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener
docker-compose down

# Detener y eliminar datos
docker-compose down -v
```

La API queda disponible en **http://localhost:3000**

---

## Variables de entorno

Crear un archivo `.env` basado en `.env.example`:

```env
# Puerto del servidor
PORT=3000

# Ruta de la base de datos SQLite
DB_PATH=./data/imports.db

# Secreto para firmar tokens JWT (mínimo 32 caracteres en producción)
JWT_SECRET=cambia_esto_en_produccion_minimo_32_chars

# Expiración del token
JWT_EXPIRES_IN=24h

# Entorno
NODE_ENV=development

# Sistema Malvina (dejar vacío para usar el mock)
MALVINA_API_URL=https://api.malvina.gob.ar
MALVINA_API_KEY=
```

---

## API Reference

> Todos los endpoints excepto `/api/auth/login` y `/health` requieren header:
> `Authorization: Bearer <token>`

### Autenticación

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | público | Obtiene token JWT |
| POST | `/api/auth/register` | admin | Crea nuevo usuario |
| GET | `/api/auth/me` | todos | Perfil del usuario autenticado |
| GET | `/api/auth/users` | admin | Lista todos los usuarios |
| GET | `/api/auth/notifications` | todos | Notificaciones no leídas |
| PATCH | `/api/auth/notifications/:id/read` | todos | Marca una notificación como leída |
| PATCH | `/api/auth/notifications/read-all` | todos | Marca todas como leídas |

### Pedidos de importación

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/orders` | todos | Crea nuevo pedido + registra en Malvina |
| GET | `/api/orders` | todos | Lista pedidos (filtros, paginación) |
| GET | `/api/orders/:id` | todos | Detalle con ítems e historial de estados |
| PATCH | `/api/orders/:id` | propietario / admin | Edita datos del pedido |
| PATCH | `/api/orders/:id/status` | todos | Avanza o cancela el pedido |

**Filtros disponibles en `GET /api/orders`:**

```
?status=en_transito
?supplier=Shenzhen
?from_date=2026-01-01&to_date=2026-12-31
?page=1&limit=20
```

### Reportes

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/reports/dashboard` | todos | Totales, promedios, alertas (`?days=30`) |
| GET | `/api/reports/suppliers` | todos | Ranking de proveedores por volumen y tiempo |
| GET | `/api/reports/monthly` | todos | Evolución mensual de pedidos |

---

### Ejemplos con curl

#### Crear un pedido

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","password":"Admin1234!"}' | \
  jq -r '.token')

curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "supplier": "Shenzhen Electronics Co.",
    "supplier_country": "China",
    "order_date": "2026-06-09",
    "estimated_arrival": "2026-07-20",
    "notes": "Contenedor 40 pies",
    "items": [
      {
        "product_code": "ELEC-001",
        "product_name": "Modulo ESP32",
        "quantity": 100,
        "unit": "unidad",
        "unit_price": 3.50,
        "currency": "USD"
      }
    ]
  }'
```

#### Avanzar estado del pedido

```bash
curl -X PATCH http://localhost:3000/api/orders/<ORDER_ID>/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "en_transito", "comment": "Embarcado en Shanghai — BL N°12345"}'
```

#### Ver dashboard de reportes

```bash
curl "http://localhost:3000/api/reports/dashboard?days=30" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Ciclo de vida de un pedido

```
            ┌──────────┐
   inicio → │ pendiente│
            └────┬─────┘
                 │  ← transición automática al cargar al barco
                 ▼
         ┌─────────────┐
         │ en_transito │
         └──────┬──────┘
                │  ← llega al puerto de destino
                ▼
          ┌──────────┐
          │ en_aduana│
          └────┬─────┘
               │  ← aprobado por Aduana
               ▼
          ┌─────────┐
          │recibido │  (estado final)
          └─────────┘

En cualquier estado (excepto recibido):
    → cancelado  (estado final)
```

Las transiciones inválidas devuelven `HTTP 422 Unprocessable Entity`.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                   CLIENTE (curl / frontend)          │
└──────────────────────────┬──────────────────────────┘
                           │ HTTP/JSON
┌──────────────────────────▼──────────────────────────┐
│                EXPRESS.JS (app.ts)                   │
│  ┌──────────┐  ┌───────────┐  ┌───────────────────┐ │
│  │ auth.ts  │  │ orders.ts │  │   reports.ts      │ │
│  └────┬─────┘  └─────┬─────┘  └─────────┬─────────┘ │
│       │              │                   │           │
│  ┌────▼──────────────▼───────────────────▼─────────┐ │
│  │            MIDDLEWARE LAYER                      │ │
│  │  auth.ts (JWT verify + roles)                   │ │
│  │  errorHandler.ts (errores centralizados)        │ │
│  └────┬──────────────┬───────────────────┬─────────┘ │
│       │              │                   │           │
│  ┌────▼──┐    ┌──────▼──────┐    ┌──────▼────────┐  │
│  │ Auth  │    │   Orders    │    │   Reports     │  │
│  │Service│    │   Service   │    │   Service     │  │
│  └────┬──┘    └──────┬──────┘    └──────┬────────┘  │
│       │              │                   │           │
│       │         ┌────┴─────┐             │           │
│       │         │  FSM     │             │           │
│       │         │Malvina   │             │           │
│       │         │Notif.    │             │           │
│       │         └────┬─────┘             │           │
│  ┌────▼──────────────▼───────────────────▼─────────┐ │
│  │             SQLite (node:sqlite)                 │ │
│  │        ─ pedidos  ─ items  ─ historial           │ │
│  │        ─ usuarios  ─ notificaciones              │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Tests automatizados (57 casos)

```bash
# Ejecutar todos los tests
npm test

# Con reporte de cobertura HTML
npm run test:coverage
# Ver en: coverage/lcov-report/index.html
```

| Suite | Archivo | Casos | Qué cubre |
|---|---|:---:|---|
| Unitarios FSM | `stateMachine.test.ts` | 13 | Todas las transiciones válidas e inválidas |
| Integración API | `orders.integration.test.ts` | 19 | Auth, CRUD, estados, reportes, notificaciones |
| Seguridad | `security.test.ts` | 25 | SQL injection, JWT, IDOR, privilege escalation, XSS |
| **Total** | | **57** | |

### Tests de seguridad incluidos

| ID | Categoría | Qué verifica |
|---|---|---|
| S-01 | SQL Injection | Campos login, notas y proveedor sanitizados |
| S-02 | JWT | Token adulterado, firma inválida, string aleatorio → 401 |
| S-03 | Endpoints protegidos | 5 rutas sin token → todas 401 |
| S-04 | IDOR | Operador no puede editar pedido de otro usuario → 403 |
| S-05 | Escalada de privilegios | Operador no puede crear admin → 403 |
| S-06 | Exposición de datos | `password_hash` nunca aparece en respuestas |
| S-07 | Validación de entrada | Fecha inválida, cantidad negativa → 400 |
| S-08 | XSS | HTML en campos de texto se guarda como texto literal |

---

## Pruebas de carga con k6

```bash
# Instalar k6: https://k6.io/docs/getting-started/installation/

# Smoke test (10 VUs x 1 minuto)
k6 run --env BASE_URL=http://localhost:3000 --vus 10 --duration 1m load-test.js

# Test de stress completo (rampa hasta 50 VUs)
k6 run --env BASE_URL=http://localhost:3000 load-test.js
```

### Umbrales definidos

| Métrica | Umbral | Consecuencia si falla |
|---|---|---|
| `http_req_duration` p95 | < 500 ms | Falla el job de CI |
| `http_req_duration` p99 | < 1000 ms | Falla el job de CI |
| `http_req_failed` | < 2% | Falla el job de CI |
| `login_failures` | < 1% | Falla el job de CI |
| `report_duration_ms` p95 | < 800 ms | Falla el job de CI |

---

## CI/CD — GitHub Actions

El pipeline se activa en cada push a `main` o `develop`:

```
push/PR ──► Job 1: Tests (57 casos)
                  │
                  ▼
            Job 2: Build TypeScript
                  │
          ┌───────┴──────┐
          ▼              ▼
  Job 3: k6 (smoke)   (solo en main)
          │
          ▼
  Job 4: Docker build & push
          │
          ▼ (si Job 4 falla)
  Job 5: Rollback automático + notificación
```

### Secrets de GitHub necesarios

| Secret | Descripción |
|---|---|
| `JWT_SECRET` | Secreto para tokens JWT |
| `DOCKERHUB_USERNAME` | Usuario de Docker Hub |
| `DOCKERHUB_TOKEN` | Token de acceso de Docker Hub |

---

## Decisiones de diseño

### 1. `node:sqlite` en lugar de `better-sqlite3`

`better-sqlite3` requiere compilación nativa con `node-gyp` (Visual Studio Build Tools en Windows).
`node:sqlite` es **built-in desde Node.js 22**, zero-config, sin binarios nativos.

### 2. Máquina de estados (FSM)

La lógica de transiciones está en una tabla explícita en `orderStateMachine.ts`.
Agregar un estado nuevo (ej. `en_revision_fitosanitaria`) solo requiere editar esa tabla.

### 3. Arquitectura en capas (Controller → Service → DB)

Cada capa tiene una responsabilidad única. Migrar de SQLite a PostgreSQL
requiere cambiar únicamente `config/database.ts` y los tipos de retorno.

### 4. Validación con Zod

Los schemas de Zod sirven como **fuente de verdad única**: validan en runtime
y generan tipos TypeScript por inferencia (`z.infer<typeof schema>`).

### 5. Integración Malvina como Adapter

`malvinaClient.ts` implementa la interfaz del adaptador. En modo demo devuelve
un número de referencia mock `MAL-<timestamp>-<id>`. Para producción se reemplaza
el body del método con la llamada REST/SOAP real de AFIP sin tocar ningún otro archivo.

### 6. Notificaciones extensibles

`notificationService.onStatusChange()` persiste en BD y loguea en consola.
El diseño permite agregar email/Slack/webhook como canales adicionales
sin modificar el contrato de la función.

---

## Estructura del proyecto

```
import-management-system/
├── .github/
│   └── workflows/
│       └── ci.yml              # Pipeline CI/CD de 5 jobs
├── src/
│   ├── app.ts                  # Entry point Express
│   ├── config/
│   │   └── database.ts         # SQLite (node:sqlite) + esquema DDL
│   ├── controllers/
│   │   ├── authController.ts   # Login, registro, notificaciones
│   │   ├── orderController.ts  # CRUD + cambio de estado
│   │   └── reportController.ts # Dashboard y reportes
│   ├── middleware/
│   │   ├── auth.ts             # JWT verify + requireRole()
│   │   └── errorHandler.ts     # Manejo centralizado de errores
│   ├── models/
│   │   └── types.ts            # Interfaces TypeScript compartidas
│   ├── routes/
│   │   ├── auth.ts             # /api/auth/*
│   │   ├── orders.ts           # /api/orders/*
│   │   └── reports.ts          # /api/reports/*
│   ├── services/
│   │   ├── authService.ts      # Registro, login, JWT
│   │   ├── orderService.ts     # Lógica de negocio + transacciones
│   │   ├── notificationService.ts # Notificaciones automáticas
│   │   └── reportService.ts    # Consultas SQL de estadísticas
│   ├── tests/
│   │   ├── stateMachine.test.ts        # 13 tests unitarios (FSM)
│   │   ├── orders.integration.test.ts  # 19 tests de integración
│   │   └── security.test.ts            # 25 tests de seguridad
│   └── utils/
│       ├── orderStateMachine.ts # Tabla de transiciones válidas
│       └── malvinaClient.ts     # Adaptador Sistema Malvina
├── Dockerfile                   # Multi-stage build (builder + production)
├── docker-compose.yml           # API + volumen SQLite persistente
├── load-test.js                 # Script k6 (smoke + stress)
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Licencia

MIT — ver [LICENSE](LICENSE)

---

> Proyecto desarrollado como take-home challenge para demostrar arquitectura backend
> con TypeScript, diseño de APIs REST, patrones de diseño (FSM, Repository, Adapter),
> seguridad, testing automatizado (57 casos) y CI/CD completo con GitHub Actions.
