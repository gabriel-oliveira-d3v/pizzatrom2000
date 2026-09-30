// ============================================================
//  Pedido / reserva made pelo cliente.
//  Agora exige cliente logado (requisito 6: sem login, não
//  há interação sobre o item).
// ============================================================
const express = require('express');
const db = require('../db/database');
const { requireCliente } = require('../middleware/auth');

const router = express.Router();

const STATUS = ['pendente', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue', 'cancelado'];
const ENTREGA = ['delivery', 'retirada'];

// POST /api/pedidos  { tipo_entrega, observacao, itens:[{id_pizza, quantidade, observacoes}] }
router.post('/', requireCliente, async (req, res) => {
  const { tipo_entrega, observacao } = req.body || {};
  const itens = req.body?.itens;

  if (!ENTREGA.includes(tipo_entrega)) {
    return res.status(400).json({ erro: "tipo_entrega deve ser 'delivery' ou 'retirada'." });
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ erro: 'O pedido precisa de pelo menos 1 item.' });
  }
  for (const it of itens) {
    if (!Number.isInteger(it.id_pizza) || !Number.isInteger(it.quantidade) || it.quantidade < 1) {
      return res.status(400).json({ erro: 'Item inválido: id_pizza e quantidade (>= 1) são obrigatórios.' });
    }
  }

  // Se for delivery e o cliente ainda não tem endereço salvo, exige o campo
  let endereco = req.cliente.endereco;
  if (tipo_entrega === 'delivery') {
    endereco = String(req.body?.endereco ?? endereco ?? '').trim();
    if (!endereco) return res.status(400).json({ erro: 'Informe o endereço para entrega.' });
  }

  try {
    const resultado = await db.transaction(async (tx) => {
      const novoPedido = await tx.prepare(`
        INSERT INTO pedido (status, tipo_entrega, observacao, id_cliente)
        VALUES ('pendente', ?, ?, ?) RETURNING id_pedido
      `).run(tipo_entrega, String(observacao ?? '').trim() || null, req.cliente.id_cliente);

      const id_pedido = novoPedido.lastInsertRowid;
      const qPizza = tx.prepare('SELECT id_pizza, nome, preco FROM pizza WHERE id_pizza = ?');
      const insItem = tx.prepare(
        'INSERT INTO item_pedido (id_pedido, id_pizza, quantidade, observacoes) VALUES (?, ?, ?, ?)'
      );

      let total = 0;
      const resumo = [];
      for (const it of itens) {
        const pizza = await qPizza.get(it.id_pizza);
        if (!pizza) throw Object.assign(new Error(`Pizza ${it.id_pizza} não existe.`), { status: 400 });
        await insItem.run(id_pedido, it.id_pizza, it.quantidade, String(it.observacoes ?? '').trim() || null);
        total += Number(pizza.preco) * it.quantidade;
        resumo.push({ nome: pizza.nome, quantidade: it.quantidade, preco: Number(pizza.preco) });
      }

      // atualiza contato do cliente com o que foi informado no checkout
      await tx.prepare('UPDATE cliente SET endereco = COALESCE(?, endereco) WHERE id_cliente = ?')
        .run(tipo_entrega === 'delivery' ? endereco : null, req.cliente.id_cliente);

      return { id_pedido, total, resumo };
    });

    res.status(201).json({ mensagem: 'Pedido recebido!', ...resultado });
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message || 'Erro ao criar pedido.' });
  }
});

module.exports = router;
module.exports.STATUS = STATUS;
