import { Router } from 'express';
import { orderController } from '../controllers/orderController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Todas las rutas de pedidos requieren estar autenticado
router.use(authenticate);

// Cualquier usuario autenticado puede ver y crear pedidos
router.get('/', orderController.list);
router.get('/:id', orderController.getOne);
router.post('/', orderController.create);

// Editar datos del pedido (admin o creador)
router.patch('/:id', orderController.update);

// Cambiar estado: solo admin u operador con rol permitido
router.patch('/:id/status', requireRole('admin', 'operator'), orderController.updateStatus);

export default router;
