// ============================================================
//  Tabela principal (pizzas) na página do cliente.
//  Requisito 1: destaques, últimos cadastrados, melhor avaliação
//  Requisito 2: rotina de pesquisa/filtro + reexibir destaques
// ============================================================
const express = require('express');
const db = require('../db/database');
const { opcionalCliente } = require('../middleware/auth');

const router = express.Router();

const ORDENS = {
  relevancia: 'p.destaque DESC, nota_media DESC NULLS LAST, p.nome',
  avaliacao: 'nota_media DESC NULLS LAST, p.nome',
  preco_asc: 'p.preco ASC, p.nome',
  preco_desc: 'p.preco DESC, p.nome',
  novidades: 'p.data_cadastro DESC, p.id_pizza DESC',
  nome: 'p.nome',
};

// Colunas base + média de estrelas + total de avaliações
const SELECAO = `
  SELECT p.id_pizza, p.nome, p.tamanho, p.preco, p.ingredientes, p.destaque,
         p.data_cadastro, p.ia_descricao, p.ia_tags, p.ia_gerado_em,
         ROUND(AVG(a.nota)::numeric, 1) AS nota_media, COUNT(a.id_avaliacao) AS qtd_avaliacoes,
         a2.nome AS cadastrado_por
  FROM pizza p
  LEFT JOIN avaliacao a  ON a.id_pizza = p.id_pizza
  LEFT JOIN admin a2      ON a2.id_admin = p.id_admin
`;

// GET /api/pizzas?busca=&destaque=1&tamanho=&ordenar=
router.get('/', async (req, res) => {
  const { busca, destaque, tamanho, ordenar } = req.query;
  const where = [];
  const params = [];

  if (busca && String(busca).trim()) {
    // ILIKE = busca sem diferenciar maiúsculas/minúsculas (Postgres)
    where.push('(p.nome ILIKE ? OR p.ingredientes ILIKE ?)');
    const termo = `%${String(busca).trim()}%`;
    params.push(termo, termo);
  }
  if (destaque === '1' || destaque === 'true') where.push('p.destaque = TRUE');
  if (tamanho && String(tamanho).trim()) {
    where.push('p.tamanho = ?');
    params.push(String(tamanho).trim());
  }

  const ordem = ORDENS[ordenar] || ORDENS.relevancia;
  const sql = `${SELECAO}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY p.id_pizza, a2.nome
    ORDER BY ${ordem}
  `;

  const pizzas = await db.prepare(sql).all(...params);
  res.json(pizzas);
});

// GET /api/pizzas/secoes -> destaques, novidades e mais bem avaliadas
router.get('/secoes', async (req, res) => {
  const destaques = await db.prepare(`${SELECAO} WHERE p.destaque = TRUE
    GROUP BY p.id_pizza, a2.nome ORDER BY p.nome`).all();

  const novidades = await db.prepare(`${SELECAO}
    GROUP BY p.id_pizza, a2.nome ORDER BY p.data_cadastro DESC, p.id_pizza DESC LIMIT 4`).all();

  const melhores = await db.prepare(`${SELECAO} WHERE a.nota IS NOT NULL
    GROUP BY p.id_pizza, a2.nome ORDER BY nota_media DESC, qtd_avaliacoes DESC LIMIT 4`).all();

  res.json({ destaques, novidades, melhores });
});

// GET /api/pizzas/:id -> detalhes ao clicar no item (requisito 6)
router.get('/:id', opcionalCliente, async (req, res) => {
  const id = Number(req.params.id);
  const pizza = await db.prepare(`${SELECAO} WHERE p.id_pizza = ?
    GROUP BY p.id_pizza, a2.nome`).get(id);
  if (!pizza) return res.status(404).json({ erro: 'Pizza não encontrada.' });

  const avaliacoes = await db.prepare(`
    SELECT a.id_avaliacao, a.nota, a.comentario, a.data, a.resposta, a.resposta_em,
           c.nome AS cliente_nome, ad.nome AS admin_nome
    FROM avaliacao a
    JOIN cliente c   ON c.id_cliente = a.id_cliente
    LEFT JOIN admin ad ON ad.id_admin = a.id_admin_resposta
    WHERE a.id_pizza = ?
    ORDER BY a.data DESC
  `).all(id);

  const jaAvaliou = req.cliente
    ? Boolean(await db.prepare('SELECT 1 AS x FROM avaliacao WHERE id_cliente = ? AND id_pizza = ?')
        .get(req.cliente.id_cliente, id))
    : false;

  res.json({ pizza, avaliacoes, logado: Boolean(req.cliente), jaAvaliou });
});

module.exports = router;
