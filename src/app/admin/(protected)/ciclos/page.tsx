'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useListaApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { post, type ErroApi } from '@/lib/api/client';

interface CicloListado {
  id: string;
  ano: number;
  mes: number;
  status: string;
  limitePadrao: number;
  permiteCruzada: boolean;
  totais: { plantoes: number; vagas: number; ocupadas: number; colaboradoresComEscala: number };
}

interface FormularioCriar {
  ano: number;
  mes: number;
  limitePadrao: number;
  permiteCruzada: boolean;
}

const ANO_ATUAL = new Date().getFullYear();

/** `/admin/ciclos` — FE-001, API-ADM-CIC-001 (listar) / API-ADM-CIC-002 (criar). */
export default function CiclosPage(): JSX.Element {
  const ciclos = useListaApi<CicloListado>('/api/admin/ciclos?tamanho=100');
  const [form, setForm] = useState<FormularioCriar>({ ano: ANO_ATUAL, mes: new Date().getMonth() + 1, limitePadrao: 4, permiteCruzada: true });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);

  async function criar(): Promise<void> {
    setEnviando(true);
    setErro(null);
    const resultado = await post<{ id: string }>('/api/admin/ciclos', form);
    setEnviando(false);
    if (resultado.ok) {
      ciclos.recarregar();
    } else {
      setErro(resultado.erro);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Ciclos</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Novo ciclo</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            void criar();
          }}
        >
          <label className="flex flex-col text-sm">
            Ano
            <input
              type="number"
              value={form.ano}
              onChange={(evento) => setForm((atual) => ({ ...atual, ano: Number(evento.target.value) }))}
              className="w-24 rounded border border-slate-300 p-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            Mês
            <input
              type="number"
              min={1}
              max={12}
              value={form.mes}
              onChange={(evento) => setForm((atual) => ({ ...atual, mes: Number(evento.target.value) }))}
              className="w-20 rounded border border-slate-300 p-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            Limite padrão de extras
            <input
              type="number"
              min={0}
              value={form.limitePadrao}
              onChange={(evento) => setForm((atual) => ({ ...atual, limitePadrao: Number(evento.target.value) }))}
              className="w-32 rounded border border-slate-300 p-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.permiteCruzada}
              onChange={(evento) => setForm((atual) => ({ ...atual, permiteCruzada: evento.target.checked }))}
            />
            Permite cruzada
          </label>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Criando…' : 'Criar ciclo'}
          </Button>
        </form>
        {erro ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erro.mensagem}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        {ciclos.carregando ? (
          <EstadoCarregando />
        ) : ciclos.erro ? (
          <EstadoErro mensagem={ciclos.erro} />
        ) : !ciclos.dados || ciclos.dados.itens.length === 0 ? (
          <EstadoVazio texto="Nenhum ciclo cadastrado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="p-2">Competência</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Limite</th>
                  <th className="p-2">Cruzada</th>
                  <th className="p-2">Vagas</th>
                  <th className="p-2">Escalados</th>
                </tr>
              </thead>
              <tbody>
                {ciclos.dados.itens.map((ciclo) => (
                  <tr key={ciclo.id} className="border-b border-slate-100">
                    <td className="p-2">
                      <Link href={`/admin/ciclos/${ciclo.id}`} className="font-medium text-slate-900 underline">
                        {String(ciclo.mes).padStart(2, '0')}/{ciclo.ano}
                      </Link>
                    </td>
                    <td className="p-2">
                      <Badge variant={ciclo.status === 'PUBLICADO' ? 'success' : ciclo.status === 'FECHADO' ? 'outline' : 'secondary'}>
                        {ciclo.status}
                      </Badge>
                    </td>
                    <td className="p-2">{ciclo.limitePadrao}</td>
                    <td className="p-2">{ciclo.permiteCruzada ? 'Sim' : 'Não'}</td>
                    <td className="p-2">
                      {ciclo.totais.ocupadas}/{ciclo.totais.vagas}
                    </td>
                    <td className="p-2">{ciclo.totais.colaboradoresComEscala}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
