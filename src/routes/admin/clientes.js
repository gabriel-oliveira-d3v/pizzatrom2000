// ============================================================
//  Clientes cadastrados + resumo de atividade (área restrita)
// ============================================================
const express = require('express');
const db = require('../../db/database');
const { requireAuth, requirePermissao } = require('../../middleware/auth');

const router = express.Router();
router.use(requireAuth, requirePermissao('gerenciar_clientes'));

// GET /api/admin/clientes
router.get('/', async (req, res) => {
  const clientes = await db.prepare(`
    SELECT c.id_cliente, c.nome, c.email, c.telefone, c.endereco, c.criado_em,
           COUNT(DISTINCT p.id_pedido)::int    AS qtd_pedidos,
           COUNT(DISTINCT a.id_avaliacao)::int AS qtd_avaliacoes,
           COALESCE(SUM(x.total), 0)::numeric  AS total_gasto
    FROM cliente c
    LEFT JOIN pedido p     ON p.id_cliente = c.id_cliente
    LEFT JOIN avaliacao a  ON a.id_cliente = c.id_cliente
    LEFT JOIN LATERAL (
      SELECT SUM(i.quantidade * pz.preco) AS total
      FROM pedido p2
      JOIN item_pedido i ON i.id_pedido = p2.id_pedido
      JOIN pizza pz      ON pz.id_pizza = i.id_pizza
      WHERE p2.id_cliente = c.id_cliente AND p2.status <> 'cancelado'
    ) x ON TRUE
    GROUP BY c.id_cliente
    ORDER BY c.criado_em DESC
  `).all();
  res.json(clientes.map((c) => ({ ...c, total_gasto: Number(c.total_gasto) })));
});

// PUT /api/admin/clientes/:id
router.put('/:id', async (req, res) => {
  const nome = String(req.body?.nome ?? '').trim();
  const telefone = String(req.body?.telefone ?? '').trim() || null;
  const endereco = String(req.body?.endereco ?? '').trim() || null;
  if (nome.length < 3) return res.status(400).json({ erro: 'Informe o nome do cliente.' });

  const r = await db.prepare('UPDATE cliente SET nome = ?, telefone = ?, endereco = ? WHERE id_cliente = ?')
    .run(nome, telefone, endereco, req.params.id);
  if (!r.changes) return res.status(404).json({ erro: 'Cliente não encontrado.' });
  res.json({ mensagem: 'Cliente atualizado!' });
});

// DELETE /api/admin/clientes/:id
router.delete('/:id', async (req, res) => {
  const r = await db.prepare('DELETE FROM cliente WHERE id_cliente = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ erro: 'Cliente não encontrado.' });
  res.json({ mensagem: 'Cliente excluído (pedidos e avaliações foram removidos junto).' });
});

module.exports = router;
