import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../config/database';
import { User, PublicUser, UserRole } from '../models/types';
import { AppError } from '../middleware/errorHandler';

const SALT_ROUNDS = 10;

export function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? 'dev_secret';
}

export const authService = {
  async register(email: string, password: string, name: string, role: UserRole = 'operator'): Promise<PublicUser> {
    const db = getDb();

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      throw new AppError(409, 'Email already registered');
    }

    if (password.length < 8) {
      throw new AppError(400, 'Password must be at least 8 characters');
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, email.toLowerCase().trim(), hash, name.trim(), role, now, now);

    return { id, email: email.toLowerCase().trim(), name: name.trim(), role, created_at: now, updated_at: now };
  },

  async login(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
    const db = getDb();

    const user = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email.toLowerCase().trim()) as unknown as User | undefined;

    if (!user) {
      throw new AppError(401, 'Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AppError(401, 'Invalid credentials');
    }

    const expiresIn = process.env.JWT_EXPIRES_IN ?? '24h';
    const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn } as jwt.SignOptions);

    const { password_hash: _, ...publicUser } = user;
    return { token, user: publicUser };
  },

  getById(userId: string): PublicUser | null {
    const db = getDb();
    const row = db
      .prepare('SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = ?')
      .get(userId) as unknown as PublicUser | undefined;
    return row ?? null;
  },

  listUsers(): PublicUser[] {
    const db = getDb();
    return db
      .prepare('SELECT id, email, name, role, created_at, updated_at FROM users ORDER BY created_at')
      .all() as unknown as PublicUser[];
  },
};
