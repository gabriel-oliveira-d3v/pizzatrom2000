// ============================================================
//  Interação do cliente: avaliar com nota + comentário
//  (tabela avaliacao - resposta do admin aparece depois)
// ============================================================
const express = require('express');
const db = require('../db/database');
const { requireCliente } = require('../middleware/auth');

const router = express.Router();

// POST /api/avaliacoes  { id_pizza, nota, comentario }
router.post('/', requireCliente, async (req, res) => {
  const id_pizza = Number(req.body?.id_pizza);
  const nota = Number(req.body?.nota);
  const comentario = String(req.body?.comentario ?? '').trim().slice(0, 500) || null;

  if (!Number.isInteger(id_pizza)) return res.status(400).json({ erro: 'Informe a pizza.' });
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return res.status(400).json({ erro: 'A nota deve ser um número de 1 a 5.' });
  }
  if (!comentario) return res.status(400).json({ erro: 'Escreva um comentário para avaliar.' });

  const pizza = await db.prepare('SELECT id_pizza, nome FROM pizza WHERE id_pizza = ?').get(id_pizza);
  if (!pizza) return res.status(404).json({ erro: 'Pizza não encontrada.' });

  const jaTem = await db.prepare('SELECT 1 AS x FROM avaliacao WHERE id_cliente = ? AND id_pizza = ?')
    .get(req.cliente.id_cliente, id_pizza);

  if (jaTem) {
    await db.prepare('UPDATE avaliacao SET nota = ?, comentario = ?, data = now(), resposta = NULL, resposta_em = NULL WHERE id_cliente = ? AND id_pizza = ?')
      .run(nota, comentario, req.cliente.id_cliente, id_pizza);
    return res.json({ mensagem: 'Avaliação atualizada!', pizza: pizza.nome });
  }

  await db.prepare('INSERT INTO avaliacao (id_cliente, id_pizza, nota, comentario) VALUES (?, ?, ?, ?)')
    .run(req.cliente.id_cliente, id_pizza, nota, comentario);

  res.status(201).json({ mensagem: 'Avaliação enviada! A loja pode responder em breve.', pizza: pizza.nome });
});

module.exports = router;
