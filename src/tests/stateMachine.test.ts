/**
 * TEST UNITARIO — Máquina de estados de pedidos
 * Verifica que solo se permitan transiciones válidas entre estados.
 */
import {
  isValidTransition,
  getAllowedTransitions,
  OrderStatus,
} from '../utils/orderStateMachine';

describe('Máquina de estados de pedidos de importación', () => {

  describe('Transiciones válidas (flujo feliz)', () => {
    it('pendiente → en_transito es válido', () => {
      expect(isValidTransition('pendiente', 'en_transito')).toBe(true);
    });

    it('en_transito → en_aduana es válido', () => {
      expect(isValidTransition('en_transito', 'en_aduana')).toBe(true);
    });

    it('en_aduana → recibido es válido', () => {
      expect(isValidTransition('en_aduana', 'recibido')).toBe(true);
    });

    it('cualquier estado activo → cancelado es válido', () => {
      const activos: OrderStatus[] = ['pendiente', 'en_transito', 'en_aduana'];
      activos.forEach((estado) => {
        expect(isValidTransition(estado, 'cancelado')).toBe(true);
      });
    });
  });

  describe('Transiciones inválidas (deben rechazarse)', () => {
    it('no se puede saltar pendiente → en_aduana', () => {
      expect(isValidTransition('pendiente', 'en_aduana')).toBe(false);
    });

    it('no se puede saltar pendiente → recibido', () => {
      expect(isValidTransition('pendiente', 'recibido')).toBe(false);
    });

    it('no se puede retroceder de en_aduana → en_transito', () => {
      expect(isValidTransition('en_aduana', 'en_transito')).toBe(false);
    });

    it('un pedido recibido no puede cambiar de estado', () => {
      const todosLosEstados: OrderStatus[] = ['pendiente', 'en_transito', 'en_aduana', 'recibido', 'cancelado'];
      todosLosEstados.forEach((destino) => {
        expect(isValidTransition('recibido', destino)).toBe(false);
      });
    });

    it('un pedido cancelado no puede cambiar de estado', () => {
      const todosLosEstados: OrderStatus[] = ['pendiente', 'en_transito', 'en_aduana', 'recibido', 'cancelado'];
      todosLosEstados.forEach((destino) => {
        expect(isValidTransition('cancelado', destino)).toBe(false);
      });
    });

    it('no se puede permanecer en el mismo estado', () => {
      const estados: OrderStatus[] = ['pendiente', 'en_transito', 'en_aduana'];
      estados.forEach((estado) => {
        expect(isValidTransition(estado, estado)).toBe(false);
      });
    });
  });

  describe('getAllowedTransitions', () => {
    it('desde pendiente permite en_transito y cancelado', () => {
      const permitidos = getAllowedTransitions('pendiente');
      expect(permitidos).toContain('en_transito');
      expect(permitidos).toContain('cancelado');
      expect(permitidos).toHaveLength(2);
    });

    it('desde recibido no hay transiciones posibles', () => {
      expect(getAllowedTransitions('recibido')).toHaveLength(0);
    });

    it('desde cancelado no hay transiciones posibles', () => {
      expect(getAllowedTransitions('cancelado')).toHaveLength(0);
    });
  });
});
