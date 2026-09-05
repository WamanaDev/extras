'use client';

import { use, useState } from 'react';
import { useListaApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmacaoImpacto } from '@/components/comum/ConfirmacaoImpacto';
import { patch, post, type ErroApi } from '@/lib/api/client';

interface CicloListado {
  id: string;
  ano: number;
  mes: number;
  status: string;
  limitePadrao: number;
  permiteCruzada: boolean;
  totais: { plantoes: number; vagas: number; ocupadas: number; colaboradoresComEscala: number };
}

/**
 * `/admin/ciclos/:id` — FE-001, API-ADM-CIC-004/005/006.
 *
 * Não existe `GET /api/admin/ciclos/:id` no contrato (só listar/atualizar) —
 * os dados do ciclo em foco vêm da mesma listagem de `API-ADM-CIC-001`,
 * filtrando pelo id no cliente. Reuso da rota existente, sem inventar uma
 * nova (ver `_conflitos.md`).
 */
export default function CicloDetalhePage({ params }: { params: Promise<{ id: string }> }): JSX.Element {
  const { id } = use(params);
  const ciclos = useListaApi<CicloListado>('/api/admin/ciclos?tamanho=200');
  const ciclo = ciclos.dados?.itens.find((c) => c.id === id) ?? null;

  const [limitePadrao, setLimitePadrao] = useState<number | null>(null);
  const [permiteCruzada, setPermiteCruzada] = useState<boolean | null>(null);
  const [erroConfig, setErroConfig] = useState<ErroApi | null>(null);
  const [impactoConfig, setImpactoConfig] = useState<string[] | null>(null);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [erroPublicar, setErroPublicar] = useState<ErroApi | null>(null);
  const [publicando, setPublicando] = useState(false);

  const [confirmacaoFechar, setConfirmacaoFechar] = useState('');
  const [erroFechar, setErroFechar] = useState<ErroApi | null>(null);
  const [fechando, setFechando] = useState(false);
  const [resumoFechamento, setResumoFechamento] = useState<{ colaboradores: number; extras: number; horas: number; deficits: number } | null>(
    null,
  );

  const [gerando, setGerando] = useState(false);
  const [resultadoGeracao, setResultadoGeracao] = useState<{ criados: number; jaExistentes: number; pulados: number } | null>(null);
  const [erroGeracao, setErroGeracao] = useState<ErroApi | null>(null);

  async function salvarConfig(confirmarImpacto: boolean): Promise<void> {
    setSalvandoConfig(true);
    setErroConfig(null);
    const body: Record<string, unknown> = { confirmarImpacto };
    if (limitePadrao !== null) body.limitePadrao = limitePadrao;
    if (permiteCruzada !== null) body.permiteCruzada = permiteCruzada;
    const resultado = await patch<{ ciclo: unknown }>(`/api/admin/ciclos/${id}`, body);
    setSalvandoConfig(false);
    if (resultado.ok) {
      setImpactoConfig(null);
      ciclos.recarregar();
      return;
    }
    if (resultado.erro.erro === 'IMPACTO_NAO_CONFIRMADO') {
      setImpactoConfig(Object.values(resultado.erro.detalhes ?? { info: resultado.erro.mensagem }));
      return;
    }
    setErroConfig(resultado.erro);
  }

  async function publicar(ignorarAvisos: boolean): Promise<void> {
    setPublicando(true);
    setErroPublicar(null);
    const resultado = await post<{ ciclo: { status: string }; avisos: Array<{ tipo: string; detalhe: string }> }>(
      `/api/admin/ciclos/${id}/publicar`,
      { ignorarAvisos },
    );
    setPublicando(false);
    if (resultado.ok) {
      setAvisos(null);
      ciclos.recarregar();
      return;
    }
    if (resultado.erro.erro === 'AVISOS_NAO_CONFIRMADOS') {
      setAvisos(Object.values(resultado.erro.detalhes ?? { info: resultado.erro.mensagem }));
      return;
    }
    setErroPublicar(resultado.erro);
  }

  async function fechar(): Promise<void> {
    setFechando(true);
    setErroFechar(null);
    const resultado = await post<{ ciclo: { status: string }; resumo: { colaboradores: number; extras: number; horas: number; deficits: number } }>(
      `/api/admin/ciclos/${id}/fechar`,
      { confirmacao: confirmacaoFechar },
    );
    setFechando(false);
    if (resultado.ok) {
      setResumoFechamento(resultado.dados.resumo);
      ciclos.recarregar();
    } else {
      setErroFechar(resultado.erro);
    }
  }

  async function gerarEscala(): Promise<void> {
    setGerando(true);
    setErroGeracao(null);
    const resultado = await post<{ criados: number; jaExistentes: number; pulados: Array<unknown> }>(`/api/admin/ciclos/${id}/gerar-escala`);
    setGerando(false);
    if (resultado.ok) {
      setResultadoGeracao({ criados: resultado.dados.criados, jaExistentes: resultado.dados.jaExistentes, pulados: resultado.dados.pulados.length });
    } else {
      setErroGeracao(resultado.erro);
    }
  }

  if (ciclos.carregando) return <EstadoCarregando texto="Carregando ciclo…" />;
  if (ciclos.erro) return <EstadoErro mensagem={ciclos.erro} />;
  if (!ciclo) return <EstadoVazio texto="Ciclo não encontrado." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">
          Ciclo {String(ciclo.mes).padStart(2, '0')}/{ciclo.ano}
        </h1>
        <Badge variant={ciclo.status === 'PUBLICADO' ? 'success' : ciclo.status === 'FECHADO' ? 'outline' : 'secondary'}>{ciclo.status}</Badge>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Configuração</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            Limite padrão de extras
            <input
              type="number"
              min={0}
              defaultValue={ciclo.limitePadrao}
              onChange={(evento) => setLimitePadrao(Number(evento.target.value))}
              disabled={ciclo.status === 'FECHADO'}
              className="w-32 rounded border border-slate-300 p-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              defaultChecked={ciclo.permiteCruzada}
              onChange={(evento) => setPermiteCruzada(evento.target.checked)}
              disabled={ciclo.status === 'FECHADO'}
            />
            Permite cruzada
          </label>
          <Button onClick={() => void salvarConfig(false)} disabled={salvandoConfig || ciclo.status === 'FECHADO'}>
            {salvandoConfig ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
        {ciclo.status === 'FECHADO' ? <p className="mt-2 text-sm text-slate-500">Ciclo fechado não pode ser alterado.</p> : null}
        {erroConfig ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erroConfig.mensagem}
          </p>
        ) : null}
        <ConfirmacaoImpacto
          aberto={impactoConfig !== null}
          titulo="Esta alteração afeta colaboradores existentes"
          itens={impactoConfig ?? []}
          carregando={salvandoConfig}
          onCancelar={() => setImpactoConfig(null)}
          onConfirmar={() => void salvarConfig(true)}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Gerar escala base</h2>
        <Button onClick={() => void gerarEscala()} disabled={gerando || ciclo.status === 'FECHADO'}>
          {gerando ? 'Gerando…' : 'Gerar escala'}
        </Button>
        {erroGeracao ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erroGeracao.mensagem}
          </p>
        ) : null}
        {resultadoGeracao ? (
          <p role="status" className="mt-2 text-sm text-emerald-800">
            {resultadoGeracao.criados} dia(s) criado(s); {resultadoGeracao.jaExistentes} já existiam; {resultadoGeracao.pulados} colaborador(es)
            pulado(s).
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Publicar</h2>
        <Button onClick={() => void publicar(false)} disabled={publicando || ciclo.status !== 'RASCUNHO'}>
          {publicando ? 'Publicando…' : 'Publicar ciclo'}
        </Button>
        {ciclo.status !== 'RASCUNHO' ? <p className="mt-2 text-sm text-slate-500">Só um ciclo em rascunho pode ser publicado.</p> : null}
        {erroPublicar ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erroPublicar.mensagem}
          </p>
        ) : null}
        <ConfirmacaoImpacto
          aberto={avisos !== null}
          titulo="Existem avisos antes de publicar"
          itens={avisos ?? []}
          carregando={publicando}
          onCancelar={() => setAvisos(null)}
          onConfirmar={() => void publicar(true)}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Fechar ciclo</h2>
        <p className="mb-2 text-sm text-slate-600">Ação irreversível. Digite <strong>FECHAR</strong> para confirmar.</p>
        <div className="flex items-end gap-3">
          <input
            type="text"
            value={confirmacaoFechar}
            onChange={(evento) => setConfirmacaoFechar(evento.target.value)}
            className="rounded border border-slate-300 p-2"
            disabled={ciclo.status !== 'PUBLICADO'}
          />
          <Button
            variant="destructive"
            onClick={() => void fechar()}
            disabled={fechando || confirmacaoFechar !== 'FECHAR' || ciclo.status !== 'PUBLICADO'}
          >
            {fechando ? 'Fechando…' : 'Fechar ciclo'}
          </Button>
        </div>
        {ciclo.status !== 'PUBLICADO' ? <p className="mt-2 text-sm text-slate-500">Só um ciclo publicado pode ser fechado.</p> : null}
        {erroFechar ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erroFechar.mensagem}
          </p>
        ) : null}
        {resumoFechamento ? (
          <p role="status" className="mt-2 text-sm text-emerald-800">
            Fechado: {resumoFechamento.colaboradores} colaborador(es), {resumoFechamento.extras} extra(s), {resumoFechamento.horas}h,{' '}
            {resumoFechamento.deficits} déficit(s) registrado(s).
          </p>
        ) : null}
      </section>
    </div>
  );
}
