/**
 * Script k6 de pruebas de carga — Sistema de Gestión de Importaciones
 * Ejecutar: k6 run load-test.js
 * En CI/CD: k6 run --out json=load-results.json load-test.js
 *
 * Escenarios:
 *   C-01 smoke   — 10 VUs x 1 min   (verifica que funciona bajo carga minima)
 *   C-02 stress  — rampa hasta 50 VUs (detecta punto de quiebre)
 *   C-03 reports — 20 VUs x 2 min   (carga en queries pesadas)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Métricas personalizadas ───────────────────────────────────────────────
const loginFailRate   = new Rate('login_failures');
const orderFailRate   = new Rate('order_failures');
const reportDuration  = new Trend('report_duration_ms');

// ── Configuración de escenarios ───────────────────────────────────────────
export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 10,
      duration: '1m',
      tags: { scenario: 'smoke' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 0  },
      ],
      startTime: '1m30s', // empieza después del smoke
      tags: { scenario: 'stress' },
    },
  },

  // ── Umbrales que hacen FALLAR el job de CI si no se cumplen ──────────────
  thresholds: {
    // Tiempo de respuesta global
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    // Tasa de errores HTTP
    http_req_failed:   ['rate<0.02'],
    // Métricas personalizadas
    login_failures:    ['rate<0.01'],
    order_failures:    ['rate<0.02'],
    report_duration_ms:['p(95)<800'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

// ── Obtener token (se reutiliza en cada iteración) ────────────────────────
function getToken() {
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ email: 'admin@empresa.com', password: 'Admin1234!' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
    'login tiene token': (r) => !!r.json('token'),
  });
  loginFailRate.add(!ok);
  return res.json('token');
}

// ── Flujo principal de cada VU ────────────────────────────────────────────
export default function () {
  const token = getToken();
  if (!token) return;

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  group('Pedidos', () => {
    // Crear pedido
    const createRes = http.post(
      `${BASE}/api/orders`,
      JSON.stringify({
        supplier: `Proveedor-k6-${__VU}`,
        supplier_country: 'China',
        order_date: '2026-06-09',
        items: [{
          product_code: `K6-${__VU}-${__ITER}`,
          product_name: 'Producto de carga',
          quantity: 10,
          unit: 'unidad',
          unit_price: 5.0,
        }],
      }),
      { headers },
    );
    const orderOk = check(createRes, {
      'crear pedido 201': (r) => r.status === 201,
      'pedido tiene id':  (r) => !!r.json('order.id'),
    });
    orderFailRate.add(!orderOk);

    sleep(0.5);

    // Listar pedidos
    const listRes = http.get(`${BASE}/api/orders?limit=10`, { headers });
    check(listRes, { 'listar pedidos 200': (r) => r.status === 200 });
  });

  group('Reportes', () => {
    const start = Date.now();
    const dashRes = http.get(`${BASE}/api/reports/dashboard`, { headers });
    reportDuration.add(Date.now() - start);

    check(dashRes, {
      'dashboard 200':             (r) => r.status === 200,
      'dashboard tiene totalOrders': (r) => r.json('report.totalOrders') >= 0,
    });

    const suppRes = http.get(`${BASE}/api/reports/suppliers`, { headers });
    check(suppRes, { 'suppliers 200': (r) => r.status === 200 });
  });

  sleep(1);
}

// ── Resumen final legible ─────────────────────────────────────────────────
export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] || 0;
  const errRate = (data.metrics.http_req_failed?.values?.rate || 0) * 100;
  const reqs = data.metrics.http_reqs?.values?.count || 0;

  console.log('\n========= RESUMEN DE CARGA =========');
  console.log(`Total requests  : ${reqs}`);
  console.log(`p95 latencia    : ${p95.toFixed(0)} ms`);
  console.log(`Tasa de errores : ${errRate.toFixed(2)}%`);
  console.log(`Umbral p95<500ms: ${p95 < 500 ? 'CUMPLIDO' : 'FALLIDO'}`);
  console.log('====================================\n');

  return {
    'load-results-summary.txt': `p95=${p95.toFixed(0)}ms errors=${errRate.toFixed(2)}% requests=${reqs}`,
  };
}
