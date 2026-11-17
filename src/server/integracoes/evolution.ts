/**
 * Envio de mensagem de texto pelo WhatsApp via Evolution API (instância
 * própria do usuário) — usado pelo segundo fator do login de admin
 * (`src/server/auth/segundo-fator.ts`). `fetch` direto, sem SDK, mesmo
 * espírito de `google-calendar.ts`.
 *
 * Endpoint da Evolution API v2: `POST {url}/message/sendText/{instância}`,
 * header `apikey`, corpo `{ number, text }`.
 *
 * Sem as três variáveis (`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`,
 * `EVOLUTION_INSTANCE`), o boot não quebra, mas nenhum admin consegue
 * concluir o login — exceto em `development`, onde o código vai pro console
 * do servidor para dar para testar localmente sem WhatsApp.
 */
import { env } from '@/env';
import type { EnviadorWhatsapp } from '@/server/auth/codigo-whatsapp';

export class ErroEnvioWhatsapp extends Error {}

export function evolutionConfigurada(): boolean {
  return Boolean(env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY && env.EVOLUTION_INSTANCE);
}

export const enviadorEvolution: EnviadorWhatsapp = {
  async enviarTexto(numero, texto) {
    if (!evolutionConfigurada()) {
      if (env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn(`[evolution] não configurada — mensagem para ${numero} (só em dev):\n${texto}`);
        return;
      }
      throw new ErroEnvioWhatsapp('Evolution API não configurada (EVOLUTION_API_URL/EVOLUTION_API_KEY/EVOLUTION_INSTANCE).');
    }

    const base = env.EVOLUTION_API_URL!.replace(/\/+$/, '');
    let resposta: Response;
    try {
      resposta = await fetch(`${base}/message/sendText/${encodeURIComponent(env.EVOLUTION_INSTANCE!)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: env.EVOLUTION_API_KEY! },
        body: JSON.stringify({ number: numero, text: texto }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (erro) {
      throw new ErroEnvioWhatsapp(`Falha de rede ao chamar a Evolution API: ${erro instanceof Error ? erro.message : String(erro)}`);
    }

    if (!resposta.ok) {
      // Corpo da resposta pode citar o número — vai só pro log interno (causaOriginal), nunca pra resposta HTTP.
      const corpo = await resposta.text().catch(() => '');
      throw new ErroEnvioWhatsapp(`Evolution API respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
    }
  },
};
