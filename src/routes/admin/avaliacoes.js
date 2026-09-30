// ============================================================
//  Requisito 11: listar as interações dos clientes e agir sobre
//  elas -> responder avaliação, enviar e-mail, confirmar pedido
//  e excluir.
// ============================================================
const express = require('express');
const db = require('../../db/database');
const { requireAuth, requirePermissao } = require('../../middleware/auth');
const { enviarEmail, respostaAvaliacao } = require('../../services/email');

const router = express.Router();
router.use(requireAuth, requirePermissao('gerenciar_avaliacoes'));

// GET /api/admin/avaliacoes?respondidas=1
router.get('/', async (req, res) => {
  const filtroRespondidas = req.query.respondidas === '1';
  const avaliacoes = await db.prepare(`
    SELECT a.id_avaliacao, a.nota, a.comentario, a.data, a.resposta, a.resposta_em,
           pz.id_pizza, pz.nome AS pizza_nome,
           c.id_cliente, c.nome AS cliente_nome, c.email AS cliente_email,
           ad.nome AS admin_nome
    FROM avaliacao a
    JOIN pizza pz   ON pz.id_pizza = a.id_pizza
    JOIN cliente c  ON c.id_cliente = a.id_cliente
    LEFT JOIN admin ad ON ad.id_admin = a.id_admin_resposta
    ${filtroRespondidas ? 'WHERE a.resposta IS NOT NULL' : ''}
    ORDER BY a.data DESC
  `).all();
  res.json(avaliacoes);
});

// PUT /api/admin/avaliacoes/:id  { resposta, enviar_email: true }
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const resposta = String(req.body?.resposta ?? '').trim().slice(0, 800);

  const aval = await db.prepare(`
    SELECT a.id_avaliacao, a.nota, pz.nome AS pizza_nome, c.nome AS cliente_nome, c.email AS cliente_email
    FROM avaliacao a
    JOIN pizza pz  ON pz.id_pizza = a.id_pizza
    JOIN cliente c ON c.id_cliente = a.id_cliente
    WHERE a.id_avaliacao = ?
  `).get(id);
  if (!aval) return res.status(404).json({ erro: 'Avaliação não encontrada.' });

  if (resposta) {
    await db.prepare('UPDATE avaliacao SET resposta = ?, resposta_em = now(), id_admin_resposta = ? WHERE id_avaliacao = ?')
      .run(resposta, req.admin.id_admin, id);
  } else {
    await db.prepare('UPDATE avaliacao SET resposta = NULL, resposta_em = NULL, id_admin_resposta = NULL WHERE id_avaliacao = ?')
      .run(id);
  }

  // envio opcional de e-mail ao cliente
  let email = { enviado: false, motivo: 'não solicitado' };
  if (req.body?.enviar_email && resposta) {
    const modelo = respostaAvaliacao({
      nomeCliente: aval.cliente_nome,
      nomePizza: aval.pizza_nome,
      nota: aval.nota,
      resposta,
    });
    email = await enviarEmail({ ...modelo, para: aval.cliente_email });
  }

  res.json({ mensagem: resposta ? 'Resposta salva!' : 'Resposta removida.', email });
});

// DELETE /api/admin/avaliacoes/:id
router.delete('/:id', async (req, res) => {
  const r = await db.prepare('DELETE FROM avaliacao WHERE id_avaliacao = ?').run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ erro: 'Avaliação não encontrada.' });
  res.json({ mensagem: 'Avaliação excluída!' });
});

module.exports = router;
