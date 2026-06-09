export type OrderStatus =
  | 'pendiente'
  | 'en_transito'
  | 'en_aduana'
  | 'recibido'
  | 'cancelado';

// Valid transitions: from -> allowed next states
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente:   ['en_transito', 'cancelado'],
  en_transito: ['en_aduana', 'cancelado'],
  en_aduana:   ['recibido', 'cancelado'],
  recibido:    [],
  cancelado:   [],
};

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAllowedTransitions(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from] ?? [];
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente:   'Pendiente',
  en_transito: 'En Tránsito',
  en_aduana:   'En Aduana',
  recibido:    'Recibido',
  cancelado:   'Cancelado',
};

export const STATUS_ORDER: OrderStatus[] = [
  'pendiente',
  'en_transito',
  'en_aduana',
  'recibido',
];
