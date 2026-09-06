import type { Metadata } from 'next';
import { DocumentoLegal, Secao, Aviso } from '@/components/legal/DocumentoLegal';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Como o Extrinha coleta, usa e protege os dados pessoais de colaboradores e administradores.',
};

/**
 * Conteúdo alinhado ao que o sistema de fato faz — ver `prisma/schema.prisma`
 * (modelos `Colaborador`, `SessaoColaborador`, `TentativaLogin`, `AuditLog`,
 * `Notificacao`, `PushSubscription`, `GoogleCalendarConta`) e
 * `specs/02-seguranca/confidencialidade.md` (SEC-CONF: classificação de
 * dados, retenção, base legal). Sem CNPJ/razão social — as unidades RT1/RT2
 * não operam sob pessoa jurídica formal registrada neste sistema; a
 * identificação do controlador fica no nível da administração das unidades.
 * Contato de suporte: contato@wamanadev.com.br / (11) 99000-5014.
 */
export default function PoliticaPrivacidadePage(): JSX.Element {
  return (
    <DocumentoLegal titulo="Política de Privacidade" atualizadoEm="5 de setembro de 2026">
      <Aviso>
        Este texto descreve o tratamento de dados como o sistema Extrinha realmente funciona hoje — qualquer
        mudança no código (novo dado coletado, nova integração) precisa se refletir aqui.
      </Aviso>

      <Secao id="quem-somos" titulo="1. Quem trata os seus dados">
        <p>
          O Extrinha é o sistema interno de escala e plantões extras usado pelas unidades residenciais RT1 e RT2
          (&ldquo;nós&rdquo;). A administração das unidades é a controladora dos dados pessoais tratados neste
          sistema, nos termos da Lei nº 13.709/2018 (LGPD).
        </p>
        <p>
          Esta política se aplica a colaboradores das duas unidades (acesso por matrícula + PIN) e a
          administradores (acesso por e-mail, senha e autenticação de dois fatores).
        </p>
      </Secao>

      <Secao id="dados-coletados" titulo="2. Quais dados tratamos">
        <p>Só coletamos o que o sistema precisa para funcionar. Nada de campo &ldquo;pra garantir&rdquo;.</p>

        <p className="font-medium text-slate-900">De colaboradores:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Nome e matrícula (fornecidos pelo RH/administração, não pelo próprio colaborador)</li>
          <li>Unidade (RT1/RT2), turno padrão e âncora da escala 12x36</li>
          <li>
            PIN de acesso — nunca armazenado em texto puro, só o hash (argon2id); nem nós conseguimos ver o PIN de
            alguém
          </li>
          <li>Marcações e cancelamentos de plantão extra, com data/hora</li>
          <li>
            Motivo de ausência, quando registrado por um administrador — tratado como dado restrito porque
            costuma envolver informação de saúde (dado sensível, art. 5º, II da LGPD)
          </li>
          <li>Registros de tentativa de login (matrícula, sucesso/falha, IP, navegador) e de sessão ativa</li>
          <li>Notificações internas enviadas a você e, se ativado por você, endpoint de notificação push do navegador</li>
          <li>
            Se você conectar sua conta Google para sincronizar a escala na sua agenda pessoal: um token de
            atualização, guardado cifrado (nunca em texto puro) e usado só para criar/atualizar eventos na sua
            agenda
          </li>
        </ul>

        <p className="font-medium text-slate-900">De administradores:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Nome e e-mail</li>
          <li>Senha (gerenciada pelo provedor de autenticação, nunca visível a nós) e fator de autenticação MFA</li>
        </ul>

        <p className="font-medium text-slate-900">De todo mundo, automaticamente:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Registro de auditoria de ações relevantes (quem fez o quê, quando, de qual IP)</li>
        </ul>
      </Secao>

      <Secao id="finalidade" titulo="3. Para que usamos cada dado e com base em quê">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Calcular e exibir sua escala, gerenciar plantões extras e ausências</strong> — execução do
            contrato de trabalho (LGPD, art. 7º, V).
          </li>
          <li>
            <strong>Autenticar você e manter o registro de quem marcou o quê</strong> — execução do contrato de
            trabalho e cumprimento de obrigação legal/regulatória trabalhista (art. 7º, V e II).
          </li>
          <li>
            <strong>Registrar tentativas de login e manter a trilha de auditoria</strong> — legítimo interesse em
            prevenir fraude e uso indevido de credenciais (art. 7º, IX), sempre limitado ao necessário para esse
            fim.
          </li>
          <li>
            <strong>Notificações push e sincronização com Google Calendar</strong> — consentimento (art. 7º, I):
            recursos opcionais, desligados por padrão, que só ficam ativos se você mesmo ativar, e que você pode
            desativar a qualquer momento.
          </li>
        </ul>
      </Secao>

      <Secao id="compartilhamento" titulo="4. Com quem compartilhamos">
        <p>Não vendemos dados pessoais e não os usamos para publicidade. Compartilhamos apenas com:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Provedores de infraestrutura que hospedam o banco de dados e a aplicação (operadores, nos termos da LGPD, sob contrato)</li>
          <li>O Google, exclusivamente se você conectar sua conta para sincronizar a escala com sua agenda pessoal</li>
          <li>Autoridades, quando exigido por lei ou ordem judicial</li>
        </ul>
        <p>Não usamos ferramentas de analytics ou rastreamento de terceiros — não há telemetria de comportamento neste sistema.</p>
      </Secao>

      <Secao id="retencao" titulo="5. Por quanto tempo guardamos cada dado">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="py-2 pr-4 font-semibold text-slate-900">Dado</th>
                <th className="py-2 pr-4 font-semibold text-slate-900">Retenção</th>
                <th className="py-2 font-semibold text-slate-900">Depois</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2 pr-4">Tentativas de login</td>
                <td className="py-2 pr-4">90 dias</td>
                <td className="py-2">Apagadas</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Sessão expirada</td>
                <td className="py-2 pr-4">30 dias</td>
                <td className="py-2">Apagada</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Registro de auditoria</td>
                <td className="py-2 pr-4">5 anos</td>
                <td className="py-2">Anonimizado</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Escala e marcações</td>
                <td className="py-2 pr-4">5 anos</td>
                <td className="py-2">Arquivado</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Dados de colaborador desligado</td>
                <td className="py-2 pr-4">5 anos após o desligamento</td>
                <td className="py-2">PIN apagado, nome pseudonimizado</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Esses prazos existem porque a legislação trabalhista brasileira exige guarda de registros por até 5
          anos — não é uma escolha arbitrária do sistema.
        </p>
      </Secao>

      <Secao id="seguranca" titulo="6. Como protegemos seus dados">
        <ul className="list-disc space-y-1 pl-5">
          <li>PIN e senhas nunca são armazenados em texto puro, só como hash</li>
          <li>Tokens de sessão são armazenados apenas como hash; o valor real fica só no seu navegador, em cookie protegido</li>
          <li>Conexão sempre criptografada (TLS/HTTPS)</li>
          <li>Controle de acesso por linha no banco de dados: um colaborador nunca consegue ler dados de outro por falha de permissão</li>
          <li>PIN e senha nunca aparecem em URL, em log ou em mensagem de erro</li>
          <li>Token de sincronização com Google Calendar é armazenado cifrado, não apenas com hash (precisa ser reversível para funcionar, mas nunca fica em texto puro)</li>
        </ul>
      </Secao>

      <Secao id="direitos" titulo="7. Seus direitos como titular dos dados">
        <p>Nos termos do art. 18 da LGPD, você pode solicitar, a qualquer momento:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Confirmação de que tratamos seus dados e acesso a eles</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados</li>
          <li>Portabilidade dos seus dados a outro fornecedor, mediante requisição expressa</li>
          <li>Informação sobre com quem compartilhamos seus dados</li>
          <li>Revogação do consentimento dado para notificações push ou sincronização com Google Calendar, a qualquer momento, direto nas configurações do sistema</li>
          <li>Eliminação dos dados tratados com base em consentimento</li>
        </ul>
        <p>
          <strong>Sobre o direito ao esquecimento:</strong> ele é limitado pela nossa obrigação legal de manter
          registros trabalhistas por 5 anos após o desligamento. Isso significa que, mesmo mediante solicitação,
          não podemos apagar imediatamente todos os dados de um colaborador desligado — mas apagamos o que a lei
          não exige guardar (como o PIN) e pseudonimizamos o restante.
        </p>
        <p>
          Para exercer qualquer um desses direitos, entre em contato com{' '}
          <strong>contato@wamanadev.com.br</strong> ou <strong>(11) 99000-5014</strong>, ou peça a um
          administrador do sistema para gerar a exportação dos seus dados.
        </p>
      </Secao>

      <Secao id="cookies" titulo="8. Cookies">
        <p>
          Usamos apenas um cookie estritamente necessário: o de sessão, que identifica que você está autenticado.
          Ele é protegido (<code>httpOnly</code>, <code>Secure</code>) e não pode ser lido por scripts no
          navegador. Não usamos cookies de rastreamento, publicidade ou analytics de terceiros.
        </p>
      </Secao>

      <Secao id="alteracoes" titulo="9. Alterações desta política">
        <p>
          Podemos atualizar esta política quando o sistema mudar de forma relevante para o tratamento de dados. A
          data no topo da página sempre indica a versão vigente.
        </p>
      </Secao>

      <Secao id="contato" titulo="10. Contato">
        <p>
          Dúvidas, solicitações ou reclamações sobre o tratamento de dados pessoais neste sistema:{' '}
          <strong>contato@wamanadev.com.br</strong> · <strong>(11) 99000-5014</strong>.
        </p>
      </Secao>
    </DocumentoLegal>
  );
}
