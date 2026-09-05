import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SaldoExtras } from './SaldoExtras';

describe('SaldoExtras', () => {
  it('mostra usadas/limite e não bloqueia em silêncio quando ainda há saldo', () => {
    render(
      <SaldoExtras
        cicloId="ciclo-1"
        saldo={{ limite: 4, usadas: 1, restantes: 3, permiteCruzada: true, bloqueado: false, motivoBloqueio: null }}
      />,
    );
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
    expect(screen.getByText(/3 extra\(s\) ainda disponíveis/)).toBeInTheDocument();
  });

  it('ao atingir o limite, explica por que as ações estão desabilitadas em vez de só desabilitar', () => {
    render(
      <SaldoExtras
        cicloId="ciclo-1"
        saldo={{ limite: 4, usadas: 4, restantes: 0, permiteCruzada: true, bloqueado: true, motivoBloqueio: 'Limite mensal atingido.' }}
      />,
    );
    expect(screen.getByText('Limite mensal atingido.')).toBeInTheDocument();
  });
});
