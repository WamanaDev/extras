/**
 * Emissão e verificação do código de login do admin por WhatsApp — lógica
 * de negócio. Ver `./segundo-fator.ts` para o fluxo completo.
 *
 * Armazenamento e envio ficam atrás de portas (`ArmazemCodigo`,
 * `EnviadorWhatsapp`), mesmo padrão de `admin-login.ts`, para testar sem
 * Redis nem Evolution API. A implementação real usa o Upstash Redis que o
 * projeto já tem para rate limit — o código é efêmero (TTL de 10 min), não
 * precisa de tabela.
 */
import {
  MAX_TENTATIVAS_CODIGO,
  VALIDADE_CODIGO_SEGUNDOS,
  compararSeguro,
  gerarCodigo,
  hashCodigo,
} from './segundo-fator';

export interface RegistroCodigo {
  hash: string;
  /** Código só vale para a sessão do Supabase que o pediu. */
  sessionId: string;
  tentativas: number;
}

export interface ArmazemCodigo {
  salvar(userId: string, registro: RegistroCodigo, ttlSegundos: number): Promise<void>;
  obter(userId: string): Promise<RegistroCodigo | null>;
  /** Atualiza mantendo o TTL original. */
  atualizar(userId: string, registro: RegistroCodigo): Promise<void>;
  apagar(userId: string): Promise<void>;
}

export interface EnviadorWhatsapp {
  enviarTexto(numero: string, texto: string): Promise<void>;
}

export interface DependenciasCodigo {
  armazem: ArmazemCodigo;
  enviador: EnviadorWhatsapp;
  segredo: string;
  gerar?: () => string;
}

export function textoMensagemCodigo(codigo: string): string {
  const minutos = Math.round(VALIDADE_CODIGO_SEGUNDOS / 60);
  return `Seu código de acesso ao painel administrativo é *${codigo}*.\n\nVale por ${minutos} minutos. Se não foi você que tentou entrar, ignore esta mensagem e troque sua senha.`;
}

/** Gera um código novo (invalida o anterior, se houver) e envia pelo WhatsApp. */
export async function emitirCodigo(
  deps: DependenciasCodigo,
  params: { userId: string; sessionId: string; whatsapp: string },
): Promise<void> {
  const codigo = (deps.gerar ?? gerarCodigo)();
  await deps.armazem.salvar(
    params.userId,
    { hash: hashCodigo(deps.segredo, params.userId, codigo), sessionId: params.sessionId, tentativas: 0 },
    VALIDADE_CODIGO_SEGUNDOS,
  );
  try {
    await deps.enviador.enviarTexto(params.whatsapp, textoMensagemCodigo(codigo));
  } catch (erro) {
    // Código que não chegou não pode ficar valendo.
    await deps.armazem.apagar(params.userId);
    throw erro;
  }
}

export type ResultadoVerificacao = 'OK' | 'INVALIDO' | 'EXPIRADO' | 'TENTATIVAS_ESGOTADAS';

export async function verificarCodigo(
  deps: Pick<DependenciasCodigo, 'armazem' | 'segredo'>,
  params: { userId: string; sessionId: string; codigo: string },
): Promise<ResultadoVerificacao> {
  const registro = await deps.armazem.obter(params.userId);
  if (!registro || registro.sessionId !== params.sessionId) return 'EXPIRADO';

  const codigo = params.codigo.replace(/\D/g, '');
  if (compararSeguro(registro.hash, hashCodigo(deps.segredo, params.userId, codigo))) {
    await deps.armazem.apagar(params.userId); // uso único
    return 'OK';
  }

  const tentativas = registro.tentativas + 1;
  if (tentativas >= MAX_TENTATIVAS_CODIGO) {
    await deps.armazem.apagar(params.userId);
    return 'TENTATIVAS_ESGOTADAS';
  }
  await deps.armazem.atualizar(params.userId, { ...registro, tentativas });
  return 'INVALIDO';
}
