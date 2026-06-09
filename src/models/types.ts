import { OrderStatus } from '../utils/orderStateMachine';

export type UserRole = 'admin' | 'operator';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  currency: string;
}

export interface ImportOrder {
  id: string;
  order_number: string;
  supplier: string;
  supplier_country: string;
  order_date: string;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  status: OrderStatus;
  malvina_ref: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string;
  comment: string | null;
  changed_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  order_id: string | null;
  type: string;
  message: string;
  read: number;
  created_at: string;
}

// DTO shapes returned to the API consumer (no password_hash)
export type PublicUser = Omit<User, 'password_hash'>;

export interface ImportOrderWithDetails extends ImportOrder {
  items: OrderItem[];
  history: OrderStatusHistory[];
}
