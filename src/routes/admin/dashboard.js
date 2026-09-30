// ============================================================
//  Dashboard da área restrita (requisito 9):
//  KPIs + séries para os gráficos (pizza, rosca e barras).
//  Tudo em SQL, uma requisição só.
// ============================================================
const express = require('express');
const db = require('../../db/database');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const LABEL_STATUS = {
  pendente: 'Pendente', em_preparo: 'Em preparo', pronto: 'Pronto',
  saiu_entrega: 'Saiu para entrega', entregue: 'Entregue', cancelado: 'Cancelado',
};

router.get('/', async (req, res) => {
  // ---- KPIs ----
  const kpi = await db.prepare(`
    SELECT
      (SELECT COUNT(*)::int FROM pedido)                                       AS total_pedidos,
      (SELECT COUNT(*)::int FROM pedido WHERE status <> 'cancelado')          AS pedidos_ativos,
      (SELECT COUNT(*)::int FROM cliente)                                     AS total_clientes,
      (SELECT COUNT(*)::int FROM avaliacao)                                   AS total_avaliacoes,
      (SELECT COUNT(*)::int FROM pizza)                                       AS total_pizzas,
      (SELECT COUNT(*)::int FROM pizza WHERE destaque)                        AS total_destaques,
      (SELECT COALESCE(SUM(i.quantidade * pz.preco), 0) FROM pedido p
         JOIN item_pedido i ON i.id_pedido = p.id_pedido
         JOIN pizza pz      ON pz.id_pizza = i.id_pizza
        WHERE p.status <> 'cancelado')                                        AS faturamento,
      (SELECT ROUND(AVG(nota)::numeric, 2) FROM avaliacao)                    AS nota_media
  `).get();

  // ---- GRÁFICO 1 (pizza): pedidos por status ----
  const porStatus = await db.prepare(`
    SELECT status AS rotulo, COUNT(*)::int AS valor
    FROM pedido GROUP BY status ORDER BY valor DESC
  `).all();

  // ---- GRÁFICO 2 (pizza/rosca): pizzas mais pedidas ----
  const maisPedidas = await db.prepare(`
    SELECT pz.nome AS rotulo, SUM(i.quantidade)::int AS valor
    FROM item_pedido i
    JOIN pizza  pz ON pz.id_pizza = i.id_pizza
    JOIN pedido p  ON p.id_pedido = i.id_pedido
    WHERE p.status <> 'cancelado'
    GROUP BY pz.nome ORDER BY valor DESC LIMIT 6
  `).all();

  // ---- GRÁFICO 3 (barras): faturamento dos últimos 7 dias ----
  const faturamento7 = await db.prepare(`
    WITH dias AS (
      SELECT generate_series(current_date - INTERVAL '6 days', current_date, INTERVAL '1 day')::date AS dia
    )
    SELECT to_char(d.dia, 'DD/MM') AS rotulo,
           COALESCE(SUM(i.quantidade * pz.preco), 0)::numeric AS valor
    FROM dias d
    LEFT JOIN pedido p       ON p.data_hora::date = d.dia AND p.status <> 'cancelado'
    LEFT JOIN item_pedido i  ON i.id_pedido = p.id_pedido
    LEFT JOIN pizza pz       ON pz.id_pizza = i.id_pizza
    GROUP BY d.dia ORDER BY d.dia
  `).all();

  // ---- GRÁFICO 4 (barras horizontais): nota média por pizza ----
  const notasPizzas = await db.prepare(`
    SELECT pz.nome AS rotulo, ROUND(AVG(a.nota)::numeric, 1) AS valor
    FROM avaliacao a JOIN pizza pz ON pz.id_pizza = a.id_pizza
    GROUP BY pz.nome ORDER BY valor DESC, rotulo LIMIT 8
  `).all();

  // ---- extras úteis no painel ----
  const avaliacoesRecentes = await db.prepare(`
    SELECT a.id_avaliacao, a.nota, a.comentario, a.data, a.resposta, pz.nome AS pizza_nome,
           c.nome AS cliente_nome, c.email AS cliente_email
    FROM avaliacao a
    JOIN pizza pz  ON pz.id_pizza = a.id_pizza
    JOIN cliente c ON c.id_cliente = a.id_cliente
    ORDER BY a.data DESC LIMIT 5
  `).all();

  const clientesRecentes = await db.prepare(`
    SELECT nome, email, criado_em FROM cliente ORDER BY criado_em DESC LIMIT 5
  `).all();

  res.json({
    kpi: {
      ...kpi,
      faturamento: Number(kpi.faturamento),
      nota_media: kpi.nota_media === null ? null : Number(kpi.nota_media),
      ticket_medio: kpi.total_pedidos > 0 ? Number(kpi.faturamento) / kpi.pedidos_ativos || 0 : 0,
    },
    graficos: {
      pedidos_por_status: porStatus.map((s) => ({ ...s, rotulo: LABEL_STATUS[s.rotulo] || s.rotulo })),
      pizzas_mais_pedidas: maisPedidas,
      faturamento_7_dias: faturamento7.map((f) => ({ ...f, valor: Number(f.valor) })),
      nota_media_por_pizza: notasPizzas.map((n) => ({ ...n, valor: Number(n.valor) })),
    },
    avaliacoesRecentes,
    clientesRecentes,
  });
});

module.exports = router;
