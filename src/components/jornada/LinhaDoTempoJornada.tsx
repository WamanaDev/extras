import { cn } from '@/lib/utils';

export type OrigemBloco = 'BASE' | 'EXTRA_CONFIRMADA' | 'PROPOSTO';

export interface BlocoJornada {
  id: string;
  /** ISO com offset — `America/Sao_Paulo` (`CONVENTIONS.md`, "Datas na API"). */
  inicio: string;
  fim: string;
  origem: OrigemBloco;
  rotulo: string;
}

/**
 * `<LinhaDoTempoJornada />` — FE-002.
 *
 * Visualiza os blocos de 12h da semana do colaborador — escala base,
 * extras confirmadas e o bloco que seria criado. É a peça que torna
 * `EXCEDE_JORNADA` compreensível: blocos encostados na linha do tempo
 * explicam em um segundo o que a mensagem de erro sozinha não explica.
 *
 * A cadeia excedente (`cadeiaExcedenteIds`) é só destacada aqui — quem a
 * calcula é o chamador, tipicamente com `validaDescanso`
 * (`src/lib/escala/blocos.ts`, DOM-002), a mesma função-espelho que a UI já
 * usa para antecipar bloqueio (D-01). O componente não decide nada sozinho,
 * só pinta o que recebeu.
 */
export interface LinhaDoTempoJornadaProps {
  blocos: BlocoJornada[];
  /** IDs dos blocos que formam a cadeia contígua que excede `maxBlocosSeguidos`. */
  cadeiaExcedenteIds?: string[];
}

const RES_POR_HORA_PX = 6;

export function LinhaDoTempoJornada({ blocos, cadeiaExcedenteIds = [] }: LinhaDoTempoJornadaProps): JSX.Element {
  if (blocos.length === 0) {
    return (
      <div role="status" className="rounded-lg border border-slate-200 p-4 text-slate-600">
        Nenhum bloco de jornada para exibir.
      </div>
    );
  }

  const ordenados = [...blocos].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  const inicioJanela = Date.parse(ordenados[0]!.inicio);
  const excedente = new Set(cadeiaExcedenteIds);

  return (
    <div className="space-y-2" role="list" aria-label="Linha do tempo da jornada">
      {ordenados.map((bloco) => {
        const offsetHoras = (Date.parse(bloco.inicio) - inicioJanela) / (1000 * 60 * 60);
        const duracaoHoras = (Date.parse(bloco.fim) - Date.parse(bloco.inicio)) / (1000 * 60 * 60);
        const destacado = excedente.has(bloco.id);
        return (
          <div key={bloco.id} role="listitem" className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-xs text-slate-600">{bloco.rotulo}</span>
            <div className="relative h-8 flex-1 rounded bg-slate-100">
              <div
                className={cn(
                  'absolute top-0 h-full rounded border text-[10px] font-semibold text-white flex items-center justify-center',
                  bloco.origem === 'BASE' && 'bg-slate-700 border-slate-800',
                  bloco.origem === 'EXTRA_CONFIRMADA' && 'bg-blue-600 border-blue-800',
                  bloco.origem === 'PROPOSTO' && 'bg-amber-500 border-amber-700',
                  destacado && 'ring-2 ring-red-600 ring-offset-1',
                )}
                style={{ left: `${offsetHoras * RES_POR_HORA_PX}px`, width: `${duracaoHoras * RES_POR_HORA_PX}px` }}
                data-testid={`bloco-${bloco.id}`}
                data-excedente={destacado}
                title={`${bloco.rotulo}: ${origemLegivel(bloco.origem)}${destacado ? ' — parte da cadeia que excede a jornada máxima' : ''}`}
              >
                {duracaoHoras}h
              </div>
            </div>
          </div>
        );
      })}

      <ul className="flex flex-wrap gap-4 pt-2 text-xs text-slate-600">
        <li className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-slate-700" /> Escala base
        </li>
        <li className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-blue-600" /> Extra confirmada
        </li>
        <li className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-amber-500" /> Bloco proposto
        </li>
        <li className="flex items-center gap-1">
          <span className="h-3 w-3 rounded ring-2 ring-red-600" /> Cadeia que excede a jornada
        </li>
      </ul>
    </div>
  );
}

function origemLegivel(origem: OrigemBloco): string {
  if (origem === 'BASE') return 'escala base';
  if (origem === 'EXTRA_CONFIRMADA') return 'extra confirmada';
  return 'bloco proposto';
}
