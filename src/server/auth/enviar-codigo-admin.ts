/**
 * Emite e envia o código de login do admin com as implementações reais
 * (Upstash Redis + Evolution API). Compartilhado pela rota de login e pela
 * de reenvio. Falha de envio vira `WHATSAPP_INDISPONIVEL` (503) com o
 * detalhe técnico só no log do servidor.
 */
import { env } from '@/env';
import { erroWhatsappIndisponivel } from '@/server/http/erros';
import { enviadorEvolution } from '@/server/integracoes/evolution';
import { emitirCodigo, verificarCodigo, type ResultadoVerificacao } from './codigo-whatsapp';
import { armazemCodigoRedis } from './codigo-whatsapp-redis';

export async function enviarCodigoAdmin(params: { userId: string; sessionId: string; whatsapp: string }): Promise<void> {
  try {
    await emitirCodigo({ armazem: armazemCodigoRedis, enviador: enviadorEvolution, segredo: env.SESSION_SECRET }, params);
  } catch (erro) {
    // eslint-disable-next-line no-console
    console.error('[admin-2fa] falha ao enviar código pelo WhatsApp:', erro instanceof Error ? erro.message : erro);
    throw erroWhatsappIndisponivel(erro);
  }
}

export function verificarCodigoAdmin(params: { userId: string; sessionId: string; codigo: string }): Promise<ResultadoVerificacao> {
  return verificarCodigo({ armazem: armazemCodigoRedis, segredo: env.SESSION_SECRET }, params);
}
