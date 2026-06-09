import { v4 as uuidv4 } from 'uuid';
import { getDb, runTransaction } from '../config/database';
import { ImportOrder, ImportOrderWithDetails, OrderItem, OrderStatusHistory } from '../models/types';
import { AppError } from '../middleware/errorHandler';
import { isValidTransition, OrderStatus } from '../utils/orderStateMachine';
import { notificationService } from './notificationService';
import { malvinaClient } from '../utils/malvinaClient';

export interface CreateOrderInput {
  supplier: string;
  supplier_country: string;
  order_date: string;
  estimated_arrival?: string;
  notes?: string;
  items: Array<{
    product_code: string;
    product_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    currency?: string;
  }>;
}

export interface ListOrdersFilter {
  status?: OrderStatus;
  supplier?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

let orderCounter = 0;

function generateOrderNumber(): string {
  orderCounter += 1;
  const ts = Date.now().toString().slice(-6);
  return `IMP-${ts}-${String(orderCounter).padStart(4, '0')}`;
}

export const orderService = {
  async create(input: CreateOrderInput, userId: string): Promise<ImportOrderWithDetails> {
    const db = getDb();

    if (!input.items || input.items.length === 0) {
      throw new AppError(400, 'El pedido debe tener al menos un producto');
    }

    const orderId = uuidv4();
    const orderNumber = generateOrderNumber();
    const now = new Date().toISOString();
    const totalValue = input.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

    // Registrar en Sistema Malvina (modo demo genera referencia automática)
    const malvinaResult = await malvinaClient.registerImportDeclaration(
      orderNumber,
      input.supplier_country,
      totalValue,
    );

    runTransaction(db, () => {
      db.prepare(`
        INSERT INTO import_orders
          (id, order_number, supplier, supplier_country, order_date, estimated_arrival,
           actual_arrival, status, malvina_ref, notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, 'pendiente', ?, ?, ?, ?, ?)
      `).run(
        orderId, orderNumber,
        input.supplier.trim(), input.supplier_country.trim(),
        input.order_date, input.estimated_arrival ?? null,
        malvinaResult.referenceNumber ?? null, input.notes ?? null,
        userId, now, now,
      );

      for (const item of input.items) {
        db.prepare(`
          INSERT INTO order_items
            (id, order_id, product_code, product_name, quantity, unit, unit_price, currency)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(), orderId,
          item.product_code.trim(), item.product_name.trim(),
          item.quantity, item.unit.trim(), item.unit_price, item.currency ?? 'USD',
        );
      }

      db.prepare(`
        INSERT INTO order_status_history
          (id, order_id, from_status, to_status, changed_by, comment, changed_at)
        VALUES (?, ?, NULL, 'pendiente', ?, 'Pedido creado', ?)
      `).run(uuidv4(), orderId, userId, now);
    });

    await notificationService.onStatusChange(orderId, orderNumber, null, 'pendiente', userId);

    return this.getById(orderId)!;
  },

  getById(orderId: string): ImportOrderWithDetails | null {
    const db = getDb();

    const order = db
      .prepare('SELECT * FROM import_orders WHERE id = ?')
      .get(orderId) as unknown as ImportOrder | undefined;

    if (!order) return null;

    const items = db
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .all(orderId) as unknown as OrderItem[];

    const history = db
      .prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY changed_at')
      .all(orderId) as unknown as OrderStatusHistory[];

    return { ...order, items, history };
  },

  list(filter: ListOrdersFilter = {}): { orders: ImportOrder[]; total: number } {
    const db = getDb();
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (filter.status)    { conditions.push('status = ?');       params.push(filter.status); }
    if (filter.supplier)  { conditions.push('supplier LIKE ?');   params.push(`%${filter.supplier}%`); }
    if (filter.from_date) { conditions.push('order_date >= ?');   params.push(filter.from_date); }
    if (filter.to_date)   { conditions.push('order_date <= ?');   params.push(filter.to_date); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db
      .prepare(`SELECT COUNT(*) as cnt FROM import_orders ${where}`)
      .get(...params) as unknown as { cnt: number };

    const page   = Math.max(1, filter.page ?? 1);
    const limit  = Math.min(100, filter.limit ?? 20);
    const offset = (page - 1) * limit;

    const orders = db
      .prepare(`SELECT * FROM import_orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as unknown as ImportOrder[];

    return { orders, total: countRow.cnt };
  },

  async updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    userId: string,
    comment?: string,
  ): Promise<ImportOrderWithDetails> {
    const db = getDb();

    const order = db
      .prepare('SELECT * FROM import_orders WHERE id = ?')
      .get(orderId) as unknown as ImportOrder | undefined;

    if (!order) throw new AppError(404, 'Pedido no encontrado');

    if (!isValidTransition(order.status, newStatus)) {
      throw new AppError(
        422,
        `No se puede cambiar de "${order.status}" a "${newStatus}"`,
      );
    }

    const now = new Date().toISOString();
    const arrivedAt = newStatus === 'recibido' ? now : (order.actual_arrival ?? null);

    runTransaction(db, () => {
      db.prepare(`
        UPDATE import_orders SET status = ?, actual_arrival = ?, updated_at = ? WHERE id = ?
      `).run(newStatus, arrivedAt, now, orderId);

      db.prepare(`
        INSERT INTO order_status_history
          (id, order_id, from_status, to_status, changed_by, comment, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), orderId, order.status, newStatus, userId, comment ?? null, now);
    });

    await notificationService.onStatusChange(
      orderId, order.order_number, order.status, newStatus, order.created_by,
    );

    return this.getById(orderId)!;
  },

  update(
    orderId: string,
    fields: Partial<Pick<ImportOrder, 'supplier' | 'estimated_arrival' | 'notes'>>,
    userId: string,
  ): ImportOrderWithDetails {
    const db = getDb();

    const order = db
      .prepare('SELECT * FROM import_orders WHERE id = ?')
      .get(orderId) as unknown as ImportOrder | undefined;

    if (!order) throw new AppError(404, 'Pedido no encontrado');

    // Solo el creador o un admin puede editar
    if (order.created_by !== userId) {
      const user = db
        .prepare('SELECT role FROM users WHERE id = ?')
        .get(userId) as unknown as { role: string } | undefined;
      if (user?.role !== 'admin') {
        throw new AppError(403, 'Solo el creador o un administrador puede editar este pedido');
      }
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE import_orders
      SET supplier          = COALESCE(?, supplier),
          estimated_arrival = COALESCE(?, estimated_arrival),
          notes             = COALESCE(?, notes),
          updated_at        = ?
      WHERE id = ?
    `).run(fields.supplier ?? null, fields.estimated_arrival ?? null, fields.notes ?? null, now, orderId);

    return this.getById(orderId)!;
  },
};
