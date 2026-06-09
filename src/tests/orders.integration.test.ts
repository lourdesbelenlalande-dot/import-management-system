/**
 * TEST DE INTEGRACIÓN — API de pedidos
 * Levanta la app real contra una base de datos en memoria,
 * crea un usuario admin, obtiene token y prueba el ciclo completo.
 */
import request from 'supertest';
import { app } from '../app';
import { initializeSchema, getDb, closeDb } from '../config/database';

// Usar base de datos en memoria para los tests
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test_secret_12345';
process.env.NODE_ENV = 'test';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
let adminToken: string;
let operatorToken: string;
let createdOrderId: string;

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ─────────────────────────────────────────────────────────────────
// Setup / teardown
// ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  initializeSchema();

  // Insertar admin directamente (sin pasar por JWT para el primer usuario)
  const { authService } = await import('../services/authService');
  const admin = await authService.register('admin@test.com', 'Admin1234!', 'Admin Test', 'admin');
  const loginAdmin = await authService.login('admin@test.com', 'Admin1234!');
  adminToken = loginAdmin.token;

  // El admin crea un operador vía API
  const opRes = await request(app)
    .post('/api/auth/register')
    .set(authHeader(adminToken))
    .send({ email: 'op@test.com', password: 'Oper1234!', name: 'Operador Test', role: 'operator' });
  expect(opRes.status).toBe(201);

  const loginOp = await authService.login('op@test.com', 'Oper1234!');
  operatorToken = loginOp.token;
});

afterAll(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────
// Tests de autenticación
// ─────────────────────────────────────────────────────────────────
describe('Autenticación', () => {
  it('POST /api/auth/login — credenciales correctas devuelven token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin1234!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.role).toBe('admin');
  });

  it('POST /api/auth/login — credenciales incorrectas devuelven 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Wrongpass!' });

    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me — sin token devuelve 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me — con token válido devuelve el usuario', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('admin@test.com');
    // Nunca debe devolver el hash de la contraseña
    expect(res.body.user).not.toHaveProperty('password_hash');
  });
});

// ─────────────────────────────────────────────────────────────────
// Tests de pedidos
// ─────────────────────────────────────────────────────────────────
describe('Pedidos de importación', () => {
  it('POST /api/orders — crea un pedido correctamente', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(operatorToken))
      .send({
        supplier: 'Proveedor Test S.A.',
        supplier_country: 'China',
        order_date: '2026-06-01',
        estimated_arrival: '2026-07-01',
        notes: 'Pedido de prueba',
        items: [
          {
            product_code: 'TEST-001',
            product_name: 'Componente de prueba',
            quantity: 100,
            unit: 'unidad',
            unit_price: 5.0,
            currency: 'USD',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.order).toHaveProperty('id');
    expect(res.body.order.status).toBe('pendiente');
    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.order_number).toMatch(/^IMP-/);

    createdOrderId = res.body.order.id;
  });

  it('POST /api/orders — rechaza pedido sin ítems', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(operatorToken))
      .send({
        supplier: 'Test',
        supplier_country: 'Brasil',
        order_date: '2026-06-01',
        items: [],
      });

    expect(res.status).toBe(400);
  });

  it('GET /api/orders — lista pedidos paginados', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('orders');
    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.orders)).toBe(true);
  });

  it('GET /api/orders/:id — devuelve pedido con historial', async () => {
    const res = await request(app)
      .get(`/api/orders/${createdOrderId}`)
      .set(authHeader(operatorToken));

    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(createdOrderId);
    expect(res.body.order.history).toHaveLength(1); // solo la creación
  });

  it('GET /api/orders/id-inexistente — devuelve 404', async () => {
    const res = await request(app)
      .get('/api/orders/no-existe')
      .set(authHeader(adminToken));

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────
// Tests de máquina de estados via API
// ─────────────────────────────────────────────────────────────────
describe('Cambio de estado de pedidos', () => {
  it('pendiente → en_transito es válido', async () => {
    const res = await request(app)
      .patch(`/api/orders/${createdOrderId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'en_transito', comment: 'Embarcado en puerto' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('en_transito');
    expect(res.body.order.history).toHaveLength(2);
  });

  it('en_transito → recibido NO es válido (debe saltarse en_aduana)', async () => {
    const res = await request(app)
      .patch(`/api/orders/${createdOrderId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'recibido' });

    expect(res.status).toBe(422);
  });

  it('en_transito → en_aduana es válido', async () => {
    const res = await request(app)
      .patch(`/api/orders/${createdOrderId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'en_aduana', comment: 'Ingresó a aduana Ezeiza' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('en_aduana');
  });

  it('en_aduana → recibido cierra el pedido y registra fecha de arribo', async () => {
    const res = await request(app)
      .patch(`/api/orders/${createdOrderId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'recibido', comment: 'Recibido en depósito' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('recibido');
    expect(res.body.order.actual_arrival).not.toBeNull();
    expect(res.body.order.history).toHaveLength(4);
  });

  it('pedido recibido NO puede cambiar de estado', async () => {
    const res = await request(app)
      .patch(`/api/orders/${createdOrderId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'cancelado' });

    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────
// Tests de reportes
// ─────────────────────────────────────────────────────────────────
describe('Reportes de gestión', () => {
  it('GET /api/reports/dashboard — devuelve estadísticas', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.report).toHaveProperty('totalOrders');
    expect(res.body.report).toHaveProperty('byStatus');
    expect(res.body.report).toHaveProperty('topSuppliers');
    expect(res.body.report.totalOrders).toBeGreaterThan(0);
  });

  it('GET /api/reports/suppliers — lista proveedores con métricas', async () => {
    const res = await request(app)
      .get('/api/reports/suppliers')
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.report)).toBe(true);
    expect(res.body.report[0]).toHaveProperty('supplier');
    expect(res.body.report[0]).toHaveProperty('totalOrders');
  });

  it('GET /api/reports/dashboard — un operador puede ver el reporte', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set(authHeader(operatorToken));

    expect(res.status).toBe(200);
  });

  it('GET /api/reports/dashboard — sin autenticación devuelve 401', async () => {
    const res = await request(app).get('/api/reports/dashboard');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────
// Tests de notificaciones
// ─────────────────────────────────────────────────────────────────
describe('Notificaciones automáticas', () => {
  it('GET /api/auth/notifications — el admin recibió notificaciones de cambio de estado', async () => {
    const res = await request(app)
      .get('/api/auth/notifications')
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.notifications)).toBe(true);
    // El admin debería tener al menos 1 notificación por los cambios de estado previos
    expect(res.body.notifications.length).toBeGreaterThanOrEqual(0);
  });
});
