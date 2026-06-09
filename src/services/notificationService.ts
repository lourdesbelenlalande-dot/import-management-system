import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../config/database';
import { Notification } from '../models/types';
import { OrderStatus, STATUS_LABELS } from '../utils/orderStateMachine';

class NotificationService {
  /**
   * Se llama automáticamente cada vez que un pedido cambia de estado.
   * Crea una notificación en base de datos para todos los admins + el creador.
   */
  async onStatusChange(
    orderId: string,
    orderNumber: string,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    createdBy: string,
  ): Promise<void> {
    const db = getDb();

    const message = fromStatus
      ? `Pedido ${orderNumber} cambió de "${STATUS_LABELS[fromStatus]}" a "${STATUS_LABELS[toStatus]}"`
      : `Pedido ${orderNumber} creado con estado "${STATUS_LABELS[toStatus]}"`;

    // Destinatarios: todos los admins + el creador del pedido
    const admins = db
      .prepare(`SELECT id FROM users WHERE role = 'admin'`)
      .all() as unknown as { id: string }[];

    const recipientIds = new Set<string>([...admins.map((a) => a.id), createdBy]);
    const now = new Date().toISOString();

    for (const userId of recipientIds) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, order_id, type, message, read, created_at)
        VALUES (?, ?, ?, 'status_change', ?, 0, ?)
      `).run(uuidv4(), userId, orderId, message, now);
    }

    // En producción: aquí se enviaría email / Slack / push
    console.log(`[Notificación] ${message}`);
  }

  getUnread(userId: string): Notification[] {
    const db = getDb();
    return db
      .prepare(`
        SELECT * FROM notifications
        WHERE user_id = ? AND read = 0
        ORDER BY created_at DESC
      `)
      .all(userId) as unknown as Notification[];
  }

  markRead(notificationId: string, userId: string): boolean {
    const db = getDb();
    const result = db
      .prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`)
      .run(notificationId, userId);
    return Number(result.changes ?? 0) > 0;
  }

  markAllRead(userId: string): number {
    const db = getDb();
    const result = db
      .prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0`)
      .run(userId);
    return Number(result.changes ?? 0);
  }
}

export const notificationService = new NotificationService();
