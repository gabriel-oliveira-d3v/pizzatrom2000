// ============================================================
//  Rotas de IA.
//  GET  /api/ia/visao-geral  -> texto da IA exibido na home (cacheado)
//  GET  /api/ia/sugestao     -> sugestão personalizada do cliente logado
//  POST /api/admin/ia/...    -> admin gera/regenera os conteúdos
// ============================================================
const express = require('express');
const db = require('../db/database');
const { requireCliente, requireAuth, requirePermissao } = require('../middleware/auth');
const ia = require('../services/ia');

const router = express.Router();

// ---------- público ----------
// Requisito 3: a página principal exibe dados obtidos por consulta a IA
// e indica que o conteúdo foi gerado por IA. Só devolve o texto para
// quem está logado; visitante anônimo fica com o texto padrão e um
// convite para entrar (assim a cota do Gemini não é gasta na vitrine).
router.get('/visao-geral', async (req, res) => {
  const logado = Boolean(req.session?.id_cliente || req.session?.id_admin);
  if (!logado) {
    return res.json({ disponivel: ia.IA_DISPONIVEL(), modelo: ia.MODELO(), gerado_por_ia: false, precisa_login: true });
  }

  const salvo = await db.prepare(
    "SELECT titulo, conteudo, gerado_em, modelo FROM conteudo_ia WHERE chave = 'visao_geral'"
  ).get();

  res.json({
    disponivel: ia.IA_DISPONIVEL(),
    modelo: ia.MODELO(),
    gerado_por_ia: Boolean(salvo),
    titulo: salvo?.titulo || 'PizzaTrom2000',
    conteudo: salvo?.conteudo || null,
    gerado_em: salvo?.gerado_em || null,
  });
});

// Sugestão personalizada (usa IA + histórico do cliente)
router.get('/sugestao', requireCliente, async (req, res) => {
  if (!ia.IA_DISPONIVEL()) {
    return res.json({ disponivel: false, mensagem: null });
  }

  const pizzas = await db.prepare('SELECT id_pizza, nome, tamanho, preco FROM pizza ORDER BY nome').all();
  const pedidos = await db.prepare(`
    SELECT p.data_hora, STRING_AGG(pz.nome || ' x' || i.quantidade, ', ') AS itens
    FROM pedido p
    JOIN item_pedido i ON i.id_pedido = p.id_pedido
    JOIN pizza pz       ON pz.id_pizza = i.id_pizza
    WHERE p.id_cliente = ?
    GROUP BY p.id_pedido ORDER BY p.data_hora DESC LIMIT 5
  `).all(req.cliente.id_cliente);

  const cache = await db.prepare("SELECT conteudo FROM conteudo_ia WHERE chave = ?")
    .get(`sugestao:${req.cliente.id_cliente}`);
  if (cache) {
    return res.json({ disponivel: true, ...JSON.parse(cache.conteudo), cacheado: true });
  }

  const r = await ia.gerarSugestaoCliente(req.cliente, pizzas, pedidos);
  const sugestao = {
    mensagem: String(r.mensagem || '').slice(0, 300),
    id_pizza: Number(r.id_pizza) || null,
  };

  await db.prepare(`
    INSERT INTO conteudo_ia (chave, titulo, conteudo, modelo) VALUES (?, ?, ?, ?)
    ON CONFLICT (chave) DO UPDATE SET conteudo = EXCLUDED.conteudo, gerado_em = now()
  `).run(`sugestao:${req.cliente.id_cliente}`, 'Sugestão da IA', JSON.stringify(sugestao), ia.MODELO());

  res.json({ disponivel: true, ...sugestao, cacheado: false });
});

// ---------- admin ----------
const adminIA = express.Router();
adminIA.use(requireAuth, requirePermissao('usar_ia'));

// Gera/regenera a visão geral da loja
adminIA.post('/visao-geral', async (req, res) => {
  const pizzas = await db.prepare(
    'SELECT nome, tamanho, preco, ingredientes, destaque FROM pizza ORDER BY nome'
  ).all();
  if (!pizzas.length) return res.status(400).json({ erro: 'Cadastre pizzas antes de gerar o texto da IA.' });

  const r = await ia.gerarVisaoGeral(pizzas);
  await db.prepare(`
    INSERT INTO conteudo_ia (chave, titulo, conteudo, modelo) VALUES ('visao_geral', ?, ?, ?)
    ON CONFLICT (chave) DO UPDATE SET titulo = EXCLUDED.titulo, conteudo = EXCLUDED.conteudo,
                                    modelo = EXCLUDED.modelo, gerado_em = now()
  `).run(r.titulo, r.conteudo, ia.MODELO());

  res.json({ mensagem: 'Texto da IA gerado e salvo!', ...r });
});

// Gera descrição + tags + sugestão de uma pizza
adminIA.post('/pizza/:id', async (req, res) => {
  const pizza = await db.prepare(
    'SELECT id_pizza, nome, tamanho, preco, ingredientes FROM pizza WHERE id_pizza = ?'
  ).get(Number(req.params.id));
  if (!pizza) return res.status(404).json({ erro: 'Pizza não encontrada.' });

  const r = await ia.gerarPizza(pizza);
  await db.prepare(`
    UPDATE pizza SET ia_descricao = ?, ia_tags = ?, ia_gerado_em = now(), ia_modelo = ?
    WHERE id_pizza = ?
  `).run(r.ia_descricao, r.ia_tags, ia.MODELO(), pizza.id_pizza);

  res.json({ mensagem: `Conteúdo de IA gerado para ${pizza.nome}!`, ...r });
});

module.exports = router;
module.exports.admin = adminIA;
