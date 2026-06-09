import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { orderService } from '../services/orderService';
import { OrderStatus } from '../utils/orderStateMachine';
import { AppError } from '../middleware/errorHandler';

// ── Esquemas de validación con Zod ──────────────────────────────────────────

const ItemSchema = z.object({
  product_code: z.string().min(1),
  product_name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unit_price: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
});

const CreateOrderSchema = z.object({
  supplier: z.string().min(1, 'El proveedor es obligatorio'),
  supplier_country: z.string().min(1, 'El país del proveedor es obligatorio'),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  estimated_arrival: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido')
    .optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(ItemSchema).min(1, 'Debe incluir al menos un producto'),
});

const UpdateStatusSchema = z.object({
  status: z.enum(['pendiente', 'en_transito', 'en_aduana', 'recibido', 'cancelado']),
  comment: z.string().max(500).optional(),
});

const UpdateOrderSchema = z.object({
  supplier: z.string().min(1).optional(),
  estimated_arrival: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(1000).optional(),
});

const ListQuerySchema = z.object({
  status: z.enum(['pendiente', 'en_transito', 'en_aduana', 'recibido', 'cancelado']).optional(),
  supplier: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// ── Controlador ─────────────────────────────────────────────────────────────

export const orderController = {
  /**
   * POST /api/orders
   * Crea un nuevo pedido de importación y lo registra en Sistema Malvina.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = CreateOrderSchema.parse(req.body);
      const order = await orderService.create(body, req.user!.userId);
      res.status(201).json({ order });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/orders
   * Lista pedidos con filtros opcionales y paginación.
   */
  list(req: Request, res: Response, next: NextFunction): void {
    try {
      const query = ListQuerySchema.parse(req.query);
      const result = orderService.list({
        status: query.status as OrderStatus | undefined,
        supplier: query.supplier,
        from_date: query.from_date,
        to_date: query.to_date,
        page: query.page,
        limit: query.limit,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/orders/:id
   * Devuelve un pedido con sus ítems e historial de estados.
   */
  getOne(req: Request, res: Response, next: NextFunction): void {
    try {
      const order = orderService.getById(req.params.id);
      if (!order) throw new AppError(404, 'Pedido no encontrado');
      res.json({ order });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/orders/:id/status
   * Cambia el estado del pedido siguiendo la máquina de estados.
   * Emite notificación automática a todos los involucrados.
   */
  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, comment } = UpdateStatusSchema.parse(req.body);
      const order = await orderService.updateStatus(
        req.params.id,
        status as OrderStatus,
        req.user!.userId,
        comment,
      );
      res.json({ order });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/orders/:id
   * Edita campos básicos de un pedido (no el estado).
   */
  update(req: Request, res: Response, next: NextFunction): void {
    try {
      const fields = UpdateOrderSchema.parse(req.body);
      const order = orderService.update(req.params.id, fields, req.user!.userId);
      res.json({ order });
    } catch (err) {
      next(err);
    }
  },
};
