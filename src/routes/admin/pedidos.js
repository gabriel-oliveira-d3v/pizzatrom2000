// ============================================================
//  Pedidos na área restrita: listar, confirmar (status),
//  responder/enviar e-mail e excluir.
// ============================================================
const express = require('express');
const db = require('../../db/database');
const { requireAuth, requirePermissao } = require('../../middleware/auth');
const { enviarEmail, confirmacaoPedido } = require('../../services/email');

const router = express.Router();
router.use(requireAuth, requirePermissao('gerenciar_pedidos'));

const STATUS = ['pendente', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue', 'cancelado'];

// GET /api/admin/pedidos?status=
router.get('/', async (req, res) => {
  const filtro = req.query.status;
  const params = [];
  let where = '';
  if (filtro && STATUS.includes(filtro)) {
    where = 'WHERE p.status = ?';
    params.push(filtro);
  }
  const pedidos = await db.prepare(`
    SELECT p.id_pedido, p.data_hora, p.status, p.tipo_entrega, p.observacao,
           c.nome AS cliente_nome, c.email AS cliente_email, c.telefone AS cliente_telefone,
           c.endereco AS cliente_endereco, a.nome AS admin_nome,
           COALESCE(SUM(i.quantidade * pz.preco), 0)::numeric AS total
    FROM pedido p
    JOIN cliente c ON c.id_cliente = p.id_cliente
    LEFT JOIN admin a ON a.id_admin = p.id_admin
    LEFT JOIN item_pedido i ON i.id_pedido = p.id_pedido
    LEFT JOIN pizza pz      ON pz.id_pizza = i.id_pizza
    ${where}
    GROUP BY p.id_pedido, c.nome, c.email, c.telefone, c.endereco, a.nome
    ORDER BY p.data_hora DESC
  `).all(...params);

  res.json(pedidos.map((p) => ({ ...p, total: Number(p.total) })));
});

// GET /api/admin/pedidos/:id
router.get('/:id', async (req, res) => {
  const pedido = await db.prepare(`
    SELECT p.*, c.nome AS cliente_nome, c.email AS cliente_email, c.telefone AS cliente_telefone,
           c.endereco AS cliente_endereco, a.nome AS admin_nome
    FROM pedido p
    JOIN cliente c ON c.id_cliente = p.id_cliente
    LEFT JOIN admin a ON a.id_admin = p.id_admin
    WHERE p.id_pedido = ?
  `).get(Number(req.params.id));
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

  pedido.itens = await db.prepare(`
    SELECT i.*, pz.nome AS pizza_nome, pz.tamanho, pz.preco
    FROM item_pedido i JOIN pizza pz ON pz.id_pizza = i.id_pizza
    WHERE i.id_pedido = ? ORDER BY i.id_item
  `).all(pedido.id_pedido);
  pedido.total = pedido.itens.reduce((s, i) => s + Number(i.preco) * i.quantidade, 0);
  res.json(pedido);
});

// PUT /api/admin/pedidos/:id  { status, enviar_email }
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!STATUS.includes(status)) {
    return res.status(400).json({ erro: `Status inválido. Use: ${STATUS.join(', ')}` });
  }

  const atual = await db.prepare('SELECT id_pedido, status FROM pedido WHERE id_pedido = ?').get(id);
  if (!atual) return res.status(404).json({ erro: 'Pedido não encontrado.' });

  await db.prepare('UPDATE pedido SET status = ?, id_admin = ? WHERE id_pedido = ?')
    .run(status, req.admin.id_admin, id);

  // "enviar e-mail" junto com a confirmação do pedido
  let email = { enviado: false, motivo: 'não solicitado' };
  if (req.body?.enviar_email && atual.status === 'pendente') {
    const dados = await db.prepare(`
      SELECT c.nome, c.email, COALESCE(SUM(i.quantidade * pz.preco), 0)::numeric AS total
      FROM pedido p
      JOIN cliente c ON c.id_cliente = p.id_cliente
      LEFT JOIN item_pedido i ON i.id_pedido = p.id_pedido
      LEFT JOIN pizza pz      ON pz.id_pizza = i.id_pizza
      WHERE p.id_pedido = ? GROUP BY c.nome, c.email
    `).get(id);

    email = await enviarEmail({
      ...confirmacaoPedido({ nomeCliente: dados.nome, idPedido: id, total: Number(dados.total) }),
      para: dados.email,
    });
  }

  res.json({ mensagem: 'Status atualizado!', status, email });
});

// DELETE /api/admin/pedidos/:id
router.delete('/:id', async (req, res) => {
  const r = await db.prepare('DELETE FROM pedido WHERE id_pedido = ?').run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  res.json({ mensagem: 'Pedido excluído!' });
});

module.exports = router;
module.exports.STATUS = STATUS;
