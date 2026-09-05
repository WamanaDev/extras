'use client';

import { useCallback, useEffect, useState } from 'react';
import { get, getLista, type ListaApi } from './client';

export interface RecursoApi<T> {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
  setDados: (atualizador: (atual: T | null) => T | null) => void;
}

/**
 * Hook mínimo de leitura para as páginas de `/admin/*` — cada tela de
 * `06-frontend/paginas.md` precisa dos três estados (carregando/vazio/erro,
 * FE-001.2) e nenhuma decide texto de erro por conta própria (FE-001.3, usa
 * `resultado.erro.mensagem`). Extraído para não repetir o mesmo `useEffect`
 * em uma dúzia de páginas — não é regra de negócio, só reduz boilerplate.
 */
export function useRecursoApi<T>(caminho: string | null): RecursoApi<T> {
  const [dados, setDadosState] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(caminho !== null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    if (!caminho) {
      setCarregando(false);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    get<T>(caminho).then((resultado) => {
      if (cancelado) return;
      if (resultado.ok) setDadosState(resultado.dados);
      else setErro(resultado.erro.mensagem);
      setCarregando(false);
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `versao` só existe para disparar refetch manual.
  }, [caminho, versao]);

  const setDados = useCallback((atualizador: (atual: T | null) => T | null) => {
    setDadosState(atualizador);
  }, []);

  return { dados, carregando, erro, recarregar, setDados };
}

/**
 * Igual a `useRecursoApi`, mas para rota paginada (`getLista` — ver
 * `client.ts` para o porquê o corpo na rede não é `{itens,total}` direto).
 */
export function useListaApi<T>(caminho: string | null): RecursoApi<ListaApi<T>> {
  const [dados, setDadosState] = useState<ListaApi<T> | null>(null);
  const [carregando, setCarregando] = useState(caminho !== null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    if (!caminho) {
      setCarregando(false);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    getLista<T>(caminho).then((resultado) => {
      if (cancelado) return;
      if (resultado.ok) setDadosState(resultado.dados);
      else setErro(resultado.erro.mensagem);
      setCarregando(false);
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `versao` só existe para disparar refetch manual.
  }, [caminho, versao]);

  const setDados = useCallback((atualizador: (atual: ListaApi<T> | null) => ListaApi<T> | null) => {
    setDadosState(atualizador);
  }, []);

  return { dados, carregando, erro, recarregar, setDados };
}
