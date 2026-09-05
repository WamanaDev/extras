'use client';

import { use } from 'react';
import { useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { EscalaImpressao, type EscalaImpressaoDados } from '@/components/escala/EscalaImpressao';
import { Button } from '@/components/ui/button';

interface GradeBruta {
  ciclo: { ano: number; mes: number; dias: number };
  colaboradores: Array<{
    id: string;
    nome: string;
    matricula: string;
    rt: string;
    turnoPadrao: 'DIURNO' | 'NOTURNO';
    paridade: 'IMPAR' | 'PAR';
    dias: Record<number, { codigo: string; temExtra: boolean; extraTurno?: 'DIURNO' | 'NOTURNO'; extraRt?: string }>;
    extras: Array<{ dia: number; turno: 'DIURNO' | 'NOTURNO'; rt: string }>;
  }>;
  codigos: Array<{ codigo: string; descricao: string; cor: string }>;
}

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * `/admin/ciclos/:id/escala/imprimir` — FE-001, API-ADM-ESC-004.
 *
 * Reaproveita `GET /api/admin/ciclos/:id/escala` (`API-ADM-ESC-001`) — o
 * mesmo dado da grade editável — e monta `EscalaImpressaoDados` sem o campo
 * `observacao` (o tipo do componente nem o declara; ver doc-comment de
 * `EscalaImpressao.tsx`, "confidencial"). Os links de exportação real
 * (PDF/XLSX assinados) apontam direto para `API-ADM-ESC-004`
 * (`/api/admin/ciclos/:id/escala/export`), que devolve o binário.
 */
export default function ImprimirEscalaPage({ params }: { params: Promise<{ id: string }> }): JSX.Element {
  const { id } = use(params);
  const grade = useRecursoApi<GradeBruta>(`/api/admin/ciclos/${encodeURIComponent(id)}/escala`);

  if (grade.carregando) return <EstadoCarregando texto="Carregando escala para impressão…" />;
  if (grade.erro) return <EstadoErro mensagem={grade.erro} />;
  if (!grade.dados || grade.dados.colaboradores.length === 0) return <EstadoVazio texto="Nenhum colaborador para imprimir." />;

  const dados: EscalaImpressaoDados = {
    ciclo: {
      ano: grade.dados.ciclo.ano,
      mes: grade.dados.ciclo.mes,
      dias: grade.dados.ciclo.dias,
      competencia: `${NOMES_MES[grade.dados.ciclo.mes - 1]}/${grade.dados.ciclo.ano}`,
    },
    colaboradores: grade.dados.colaboradores.map((c) => ({
      id: c.id,
      nome: c.nome,
      matricula: c.matricula,
      rt: c.rt,
      turnoPadrao: c.turnoPadrao,
      paridade: c.paridade,
      dias: Object.fromEntries(
        Object.entries(c.dias).map(([dia, celula]) => [
          dia,
          {
            codigo: celula.codigo,
            temExtra: celula.temExtra,
            ...(celula.extraTurno ? { extraTurno: celula.extraTurno } : {}),
            ...(celula.extraRt ? { extraRt: celula.extraRt } : {}),
          },
        ]),
      ),
      extras: c.extras,
    })),
    codigos: grade.dados.codigos.map((c) => ({ codigo: c.codigo, descricao: c.descricao, cor: c.cor })),
  };

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Impressão da escala</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            Imprimir
          </Button>
          <a href={`/api/admin/ciclos/${encodeURIComponent(id)}/escala/export?formato=pdf`}>
            <Button variant="outline">Baixar PDF</Button>
          </a>
          <a href={`/api/admin/ciclos/${encodeURIComponent(id)}/escala/export?formato=xlsx`}>
            <Button variant="outline">Baixar XLSX</Button>
          </a>
        </div>
      </div>

      <EscalaImpressao dados={dados} cicloId={id} geradoEm={new Date()} />
    </div>
  );
}
