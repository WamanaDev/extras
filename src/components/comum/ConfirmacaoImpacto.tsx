'use client';

import { useState, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * `<ConfirmacaoImpacto />` — FE-002.
 *
 * Modal genérico para o padrão `IMPACTO_NAO_CONFIRMADO`: qualquer rota que
 * devolva `409 IMPACTO_NAO_CONFIRMADO` deve reabrir a ação com
 * `confirmarImpacto: true` só depois que o usuário **leu** a lista de
 * afetados — não é um "confirmar" cego (FE-001.6, ação destrutiva/impactante
 * exige confirmação com o impacto listado).
 *
 * Usado por `API-ADM-CIC-004`, `API-ADM-ESC-002/003`, `API-ADM-PLA-003/004`,
 * `API-ADM-PAR-001/002` — todas devolvem formatos de impacto ligeiramente
 * diferentes, por isso o conteúdo é uma lista de `ReactNode` já formatada
 * por quem chama, não um tipo fixo de payload.
 */
export interface ConfirmacaoImpactoProps {
  aberto: boolean;
  titulo?: string;
  /** Cada item já formatado pelo chamador (ex.: "Marcação de João em 12/03 às 07h"). */
  itens: ReactNode[];
  mensagem?: string;
  carregando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export function ConfirmacaoImpacto({
  aberto,
  titulo = 'Confirme o impacto desta alteração',
  itens,
  mensagem = 'Esta ação afeta os itens abaixo. Revise antes de confirmar.',
  carregando = false,
  onConfirmar,
  onCancelar,
}: ConfirmacaoImpactoProps): JSX.Element {
  const [li, setLi] = useState(false);

  // Reabrir sempre limpa a leitura anterior — cada nova confirmação exige nova leitura.
  const key = aberto ? 'aberto' : 'fechado';

  return (
    <Dialog aberto={aberto} onFechar={onCancelar} titulo={titulo}>
      <div key={key}>
        <p className="text-sm text-slate-600">{mensagem}</p>

        {itens.length > 0 ? (
          <ul className="mt-3 max-h-64 list-disc space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 pl-8 text-sm text-slate-800">
            {itens.map((item, indice) => (
              // eslint-disable-next-line react/no-array-index-key -- itens já formatados pelo chamador, sem id estável garantido
              <li key={indice}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm italic text-slate-500">Nenhum item afetado listado pela API.</p>
        )}

        <label className="mt-4 flex items-start gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={li}
            onChange={(evento) => setLi(evento.target.checked)}
            aria-required="true"
          />
          Li e entendo o impacto listado acima.
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={carregando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirmar} disabled={!li || carregando}>
            {carregando ? 'Confirmando…' : 'Confirmar mesmo assim'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
