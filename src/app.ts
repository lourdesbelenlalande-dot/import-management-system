import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initializeSchema } from './config/database';
import authRoutes from './routes/auth';
import orderRoutes from './routes/orders';
import reportRoutes from './routes/reports';
import { errorHandler } from './middleware/errorHandler';

export const app = express();

// ── Middlewares globales ─────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Healthcheck ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Rutas de la API ──────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);

// ── Ruta no encontrada ───────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ── Manejador de errores centralizado ───────────────────────────────────────
app.use(errorHandler);

// ── Arranque del servidor (solo cuando se ejecuta directamente) ──────────────
if (require.main === module) {
  initializeSchema();

  const PORT = parseInt(process.env.PORT ?? '3000', 10);
  app.listen(PORT, () => {
    console.log(`\n🚢  Sistema de Gestión de Importaciones`);
    console.log(`📡  Servidor corriendo en http://localhost:${PORT}`);
    console.log(`🗄️   Base de datos: ${process.env.DB_PATH ?? './data/imports.db'}`);
    console.log(`🌐  Entorno: ${process.env.NODE_ENV ?? 'development'}\n`);
  });
}
