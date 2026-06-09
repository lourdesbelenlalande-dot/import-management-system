import { getDb } from '../config/database';
import { STATUS_LABELS, OrderStatus } from '../utils/orderStateMachine';

export interface DashboardReport {
  totalOrders: number;
  byStatus: Record<string, number>;
  avgTransitDays: number | null;
  topSuppliers: Array<{ supplier: string; count: number }>;
  ordersLastNDays: number;
  pendingOrders: number;
}

export interface SupplierReport {
  supplier: string;
  totalOrders: number;
  avgTransitDays: number | null;
  totalItems: number;
  totalValue: number;
}

export interface MonthlyReport {
  month: string;
  ordersCreated: number;
  ordersCompleted: number;
}

export const reportService = {
  /**
   * Resumen general del sistema:
   * totales por estado, tiempo promedio de importación, top proveedores.
   */
  getDashboard(days = 30): DashboardReport {
    const db = getDb();

    const totalOrders = (
      db.prepare('SELECT COUNT(*) as cnt FROM import_orders').get() as unknown as { cnt: number }
    ).cnt;

    const statusRows = db
      .prepare('SELECT status, COUNT(*) as cnt FROM import_orders GROUP BY status')
      .all() as unknown as { status: string; cnt: number }[];

    const byStatus: Record<string, number> = {};
    for (const row of statusRows) {
      const label = STATUS_LABELS[row.status as OrderStatus] ?? row.status;
      byStatus[label] = row.cnt;
    }

    // Tiempo promedio entre fecha de pedido y fecha de arribo real
    const avgRow = db.prepare(`
      SELECT AVG(
        CAST((julianday(actual_arrival) - julianday(order_date)) AS REAL)
      ) as avg_days
      FROM import_orders
      WHERE status = 'recibido' AND actual_arrival IS NOT NULL
    `).get() as unknown as { avg_days: number | null };

    const topSuppliers = db
      .prepare(`
        SELECT supplier, COUNT(*) as count
        FROM import_orders
        GROUP BY supplier
        ORDER BY count DESC
        LIMIT 5
      `)
      .all() as unknown as { supplier: string; count: number }[];

    const since = new Date();
    since.setDate(since.getDate() - days);

    const ordersLastNDays = (
      db.prepare(`SELECT COUNT(*) as cnt FROM import_orders WHERE created_at >= ?`)
        .get(since.toISOString()) as unknown as { cnt: number }
    ).cnt;

    const pendingOrders = (
      db.prepare(`
        SELECT COUNT(*) as cnt FROM import_orders
        WHERE status IN ('pendiente','en_transito','en_aduana')
      `).get() as unknown as { cnt: number }
    ).cnt;

    return {
      totalOrders,
      byStatus,
      avgTransitDays: avgRow.avg_days != null
        ? Math.round(avgRow.avg_days * 10) / 10
        : null,
      topSuppliers,
      ordersLastNDays,
      pendingOrders,
    };
  },

  /**
   * Métricas agrupadas por proveedor:
   * cantidad de pedidos, tiempo promedio, ítems y valor total importado.
   */
  getBySupplier(): SupplierReport[] {
    const db = getDb();

    const rows = db.prepare(`
      SELECT
        o.supplier,
        COUNT(DISTINCT o.id)                                              AS totalOrders,
        AVG(CASE
              WHEN o.status = 'recibido' AND o.actual_arrival IS NOT NULL
              THEN julianday(o.actual_arrival) - julianday(o.order_date)
              ELSE NULL
            END)                                                          AS avgTransitDays,
        COALESCE(SUM(i.quantity), 0)                                      AS totalItems,
        COALESCE(SUM(i.quantity * i.unit_price), 0)                       AS totalValue
      FROM import_orders o
      LEFT JOIN order_items i ON i.order_id = o.id
      GROUP BY o.supplier
      ORDER BY totalOrders DESC
    `).all() as unknown as Array<{
      supplier: string;
      totalOrders: number;
      avgTransitDays: number | null;
      totalItems: number;
      totalValue: number;
    }>;

    return rows.map((r) => ({
      supplier:        r.supplier,
      totalOrders:     r.totalOrders,
      avgTransitDays:  r.avgTransitDays != null ? Math.round(r.avgTransitDays * 10) / 10 : null,
      totalItems:      r.totalItems,
      totalValue:      r.totalValue,
    }));
  },

  /**
   * Evolución mensual: pedidos creados vs. pedidos recibidos por mes.
   */
  getMonthly(): MonthlyReport[] {
    const db = getDb();

    const created = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as cnt
      FROM import_orders GROUP BY month ORDER BY month
    `).all() as unknown as { month: string; cnt: number }[];

    const completed = db.prepare(`
      SELECT strftime('%Y-%m', actual_arrival) as month, COUNT(*) as cnt
      FROM import_orders
      WHERE status = 'recibido' AND actual_arrival IS NOT NULL
      GROUP BY month ORDER BY month
    `).all() as unknown as { month: string; cnt: number }[];

    const months = new Set([
      ...created.map((r) => r.month),
      ...completed.map((r) => r.month),
    ]);

    const createdMap   = Object.fromEntries(created.map((r) => [r.month, r.cnt]));
    const completedMap = Object.fromEntries(completed.map((r) => [r.month, r.cnt]));

    return [...months].sort().map((month) => ({
      month,
      ordersCreated:   createdMap[month]   ?? 0,
      ordersCompleted: completedMap[month] ?? 0,
    }));
  },
};
