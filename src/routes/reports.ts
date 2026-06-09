import { Router } from 'express';
import { reportController } from '../controllers/reportController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Los reportes solo están disponibles para administradores
router.use(authenticate, requireRole('admin', 'operator'));

router.get('/dashboard', reportController.dashboard);
router.get('/suppliers', reportController.bySupplier);
router.get('/monthly', reportController.monthly);

export default router;
