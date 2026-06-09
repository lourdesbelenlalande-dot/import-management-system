import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/authService';
import { notificationService } from '../services/notificationService';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  role: z.enum(['admin', 'operator']).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authController = {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = RegisterSchema.parse(req.body);
      // Only admins can create other admins
      const requestedRole = body.role ?? 'operator';
      if (requestedRole === 'admin' && req.user?.role !== 'admin') {
        res.status(403).json({ error: 'Only admins can create admin accounts' });
        return;
      }
      const user = await authService.register(body.email, body.password, body.name, requestedRole);
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = LoginSchema.parse(req.body);
      const result = await authService.login(body.email, body.password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  me(req: Request, res: Response, next: NextFunction): void {
    try {
      const user = authService.getById(req.user!.userId);
      if (!user) { res.status(404).json({ error: 'User not found' }); return; }
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },

  listUsers(req: Request, res: Response, next: NextFunction): void {
    try {
      res.json({ users: authService.listUsers() });
    } catch (err) {
      next(err);
    }
  },

  getNotifications(req: Request, res: Response, next: NextFunction): void {
    try {
      const notifications = notificationService.getUnread(req.user!.userId);
      res.json({ notifications });
    } catch (err) {
      next(err);
    }
  },

  markNotificationRead(req: Request, res: Response, next: NextFunction): void {
    try {
      const { id } = req.params;
      const updated = notificationService.markRead(id, req.user!.userId);
      if (!updated) { res.status(404).json({ error: 'Notification not found' }); return; }
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  markAllRead(req: Request, res: Response, next: NextFunction): void {
    try {
      const count = notificationService.markAllRead(req.user!.userId);
      res.json({ updated: count });
    } catch (err) {
      next(err);
    }
  },
};
