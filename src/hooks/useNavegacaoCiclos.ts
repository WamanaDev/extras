'use client';

/**
 * `useNavegacaoCiclos` — pedido do usuário: os chevrons de
 * `/plantoes-calendario` e `/minha-escala-calendario` navegam entre ciclos
 * `PUBLICADO` (nunca `FECHADO` — "ciclo cancelado, não serve pra nada" nas
 * palavras do usuário) via `GET /api/ciclos/vizinhos`.
 *
 * Mantém sempre uma janela de 3 (`anterior`/`atual`/`proximo`) — ao navegar,
 * o vizinho já conhecido vira o novo `atual` NA HORA (sem esperar rede,
 * "não quebrar a experiência do usuário com uma tela de carregando toda
 * hora"), e só then busca a janela de novo centrada nele pra descobrir mais
 * um passo adiante (o "+1" pedido). Quem usa este hook ainda precisa
 * buscar/cachear os DADOS de cada ciclo (plantões, escala, etc.) por conta
 * própria — este hook só resolve QUAL ciclo mostrar a seguir.
 */
import { useCallback, useEffect, useState } from 'react';
import { get } from '@/lib/api/client';

export interface CicloResumo {
  id: string;
  ano: number;
  mes: number;
  janela: { abertura: string | null; fechamento: string | null; estado: 'ANTES' | 'ABERTA' | 'ENCERRADA' };
  permiteCruzada: boolean;
}

interface VizinhosResposta {
  anterior: CicloResumo | null;
  atual: CicloResumo | null;
  proximo: CicloResumo | null;
  servidorEm: string;
}

export interface NavegacaoCiclos {
  atual: CicloResumo;
  /** Objeto completo (não só um booleano) — quem usa o hook pode pré-buscar os DADOS deste ciclo antes do usuário navegar até ele. */
  anterior: CicloResumo | null;
  proximo: CicloResumo | null;
  irParaAnterior: () => void;
  irParaProximo: () => void;
}

export function useNavegacaoCiclos(cicloInicial: CicloResumo): NavegacaoCiclos {
  const [janela, setJanela] = useState<VizinhosResposta>({ anterior: null, atual: cicloInicial, proximo: null, servidorEm: '' });

  const buscarVizinhos = useCallback(async (ano: number, mes: number): Promise<void> => {
    const resultado = await get<VizinhosResposta>(`/api/ciclos/vizinhos?ano=${ano}&mes=${mes}`);
    if (resultado.ok) setJanela(resultado.dados);
  }, []);

  // Completa a janela (anterior/próximo) ao montar — `cicloInicial` já veio
  // do servidor (SSR), só falta descobrir os vizinhos.
  useEffect(() => {
    void buscarVizinhos(cicloInicial.ano, cicloInicial.mes);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem, `cicloInicial` é fixo por natureza (vem de props do servidor).
  }, []);

  function irParaAnterior(): void {
    const alvo = janela.anterior;
    if (!alvo) return;
    // Troca imediata, a partir do que já está em memória — sem tela de carregando.
    setJanela((atual) => ({ anterior: null, atual: alvo, proximo: atual.atual, servidorEm: atual.servidorEm }));
    void buscarVizinhos(alvo.ano, alvo.mes);
  }

  function irParaProximo(): void {
    const alvo = janela.proximo;
    if (!alvo) return;
    setJanela((atual) => ({ anterior: atual.atual, atual: alvo, proximo: null, servidorEm: atual.servidorEm }));
    void buscarVizinhos(alvo.ano, alvo.mes);
  }

  return {
    atual: janela.atual ?? cicloInicial,
    anterior: janela.anterior,
    proximo: janela.proximo,
    irParaAnterior,
    irParaProximo,
  };
}
