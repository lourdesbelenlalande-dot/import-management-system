/**
 * Capa de acceso a datos usando node:sqlite — módulo nativo de Node.js 22+.
 * No requiere ninguna dependencia externa ni compilación C++.
 */
import { DatabaseSync, StatementSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

let db: DatabaseSync;

export function getDb(): DatabaseSync {
  if (!db) {
    const dbPath = process.env.DB_PATH ?? './data/imports.db';

    // Crear carpeta si no existe (excepto en memoria)
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    db = new DatabaseSync(dbPath);

    // Activar WAL para mejor concurrencia y claves foráneas
    db.exec(`PRAGMA journal_mode = WAL`);
    db.exec(`PRAGMA foreign_keys = ON`);
  }
  return db;
}

/**
 * Ejecuta una función dentro de una transacción explícita BEGIN/COMMIT.
 * Si ocurre un error se hace ROLLBACK automáticamente.
 */
export function runTransaction(database: DatabaseSync, fn: () => void): void {
  database.exec('BEGIN');
  try {
    fn();
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

export function initializeSchema(): void {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'operator')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS import_orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      supplier TEXT NOT NULL,
      supplier_country TEXT NOT NULL,
      order_date TEXT NOT NULL,
      estimated_arrival TEXT,
      actual_arrival TEXT,
      status TEXT NOT NULL DEFAULT 'pendiente'
        CHECK(status IN ('pendiente','en_transito','en_aduana','recibido','cancelado')),
      malvina_ref TEXT,
      notes TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES import_orders(id) ON DELETE CASCADE,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL CHECK(unit_price >= 0),
      currency TEXT NOT NULL DEFAULT 'USD'
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES import_orders(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by TEXT NOT NULL REFERENCES users(id),
      comment TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      order_id TEXT REFERENCES import_orders(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status     ON import_orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created_by ON import_orders(created_by);
    CREATE INDEX IF NOT EXISTS idx_notif_user        ON notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS idx_history_order     ON order_status_history(order_id);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}

// Re-exportar tipo para usarlo en los servicios sin importar node:sqlite directamente
export type { DatabaseSync, StatementSync };
