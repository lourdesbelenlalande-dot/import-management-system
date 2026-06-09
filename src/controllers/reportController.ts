import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { reportService } from '../services/reportService';

const DashboardQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional().default(30),
});

export const reportController = {
  /**
   * GET /api/reports/dashboard
   * Resumen general: totales por estado, tiempo promedio de tránsito,
   * top proveedores, pedidos recientes y pedidos activos.
   */
  dashboard(req: Request, res: Response, next: NextFunction): void {
    try {
      const { days } = DashboardQuerySchema.parse(req.query);
      const data = reportService.getDashboard(days);
      res.json({ report: data, generatedAt: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/reports/suppliers
   * Detalle por proveedor: cantidad de pedidos, tiempo promedio,
   * total de ítems y valor total importado.
   */
  bySupplier(_req: Request, res: Response, next: NextFunction): void {
    try {
      const data = reportService.getBySupplier();
      res.json({ report: data, generatedAt: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/reports/monthly
   * Evolución mensual: pedidos creados vs. pedidos recibidos.
   */
  monthly(_req: Request, res: Response, next: NextFunction): void {
    try {
      const data = reportService.getMonthly();
      res.json({ report: data, generatedAt: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  },
};
