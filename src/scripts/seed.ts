/**
 * Script de semilla: crea usuarios y pedidos de ejemplo para demo/desarrollo.
 * Ejecutar con: npm run db:seed
 */
import 'dotenv/config';
import { initializeSchema, closeDb } from '../config/database';
import { authService } from '../services/authService';
import { orderService } from '../services/orderService';

async function seed() {
  initializeSchema();
  console.log('🌱  Iniciando carga de datos de prueba...\n');

  // ── Usuarios ──────────────────────────────────────────────────────────────
  const admin = await authService.register('admin@empresa.com', 'Admin1234!', 'Admin Principal', 'admin');
  console.log(`👤  Admin creado: ${admin.email}`);

  const op1 = await authService.register('operador1@empresa.com', 'Oper1234!', 'Carlos López', 'operator');
  console.log(`👤  Operador creado: ${op1.email}`);

  const op2 = await authService.register('operador2@empresa.com', 'Oper1234!', 'María García', 'operator');
  console.log(`👤  Operador creado: ${op2.email}`);

  // ── Pedidos de ejemplo ────────────────────────────────────────────────────
  const order1 = await orderService.create(
    {
      supplier: 'Shenzhen Electronics Co.',
      supplier_country: 'China',
      order_date: '2026-04-01',
      estimated_arrival: '2026-05-15',
      notes: 'Pedir certificado de origen',
      items: [
        { product_code: 'ELEC-001', product_name: 'Módulo Wi-Fi ESP32', quantity: 500, unit: 'unidad', unit_price: 3.5 },
        { product_code: 'ELEC-002', product_name: 'Pantalla OLED 0.96"',  quantity: 200, unit: 'unidad', unit_price: 2.8 },
      ],
    },
    admin.id,
  );
  console.log(`📦  Pedido creado: ${order1.order_number} (pendiente)`);

  // Avanzar estados para tener datos variados
  await orderService.updateStatus(order1.id, 'en_transito', admin.id, 'Embarcado en Shangai');
  await orderService.updateStatus(order1.id, 'en_aduana', admin.id, 'Ingresó a Ezeiza');
  await orderService.updateStatus(order1.id, 'recibido', admin.id, 'Recibido en depósito');
  console.log(`   ↳ Estado final: recibido`);

  const order2 = await orderService.create(
    {
      supplier: 'TechParts Brasil',
      supplier_country: 'Brasil',
      order_date: '2026-05-10',
      estimated_arrival: '2026-05-25',
      items: [
        { product_code: 'MECH-001', product_name: 'Tornillo M4x10 inox', quantity: 10000, unit: 'unidad', unit_price: 0.05, currency: 'USD' },
        { product_code: 'MECH-002', product_name: 'Tuerca M4 inox',       quantity: 10000, unit: 'unidad', unit_price: 0.04, currency: 'USD' },
      ],
    },
    op1.id,
  );
  await orderService.updateStatus(order2.id, 'en_transito', op1.id, 'Salida por Paso de los Libres');
  console.log(`📦  Pedido creado: ${order2.order_number} (en_transito)`);

  const order3 = await orderService.create(
    {
      supplier: 'Shenzhen Electronics Co.',
      supplier_country: 'China',
      order_date: '2026-06-01',
      items: [
        { product_code: 'ELEC-003', product_name: 'Sensor DHT22', quantity: 300, unit: 'unidad', unit_price: 4.2 },
      ],
    },
    op2.id,
  );
  console.log(`📦  Pedido creado: ${order3.order_number} (pendiente)`);

  console.log('\n✅  Semilla completada. Credenciales de acceso:');
  console.log('   Admin:     admin@empresa.com    /  Admin1234!');
  console.log('   Operador1: operador1@empresa.com /  Oper1234!');
  console.log('   Operador2: operador2@empresa.com /  Oper1234!\n');

  closeDb();
}

seed().catch((err) => {
  console.error('❌  Error en seed:', err);
  process.exit(1);
});
