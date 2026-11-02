/**
 * The approved text of /termos and /privacidade — ONE copy for both products
 * (Revalida + ClinAct share these pages). The live text is the
 * `editable_pages` row (admins edit it inline); this is what
 * schema-patch-legal-clinact.sql wrote there and what the page renders when the
 * row is missing (mock mode / pre-patch). A test keeps the patch and this file
 * byte-identical.
 *
 * Karina 2026-11-02 approved the ClinAct additions with her own wording for:
 * the 7-day guarantee (INITIAL purchase only, never restarted on a renewal),
 * cancellation without proportional refund "ressalvadas as hipóteses previstas
 * em lei", renewal + promotional prices, failed charges WITHOUT the PagBank
 * retry days (an operational rule that may change), and payment data
 * ("processados pelo PagBank", no claim about browser encryption).
 */

const MAIL = '<a href="mailto:contato@medhelpspace.com.br">contato@medhelpspace.com.br</a>';

export const TERMOS_HTML = [
  '<p class="text-sm text-muted-foreground">Última atualização: novembro de 2026</p>',
  "<p>Ao utilizar a plataforma MedHelpSpace, você concorda com os termos descritos neste documento. Leia com atenção antes de criar sua conta.</p>",
  "<h2>1. Uso da plataforma</h2>",
  "<p>A plataforma é destinada a médicos e estudantes de medicina e reúne dois produtos, contratados separadamente: a preparação para o exame Revalida e o MedHelpSpace ClinAct, descrito no item 5. O acesso é pessoal e intransferível.</p>",
  "<h2>2. Propriedade intelectual</h2>",
  "<p>Todo o conteúdo disponível na plataforma — textos, questões, flashcards, casos clínicos, áudios, vídeos e imagens — é de propriedade exclusiva do MedHelpSpace e protegido por lei. É proibida a reprodução ou distribuição sem autorização prévia.</p>",
  "<h2>3. Responsabilidades</h2>",
  "<p>O usuário é responsável pela segurança de suas credenciais de acesso e pelo uso adequado da plataforma. O MedHelpSpace não se responsabiliza por resultados em provas ou concursos.</p>",
  "<h2>4. Garantia de 7 dias e cancelamento</h2>",
  `<p><strong>Garantia de 7 dias:</strong> na contratação inicial realizada pela página, o cliente pode desistir em até 7 dias e solicitar o reembolso integral do valor pago pelo e-mail ${MAIL} ou pelo WhatsApp.</p>`,
  "<p>O acesso pode ser cancelado a qualquer momento pelo usuário. Após o prazo de 7 dias aplicável à contratação inicial, o cancelamento interrompe as cobranças futuras e o acesso permanece disponível até o fim do período já pago, sem reembolso proporcional, ressalvadas as hipóteses previstas em lei.</p>",
  "<h2>5. MedHelpSpace ClinAct</h2>",
  "<p>O MedHelpSpace ClinAct é um serviço de treino de raciocínio clínico, contratado separadamente da preparação para o Revalida, destinado a estudantes de Medicina e médicos. O conteúdo tem finalidade educacional e não substitui o julgamento clínico nem a orientação profissional no atendimento real.</p>",
  "<p><strong>Planos e renovação:</strong> os planos são mensal e anual, cobrados no cartão de crédito por meio do PagBank. A assinatura é renovada automaticamente ao final de cada período, conforme o preço e as condições de renovação informados no momento da contratação. Quando houver condição promocional temporária, o valor e a duração da promoção, bem como o valor aplicável após seu término, serão informados antes da contratação.</p>",
  "<p><strong>Cancelamento:</strong> a assinatura pode ser cancelada a qualquer momento em Minha assinatura, nas condições do item 4.</p>",
  "<p><strong>Falha na cobrança:</strong> caso a cobrança da renovação não seja aprovada, poderão ocorrer novas tentativas de cobrança. Se o pagamento não for regularizado, a assinatura poderá ser suspensa até a atualização da forma de pagamento.</p>",
  "<p><strong>Casos gratuitos:</strong> os casos gratuitos exigem cadastro na plataforma.</p>",
  "<h2>6. Alterações</h2>",
  "<p>Estes termos podem ser atualizados periodicamente. O uso continuado da plataforma após a publicação de alterações constitui aceite dos novos termos.</p>",
  `<p>Dúvidas? Entre em contato em ${MAIL}</p>`,
].join("");

export const PRIVACIDADE_HTML = [
  '<p class="text-sm text-muted-foreground">Última atualização: novembro de 2026</p>',
  "<p>Esta política descreve como o MedHelpSpace coleta, usa e protege as informações dos usuários da plataforma.</p>",
  "<h2>1. Dados coletados</h2>",
  "<p>Coletamos nome, endereço de e-mail e dados de uso da plataforma (progresso em questões, flashcards e aulas). Não coletamos dados sensíveis de saúde.</p>",
  "<p>Na compra, coletamos também os dados necessários para o pagamento e para a emissão da nota fiscal de serviço (NFS-e): nome, CPF ou CNPJ, endereço e os dados de quem recebe a nota (tomador).</p>",
  "<p>No MedHelpSpace ClinAct, registramos as respostas, o nível de confiança, o tempo de cada decisão e os demais dados de uso dos casos, utilizados para gerar Minha Evolução e as revisões programadas.</p>",
  "<h2>2. Uso das informações</h2>",
  "<p>Os dados são utilizados para fornecer e melhorar o serviço, personalizar a experiência de aprendizado, processar pagamentos, emitir notas fiscais e enviar comunicações relacionadas à conta.</p>",
  "<h2>3. Compartilhamento</h2>",
  "<p>Não vendemos nem compartilhamos seus dados pessoais com terceiros, exceto quando exigido por lei ou para operar serviços essenciais da plataforma: o PagBank, para o processamento do pagamento, e o Emissor Nacional da NFS-e, para a emissão da nota fiscal.</p>",
  "<p>Os dados de pagamento são processados pelo PagBank. A MedHelpSpace não armazena o número completo do cartão nem o código de segurança.</p>",
  "<h2>4. Segurança</h2>",
  "<p>Utilizamos criptografia e boas práticas de segurança para proteger suas informações. O acesso aos dados é restrito à equipe autorizada.</p>",
  "<h2>5. Seus direitos (LGPD)</h2>",
  "<p>Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento.</p>",
  "<h2>6. Cookies</h2>",
  "<p>Utilizamos cookies técnicos necessários para o funcionamento da plataforma, como manutenção de sessão. Não utilizamos cookies de rastreamento para publicidade.</p>",
  "<h2>7. Comunicações pelo WhatsApp</h2>",
  "<p>Ao deixar seu e-mail em uma de nossas páginas gratuitas, você pode, opcionalmente, informar o seu número de WhatsApp e autorizar o recebimento de mensagens da MedHelpSpace com materiais e conteúdos educacionais, novidades, ofertas, descontos e cupons. O número só é coletado com o seu consentimento expresso, registrado com data, hora e a versão do texto aceito, e é usado exclusivamente para essas comunicações. Não compartilhamos o seu número com terceiros.</p>",
  `<p>Você pode cancelar a qualquer momento: basta responder <strong>SAIR</strong> a qualquer mensagem, fazer qualquer pedido claro nesse sentido pelo próprio WhatsApp, ou escrever para ${MAIL}. Registramos a revogação e deixamos de enviar mensagens.</p>`,
  `<p>Para exercer seus direitos ou tirar dúvidas, entre em contato em ${MAIL}</p>`,
].join("");
