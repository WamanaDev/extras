import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmacaoImpacto } from './ConfirmacaoImpacto';

describe('ConfirmacaoImpacto', () => {
  it('exige marcar "li e entendo" antes de habilitar a confirmação (FE-001.6)', async () => {
    const usuario = userEvent.setup();
    const onConfirmar = vi.fn();

    render(
      <ConfirmacaoImpacto
        aberto
        itens={['Marcação de João em 12/09', 'Marcação de Maria em 13/09']}
        onConfirmar={onConfirmar}
        onCancelar={() => {}}
      />,
    );

    const botaoConfirmar = screen.getByRole('button', { name: /Confirmar mesmo assim/ });
    expect(botaoConfirmar).toBeDisabled();

    await usuario.click(screen.getByRole('checkbox', { name: /Li e entendo/ }));
    expect(botaoConfirmar).toBeEnabled();

    await usuario.click(botaoConfirmar);
    expect(onConfirmar).toHaveBeenCalledOnce();
  });

  it('lista os afetados vindos de quem chamou', () => {
    render(<ConfirmacaoImpacto aberto itens={['Item A', 'Item B']} onConfirmar={() => {}} onCancelar={() => {}} />);
    expect(screen.getByText('Item A')).toBeInTheDocument();
    expect(screen.getByText('Item B')).toBeInTheDocument();
  });
});
