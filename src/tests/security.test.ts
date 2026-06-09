/**
 * TESTS DE SEGURIDAD AUTOMATIZADOS — Vectores S-01 a S-08
 * Corren en cada PR via Jest + Supertest.
 * Base de datos en memoria (:memory:) — totalmente aislados.
 */
import request from 'supertest';
import { app } from '../app';
import { initializeSchema, closeDb } from '../config/database';
import { authService } from '../services/authService';

process.env.DB_PATH    = ':memory:';
process.env.JWT_SECRET = 'test_secret_security_suite';
process.env.NODE_ENV   = 'test';

let adminToken: string;
let operatorToken: string;
let orderId: string;

// ── Setup ──────────────────────────────────────────────────────────────────
beforeAll(async () => {
  initializeSchema();

  await authService.register('sec-admin@test.com',    'Admin1234!', 'Admin Sec',    'admin');
  await authService.register('sec-operator@test.com', 'Oper1234!',  'Operator Sec', 'operator');

  const { token: at } = await authService.login('sec-admin@test.com',    'Admin1234!');
  const { token: ot } = await authService.login('sec-operator@test.com', 'Oper1234!');
  adminToken    = at;
  operatorToken = ot;

  // Crear un pedido de referencia para los tests de IDOR y estado
  const res = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      supplier: 'Proveedor Seguridad S.A.',
      supplier_country: 'China',
      order_date: '2026-06-09',
      items: [{ product_code: 'SEC-01', product_name: 'Item test', quantity: 1, unit: 'u', unit_price: 10 }],
    });
  orderId = res.body.order.id;
});

afterAll(() => closeDb());

// ══════════════════════════════════════════════════════════════════════════
describe('S-01 | SQL Injection en login', () => {
  it('payload clasico OR 1=1 en email es rechazado por Zod (400)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: "' OR '1'='1", password: 'cualquiera' });
    // Zod rechaza el formato de email antes de llegar a la base de datos
    expect(res.status).toBe(400);
  });

  it('payload SQL en password no permite bypassear auth (401)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sec-admin@test.com', password: "' OR '1'='1'--" });
    expect(res.status).toBe(401);
  });

  it('payload SQL en campo notes se guarda como texto literal', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplier: "'; DROP TABLE users;--",
        supplier_country: 'China',
        order_date: '2026-06-09',
        items: [{ product_code: 'S01', product_name: 'Test', quantity: 1, unit: 'u', unit_price: 1 }],
        notes: "'; DROP TABLE import_orders;--",
      });
    // El sistema acepta el texto pero lo guarda de forma segura (prepared statements)
    expect(res.status).toBe(201);
    expect(res.body.order.notes).toBe("'; DROP TABLE import_orders;--");
    // Verificar que la tabla users sigue existiendo
    const loginCheck = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sec-admin@test.com', password: 'Admin1234!' });
    expect(loginCheck.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('S-02 | JWT con firma manipulada', () => {
  it('token con payload alterado manualmente es rechazado (401)', async () => {
    // Tomar el token real y modificar la parte del payload (base64)
    const parts = adminToken.split('.');
    const fakePayload = Buffer.from(
      JSON.stringify({ userId: 'fake-admin-id', role: 'admin', iat: 9999999999 })
    ).toString('base64url');
    const tamperedToken = `${parts[0]}.${fakePayload}.${parts[2]}`;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tamperedToken}`);
    expect(res.status).toBe(401);
  });

  it('token con firma borrada (solo payload.header sin firma) es rechazado', async () => {
    const parts = adminToken.split('.');
    const noSigToken = `${parts[0]}.${parts[1]}.`;

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${noSigToken}`);
    expect(res.status).toBe(401);
  });

  it('string aleatorio como token es rechazado (401)', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', 'Bearer esto_no_es_un_jwt_valido');
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('S-03 | Acceso sin autenticacion', () => {
  const protectedEndpoints = [
    { method: 'get',   url: '/api/orders' },
    { method: 'get',   url: '/api/auth/me' },
    { method: 'get',   url: '/api/reports/dashboard' },
    { method: 'get',   url: '/api/reports/suppliers' },
    { method: 'get',   url: '/api/auth/notifications' },
  ];

  protectedEndpoints.forEach(({ method, url }) => {
    it(`${method.toUpperCase()} ${url} sin token -> 401`, async () => {
      const res = await (request(app) as any)[method](url);
      expect(res.status).toBe(401);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('S-04 | IDOR — acceso entre usuarios', () => {
  it('operador puede VER pedido creado por admin (lectura permitida)', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    // El sistema permite ver pedidos de otros (no hay info sensible en el pedido)
    expect(res.status).toBe(200);
  });

  it('operador NO puede editar pedido que no le pertenece (403)', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ notes: 'Intento de modificacion no autorizada' });
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('S-05 | Escalada de privilegios — operador crea admin', () => {
  it('operador no puede crear un usuario con rol admin (403)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ email: 'fake-admin@hack.com', password: 'Hack1234!', name: 'Hacker', role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('operador no puede listar todos los usuarios (403)', async () => {
    const res = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(403);
  });

  it('admin SI puede crear otro admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'nuevo-admin@test.com', password: 'Admin1234!', name: 'Nuevo Admin', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('S-06 | Exposicion de datos sensibles', () => {
  it('el login NUNCA devuelve password_hash en la respuesta', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sec-admin@test.com', password: 'Admin1234!' });
    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('GET /me NUNCA devuelve password_hash', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('GET /users NUNCA devuelve password_hash en ningun usuario', async () => {
    const res = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.users.forEach((u: any) => {
      expect(u).not.toHaveProperty('password_hash');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('S-07 | Validacion de entrada — datos malformados', () => {
  it('fecha de pedido con formato invalido es rechazada (400)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplier: 'Test', supplier_country: 'AR',
        order_date: '32/13/2026',  // formato incorrecto
        items: [{ product_code: 'X', product_name: 'X', quantity: 1, unit: 'u', unit_price: 1 }],
      });
    expect(res.status).toBe(400);
  });

  it('cantidad negativa en item es rechazada (400)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplier: 'Test', supplier_country: 'AR',
        order_date: '2026-06-09',
        items: [{ product_code: 'X', product_name: 'X', quantity: -5, unit: 'u', unit_price: 10 }],
      });
    expect(res.status).toBe(400);
  });

  it('precio negativo en item es rechazado (400)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplier: 'Test', supplier_country: 'AR',
        order_date: '2026-06-09',
        items: [{ product_code: 'X', product_name: 'X', quantity: 1, unit: 'u', unit_price: -99 }],
      });
    expect(res.status).toBe(400);
  });

  it('body completamente vacio en login es rechazado (400)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('S-08 | Inyeccion de contenido en campos de texto libre', () => {
  it('XSS en campo supplier se guarda como texto literal sin ejecucion', async () => {
    const payload = '<script>alert("xss")</script>';
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplier: payload,
        supplier_country: 'China',
        order_date: '2026-06-09',
        items: [{ product_code: 'XSS', product_name: 'Test XSS', quantity: 1, unit: 'u', unit_price: 1 }],
      });
    expect(res.status).toBe(201);
    // El dato se guarda tal cual — la sanitizacion es responsabilidad del frontend
    expect(res.body.order.supplier).toBe(payload);
  });

  it('HTML en notes se guarda como texto plano sin ejecucion', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplier: 'Test', supplier_country: 'AR',
        order_date: '2026-06-09',
        notes: payload,
        items: [{ product_code: 'H1', product_name: 'HTML Test', quantity: 1, unit: 'u', unit_price: 1 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.order.notes).toBe(payload);
  });
});
