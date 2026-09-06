'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { get, post, del, type ErroApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { TextoComDica } from '@/components/ui/tooltip';

export type MotivoIndisponivel =
  | 'JA_MARCADO'
  | 'CRUZADA_BLOQUEADA'
  | 'EM_AUSENCIA'
  | 'CONFLITO_DE_HORARIO'
  | 'EXCEDE_JORNADA'
  | 'LIMITE_ATINGIDO'
  | 'SEM_VAGA';

export interface PlantaoGrade {
  id: string;
  data: string;
  tipo: 'DIURNO' | 'NOTURNO';
  rt: string;
  horaInicio: string;
  horaFim: string;
  vagasTotais: number;
  vagasOcupadas: number;
  jaMarcado: boolean;
  disponivel: boolean;
  motivo: MotivoIndisponivel | null;
}

export interface GradePlantoesDados {
  saldo: { limite: number; usadas: number; restantes: number; permiteCruzada: boolean };
  plantoes: PlantaoGrade[];
}

/** Motivos que nem aparecem na tela — ver docstring de `GradePlantoes`. */
const MOTIVOS_OCULTOS = new Set<MotivoIndisponivel>(['CRUZADA_BLOQUEADA', 'CONFLITO_DE_HORARIO']);

const TEXTO_MOTIVO_PADRAO: Record<MotivoIndisponivel, string> = {
  JA_MARCADO: 'Você já marcou este plantão.',
  CRUZADA_BLOQUEADA: 'Você tem plantão base em outra RT bloqueada para cruzada.',
  EM_AUSENCIA: 'Você está de ausência neste dia.',
  CONFLITO_DE_HORARIO: 'Este horário conflita com seu plantão ou outra extra já marcada.',
  EXCEDE_JORNADA: 'Marcar esta extra excederia sua jornada máxima seguida.',
  LIMITE_ATINGIDO: 'Você atingiu seu limite de extras neste ciclo.',
  SEM_VAGA: 'Não há mais vagas disponíveis para este plantão.',
};

/**
 * `<GradePlantoes />` — FE-002.
 *
 * Calendário de extras (`API-COL-003 GET /api/plantoes`). Regra central
 * (FE-001.5): o componente **nunca** decide se um plantão está bloqueado —
 * só exibe `disponivel`/`motivo`, sempre como vieram da API. Nenhum `if`
 * aqui recalcula jornada, cruzada, limite ou vaga — só filtra, na
 * apresentação, quais motivos já resolvidos viram card.
 *
 * `SEM_VAGA` (e qualquer outro motivo exibido) é informação inline no lugar
 * da ação, nunca um toast de erro (FE-001.4) — por isso a marcação recusada
 * pela API também aparece como texto na própria célula, não como alerta
 * global.
 *
 * Desvio deliberado de `06-frontend/componentes.md` (que pede uma seção
 * separada "explicando a regra" para `CRUZADA_BLOQUEADA`, e mostra
 * `CONFLITO_DE_HORARIO` esmaecido no grid): a pedido do usuário, plantão de
 * outra RT com cruzada bloqueada e plantão em conflito com o próprio
 * plantão/extra do colaborador não aparecem em lugar nenhum da tela — nem
 * grid, nem seção à parte. Os demais motivos (`SEM_VAGA`, `EM_AUSENCIA`,
 * `EXCEDE_JORNADA`, `LIMITE_ATINGIDO`, `JA_MARCADO`) continuam visíveis
 * como antes. Registrado em `_conflitos.md`.
 */
export interface GradePlantoesProps {
  cicloId: string;
  dadosIniciais?: GradePlantoesDados;
  onMudouSaldo?: () => void;
  /**
   * Incrementa a cada evento de Realtime (RT-001, "regra de refetch") pra
   * disparar uma revalidação — nunca via `key` no componente pai: trocar a
   * `key` remonta o componente do zero, jogando fora `dados` e mostrando de
   * novo "Carregando…" a cada marcação de QUALQUER colaborador em qualquer
   * máquina, quebrando a imersão (achado em uso real, não coberto por
   * nenhum teste de aceitação de RT-001). Revalidação em segundo plano:
   * busca de novo sem limpar `dados`, troca só quando a resposta chega.
   */
  revalidarChave?: number;
}

export function GradePlantoes({ cicloId, dadosIniciais, onMudouSaldo, revalidarChave }: GradePlantoesProps): JSX.Element {
  const [dados, setDados] = useState<GradePlantoesDados | null>(dadosIniciais ?? null);
  const [carregando, setCarregando] = useState(dadosIniciais === undefined);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [erroPorPlantao, setErroPorPlantao] = useState<Record<string, string>>({});
  const [emAndamento, setEmAndamento] = useState<Record<string, boolean>>({});

  const buscar = async (): Promise<void> => {
    // Só mostra o estado de carregamento na primeira busca (sem dados
    // ainda) — revalidação em segundo plano (Realtime, ou depois de marcar/
    // cancelar) mantém a grade atual na tela até a resposta nova chegar.
    const primeiraCarga = dados === null;
    if (primeiraCarga) setCarregando(true);
    setErroCarga(null);
    const resultado = await get<GradePlantoesDados>(`/api/plantoes?cicloId=${encodeURIComponent(cicloId)}`);
    if (resultado.ok) {
      setDados(resultado.dados);
    } else if (primeiraCarga) {
      setErroCarga(resultado.erro.mensagem);
    }
    if (primeiraCarga) setCarregando(false);
  };

  const primeiraRenderizacao = useRef(true);
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      if (dadosIniciais !== undefined) return; // já veio hidratado (SSR) — não refaz na montagem.
    }
    void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cicloId, revalidarChave]);

  const [filtroRt, setFiltroRt] = useState<string>('TODAS');
  const [filtroTurno, setFiltroTurno] = useState<'TODOS' | 'DIURNO' | 'NOTURNO'>('TODOS');

  const disponiveis = useMemo(() => {
    const lista = dados?.plantoes ?? [];
    return lista.filter((p) => p.motivo === null || !MOTIVOS_OCULTOS.has(p.motivo));
  }, [dados]);

  const rts = useMemo(() => Array.from(new Set(disponiveis.map((p) => p.rt))).sort(), [disponiveis]);

  const filtrados = useMemo(() => {
    return disponiveis.filter(
      (p) => (filtroRt === 'TODAS' || p.rt === filtroRt) && (filtroTurno === 'TODOS' || p.tipo === filtroTurno),
    );
  }, [disponiveis, filtroRt, filtroTurno]);

  async function marcar(plantao: PlantaoGrade): Promise<void> {
    setEmAndamento((atual) => ({ ...atual, [plantao.id]: true }));
    setErroPorPlantao((atual) => ({ ...atual, [plantao.id]: '' }));
    const resultado = await post<{ id: string; plantaoId: string }>('/api/marcacoes', { plantaoId: plantao.id }, {
      idempotencyKey: `marcar-${plantao.id}`,
    });
    setEmAndamento((atual) => ({ ...atual, [plantao.id]: false }));
    if (resultado.ok) {
      await buscar();
      onMudouSaldo?.();
    } else {
      registrarErroInline(plantao.id, resultado.erro);
    }
  }

  async function cancelar(plantao: PlantaoGrade, marcacaoId: string): Promise<void> {
    setEmAndamento((atual) => ({ ...atual, [plantao.id]: true }));
    const resultado = await del<{ id: string }>(`/api/marcacoes/${marcacaoId}`);
    setEmAndamento((atual) => ({ ...atual, [plantao.id]: false }));
    if (resultado.ok) {
      await buscar();
      onMudouSaldo?.();
    } else {
      registrarErroInline(plantao.id, resultado.erro);
    }
  }

  function registrarErroInline(plantaoId: string, erro: ErroApi): void {
    // FE-001.4: 409 (e demais erros de negócio) nunca vira toast — a
    // mensagem some no lugar da ação, sempre com o texto da API.
    setErroPorPlantao((atual) => ({ ...atual, [plantaoId]: erro.mensagem }));
  }

  if (carregando && !dados) {
    return (
      <div role="status" aria-live="polite" className="rounded-lg border border-slate-200 p-4">
        Carregando plantões disponíveis…
      </div>
    );
  }

  if (erroCarga) {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
        {erroCarga}
      </div>
    );
  }

  if (!dados || dados.plantoes.length === 0 || disponiveis.length === 0) {
    return (
      <div role="status" className="rounded-lg border border-slate-200 p-4 text-slate-600">
        Nenhum plantão de extra disponível neste ciclo.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">RT</span>
          <select
            value={filtroRt}
            onChange={(e) => setFiltroRt(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <option value="TODAS">Todas</option>
            {rts.map((rt) => (
              <option key={rt} value={rt}>
                {rt}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">Horário</span>
          <select
            value={filtroTurno}
            onChange={(e) => setFiltroTurno(e.target.value as 'TODOS' | 'DIURNO' | 'NOTURNO')}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <option value="TODOS">Todos</option>
            <option value="DIURNO">Diurno</option>
            <option value="NOTURNO">Noturno</option>
          </select>
        </label>
      </div>

      {filtrados.length === 0 ? (
        <div role="status" className="rounded-lg border border-slate-200 p-4 text-slate-600">
          Nenhum plantão disponível com esses filtros.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((plantao) => (
            <CardPlantao
              key={plantao.id}
              plantao={plantao}
              emAndamento={emAndamento[plantao.id] ?? false}
              erroInline={erroPorPlantao[plantao.id]}
              onMarcar={() => void marcar(plantao)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CardPlantao({
  plantao,
  emAndamento,
  erroInline,
  onMarcar,
}: {
  plantao: PlantaoGrade;
  emAndamento: boolean;
  erroInline: string | undefined;
  onMarcar: () => void;
}): JSX.Element {
  const estado = estadoVisual(plantao);

  return (
    <li
      className={cn(
        'rounded-lg border p-3 text-sm',
        estado === 'disponivel' && 'border-emerald-300 bg-emerald-50',
        estado === 'marcado' && 'border-blue-300 bg-blue-50',
        (estado === 'lotado' || estado === 'bloqueado') && 'border-slate-200 bg-slate-50 opacity-70',
      )}
      data-testid={`plantao-${plantao.id}`}
      data-motivo={plantao.motivo ?? ''}
    >
      <div className="flex items-center justify-between font-medium text-slate-900">
        <span>
          {plantao.rt} · {plantao.tipo === 'DIURNO' ? 'Diurno' : 'Noturno'}
        </span>
        <span>{plantao.data}</span>
      </div>
      <p className="text-slate-600">
        {plantao.horaInicio}–{plantao.horaFim} · {plantao.vagasOcupadas}/{plantao.vagasTotais} vagas
      </p>

      <div className="mt-2">
        {plantao.jaMarcado ? (
          <Button variant="outline" size="sm" disabled aria-disabled="true">
            Já marcado
          </Button>
        ) : plantao.disponivel ? (
          <Button size="sm" onClick={onMarcar} disabled={emAndamento} aria-busy={emAndamento}>
            {emAndamento ? 'Marcando…' : 'Marcar extra'}
          </Button>
        ) : (
          <TextoComDica
            texto={
              <Button size="sm" variant="outline" disabled aria-disabled="true">
                {plantao.motivo === 'SEM_VAGA' ? 'Sem vaga' : 'Indisponível'}
              </Button>
            }
            dica={plantao.motivo ? TEXTO_MOTIVO_PADRAO[plantao.motivo] : 'Indisponível.'}
          />
        )}
      </div>

      {/* FE-001.4: qualquer recusa (inclusive SEM_VAGA de uma corrida perdida) aparece aqui, nunca em toast. */}
      {erroInline ? (
        <p role="status" className="mt-2 text-red-700">
          {erroInline}
        </p>
      ) : null}
    </li>
  );
}

function estadoVisual(plantao: PlantaoGrade): 'disponivel' | 'marcado' | 'lotado' | 'bloqueado' {
  if (plantao.jaMarcado) return 'marcado';
  if (plantao.disponivel) return 'disponivel';
  if (plantao.motivo === 'SEM_VAGA') return 'lotado';
  return 'bloqueado';
}
