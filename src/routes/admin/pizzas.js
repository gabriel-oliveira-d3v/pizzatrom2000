// ============================================================
//  Listagem e cadastro do item principal (requisito 10),
//  incluindo o atributo destaque (requisito 2) e os campos de IA.
// ============================================================
const express = require('express');
const db = require('../../db/database');
const { requireAuth, requirePermissao } = require('../../middleware/auth');

const router = express.Router();
router.use(requireAuth, requirePermissao('gerenciar_pizzas'));

const TAMANHOS = ['Broto', 'Média', 'Grande', 'Família'];

function validar(body, parcial = false) {
  const d = {};
  const tem = (k) => body?.[k] !== undefined;
  if (!parcial || tem('nome')) {
    d.nome = String(body.nome ?? '').trim();
    if (d.nome.length < 2) return { erro: 'Informe o nome da pizza.' };
  }
  if (!parcial || tem('tamanho')) {
    d.tamanho = String(body.tamanho ?? '').trim();
    if (!TAMANHOS.includes(d.tamanho)) return { erro: `Tamanho inválido. Use: ${TAMANHOS.join(', ')}.` };
  }
  if (!parcial || tem('preco')) {
    d.preco = Number(body.preco);
    if (!Number.isFinite(d.preco) || d.preco < 0) return { erro: 'Preço inválido.' };
  }
  if (!parcial || tem('ingredientes')) {
    d.ingredientes = String(body.ingredientes ?? '').trim();
    if (d.ingredientes.length < 3) return { erro: 'Informe os ingredientes.' };
  }
  if (tem('destaque')) d.destaque = Boolean(body.destaque);
  return { dados: d };
}

// GET /api/admin/pizzas
router.get('/', async (req, res) => {
  const pizzas = await db.prepare(`
    SELECT p.id_pizza, p.nome, p.tamanho, p.preco, p.ingredientes, p.destaque, p.data_cadastro,
           p.ia_descricao, p.ia_tags, p.ia_gerado_em,
           ROUND(AVG(av.nota)::numeric, 1) AS nota_media,
           COUNT(av.id_avaliacao)::int      AS qtd_avaliacoes,
           ad.nome AS cadastrado_por
    FROM pizza p
    LEFT JOIN avaliacao av ON av.id_pizza = p.id_pizza
    LEFT JOIN admin ad     ON ad.id_admin = p.id_admin
    GROUP BY p.id_pizza, ad.nome
    ORDER BY p.destaque DESC, p.nome
  `).all();
  res.json(pizzas);
});

// POST /api/admin/pizzas
router.post('/', async (req, res) => {
  const v = validar(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  const d = v.dados;

  const r = await db.prepare(`
    INSERT INTO pizza (nome, tamanho, preco, ingredientes, destaque, id_admin)
    VALUES (?, ?, ?, ?, ?, ?) RETURNING id_pizza
  `).run(d.nome, d.tamanho, d.preco, d.ingredientes, d.destaque ?? false, req.admin.id_admin);

  res.status(201).json({ id_pizza: r.lastInsertRowid, mensagem: `${d.nome} cadastrada!` });
});

// PUT /api/admin/pizzas/:id
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existe = await db.prepare('SELECT id_pizza FROM pizza WHERE id_pizza = ?').get(id);
  if (!existe) return res.status(404).json({ erro: 'Pizza não encontrada.' });

  const v = validar(req.body, true);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  const d = v.dados;

  const campos = [];
  const params = [];
  for (const [col, val] of Object.entries(d)) { campos.push(`${col} = ?`); params.push(val); }
  if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar.' });

  await db.prepare(`UPDATE pizza SET ${campos.join(', ')} WHERE id_pizza = ?`).run(...params, id);
  res.json({ mensagem: 'Pizza atualizada!' });
});

// DELETE /api/admin/pizzas/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const emPedido = await db.prepare('SELECT 1 AS x FROM item_pedido WHERE id_pizza = ? LIMIT 1').get(id);
  if (emPedido) {
    return res.status(409).json({ erro: 'Esta pizza já está em um pedido e não pode ser excluída.' });
  }
  const r = await db.prepare('DELETE FROM pizza WHERE id_pizza = ?').run(id);
  if (!r.changes) return res.status(404).json({ erro: 'Pizza não encontrada.' });
  res.json({ mensagem: 'Pizza excluída!' });
});

module.exports = router;
module.exports.TAMANHOS = TAMANHOS;
