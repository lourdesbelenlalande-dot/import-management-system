import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Rutas públicas (sin autenticación)
router.post('/login', authController.login);

// Ruta protegida: solo un admin puede crear nuevos usuarios
router.post('/register', authenticate, requireRole('admin'), authController.register);

// Rutas protegidas para cualquier usuario autenticado
router.get('/me', authenticate, authController.me);
router.get('/users', authenticate, requireRole('admin'), authController.listUsers);

// Notificaciones del usuario autenticado
router.get('/notifications', authenticate, authController.getNotifications);
router.patch('/notifications/:id/read', authenticate, authController.markNotificationRead);
router.patch('/notifications/read-all', authenticate, authController.markAllRead);

export default router;
