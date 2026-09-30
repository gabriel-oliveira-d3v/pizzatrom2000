// ============================================================
//  "Minhas interações" - o cliente logado vê seus pedidos,
//  suas avaliações e as respostas da loja.
//  Requisito 7.
// ============================================================
const express = require('express');
const db = require('../../db/database');
const { requireCliente } = require('../../middleware/auth');

const router = express.Router();

// GET /api/cliente/interacoes
router.get('/interacoes', requireCliente, async (req, res) => {
  const id = req.cliente.id_cliente;

  const pedidos = await db.prepare(`
    SELECT p.id_pedido, p.data_hora, p.status, p.tipo_entrega, p.observacao,
           COUNT(i.id_item) AS qtd_itens,
           COALESCE(SUM(i.quantidade * pz.preco), 0) AS total
    FROM pedido p
    LEFT JOIN item_pedido i ON i.id_pedido = p.id_pedido
    LEFT JOIN pizza pz       ON pz.id_pizza = i.id_pizza
    WHERE p.id_cliente = ?
    GROUP BY p.id_pedido
    ORDER BY p.data_hora DESC
  `).all(id);

  // itens de cada pedido
  for (const pedido of pedidos) {
    pedido.itens = await db.prepare(`
      SELECT i.quantidade, i.observacoes, pz.nome, pz.tamanho, pz.preco
      FROM item_pedido i JOIN pizza pz ON pz.id_pizza = i.id_pizza
      WHERE i.id_pedido = ? ORDER BY i.id_item
    `).all(pedido.id_pedido);
    pedido.total = Number(pedido.total);
  }

  const avaliacoes = await db.prepare(`
    SELECT a.id_avaliacao, a.nota, a.comentario, a.data, a.resposta, a.resposta_em,
           pz.nome AS pizza_nome, pz.id_pizza,
           ad.nome AS admin_nome
    FROM avaliacao a
    JOIN pizza pz       ON pz.id_pizza = a.id_pizza
    LEFT JOIN admin ad  ON ad.id_admin = a.id_admin_resposta
    WHERE a.id_cliente = ?
    ORDER BY a.data DESC
  `).all(id);

  const resumo = await db.prepare(`
    SELECT
      (SELECT COUNT(*)::int FROM pedido WHERE id_cliente = $1)          AS total_pedidos,
      (SELECT COUNT(*)::int FROM avaliacao WHERE id_cliente = $1)       AS total_avaliacoes,
      (SELECT COALESCE(SUM(i.quantidade * pz.preco), 0) FROM pedido p
         JOIN item_pedido i ON i.id_pedido = p.id_pedido
         JOIN pizza pz ON pz.id_pizza = i.id_pizza
        WHERE p.id_cliente = $1 AND p.status <> 'cancelado')            AS total_gasto
  `).get(id);

  res.json({
    cliente: req.cliente,
    pedidos,
    avaliacoes,
    resumo: { ...resumo, total_gasto: Number(resumo.total_gasto) },
  });
});

module.exports = router;
