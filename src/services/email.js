// ============================================================
//  Envio de e-mail (requisito 11) via Resend - API REST, sem SDK.
//  Sem RESEND_API_KEY o envio é ignorado e a resposta da loja
//  continua salva no banco (o sistema não quebra).
// ============================================================
const CHAVE = () => (process.env.RESEND_API_KEY || '').trim();
const REMETENTE = () => (process.env.EMAIL_REMETENTE || 'onboarding@resend.dev').trim();

const EMAIL_DISPONIVEL = () => Boolean(CHAVE());

async function enviarEmail({ para, assunto, texto }) {
  if (!EMAIL_DISPONIVEL()) {
    return { enviado: false, motivo: 'RESEND_API_KEY não configurada (envio ignorado).' };
  }
  if (!para) return { enviado: false, motivo: 'Destinatário sem e-mail.' };

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CHAVE()}` },
    body: JSON.stringify({ from: REMETENTE(), to: [para], subject: assunto, text: texto }),
  });

  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    const motivo = String(dados?.message || '');
    // No modo de teste (sem domínio verificado) a Resend só entrega para o
    // e-mail do dono da chave e rejeita domínios de exemplo. Esse é o motivo
    // mais comum de recusa, então vale explicar em vez de despejar a API.
    const modoTeste = /testing emails? to your own email address|use our testing email address/i.test(motivo);
    return {
      enviado: false,
      motivo: modoTeste
        ? 'O remetente de teste da Resend só entrega para o e-mail do dono da chave '
          + 'e não aceita endereços @example.com. Para enviar a clientes reais, '
          + 'verifique um domínio em resend.com/domains e troque EMAIL_REMETENTE.'
        : `Resend ${r.status}: ${motivo.slice(0, 200) || 'falha no envio.'}`,
    };
  }
  return { enviado: true, id: dados?.id };
}

// ---------- Modelos usados pelo painel administrativo ----------
function respostaAvaliacao({ nomeCliente, nomePizza, nota, resposta }) {
  return {
    para: null, // preenchido pela rota (usa o e-mail do cliente)
    assunto: `PizzaTrom2000: resposta à sua avaliação de ${nomePizza} 🍕`,
    texto: [
      `Olá, ${nomeCliente}!`,
      '',
      `Recebemos sua avaliação de ${nomePizza} (nota ${nota}/5).`,
      '',
      `Resposta da equipe:`,
      resposta,
      '',
      'Obrigado por nos ajudar a melhorar!',
      '— Equipe PizzaTrom2000',
    ].join('\n'),
  };
}

function confirmacaoPedido({ nomeCliente, idPedido, total }) {
  return {
    para: null,
    assunto: `PizzaTrom2000: pedido #${idPedido} confirmado! 🍕`,
    texto: [
      `Olá, ${nomeCliente}!`,
      '',
      `Seu pedido #${idPedido} foi confirmado e já entrou na nossa fila.`,
      `Total: R$ ${Number(total).toFixed(2)}`,
      '',
      'Vamos preparar tudo com carinho. Você pode acompanhar o status em "Minhas interações".',
      '— Equipe PizzaTrom2000',
    ].join('\n'),
  };
}

module.exports = { enviarEmail, respostaAvaliacao, confirmacaoPedido, EMAIL_DISPONIVEL };
