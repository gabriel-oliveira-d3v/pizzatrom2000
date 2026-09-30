// ============================================================
//  Área do cliente (loja): cadastro, login, logout, sessão
//  Requisito 4 (login/cadastro) e 5 (UUID no LocalStorage)
// ============================================================
const express = require('express');
const db = require('../../db/database');
const { hashSenha, verificarSenha } = require('../../utils/hash');
const { requireCliente } = require('../../middleware/auth');

const router = express.Router();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validação do cadastro: nome, e-mail e senha.
function validarCadastro(body) {
  const nome = String(body?.nome ?? '').trim();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const senha = String(body?.senha ?? '');
  if (nome.length < 3) return { erro: 'Informe seu nome (mínimo 3 letras).' };
  if (!EMAIL.test(email)) return { erro: 'E-mail inválido.' };
  if (senha.length < 6) return { erro: 'A senha precisa ter ao menos 6 caracteres.' };
  return { nome, email, senha };
}

// Validação do login: só e-mail e senha (o nome não é enviado).
function validarLogin(body) {
  const email = String(body?.email ?? '').trim().toLowerCase();
  const senha = String(body?.senha ?? '');
  if (!EMAIL.test(email)) return { erro: 'E-mail inválido.' };
  if (!senha) return { erro: 'Informe a senha.' };
  return { email, senha };
}

// POST /api/cliente/auth/cadastro
router.post('/cadastro', async (req, res) => {
  const d = validarCadastro(req.body);
  if (d.erro) return res.status(400).json({ erro: d.erro });

  const existe = await db.prepare('SELECT 1 AS x FROM cliente WHERE email = ?').get(d.email);
  if (existe) return res.status(409).json({ erro: 'Este e-mail já possui cadastro. Faça login.' });

  const telefone = String(req.body?.telefone ?? '').trim() || null;
  const endereco = String(req.body?.endereco ?? '').trim() || null;

  const r = await db.prepare(`
    INSERT INTO cliente (nome, email, senha_hash, telefone, endereco)
    VALUES (?, ?, ?, ?, ?) RETURNING id_cliente
  `).run(d.nome, d.email, hashSenha(d.senha), telefone, endereco);

  const id_cliente = r.lastInsertRowid;
  req.session.id_cliente = id_cliente;
  req.session.manter_conectado = Boolean(req.body?.manter_conectado);
  res.status(201).json({ id_cliente, nome: d.nome, email: d.email, manter_conectado: req.session.manter_conectado });
});

// POST /api/cliente/auth/login
router.post('/login', async (req, res) => {
  const d = validarLogin(req.body);
  if (d.erro) return res.status(400).json({ erro: d.erro });

  const cliente = await db.prepare('SELECT * FROM cliente WHERE email = ?').get(d.email);
  if (!cliente || !verificarSenha(d.senha, cliente.senha_hash)) {
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }

  const manter = Boolean(req.body?.manter_conectado);
  // regenera a sessão para evitar fixação de sessão
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ erro: 'Erro ao criar sessão.' });
    req.session.id_cliente = cliente.id_cliente;
    req.session.manter_conectado = manter;
    res.json({
      id_cliente: cliente.id_cliente,
      nome: cliente.nome,
      email: cliente.email,
      manter_conectado: manter,
    });
  });
});

// POST /api/cliente/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/cliente/auth/me -> reidrata a sessão via UUID do LocalStorage
//
// Esta rota é usada pelo front como "quem sou eu?" ao abrir a página, então
// responder 200 com `cliente: null` quando ninguém está logado é intencional:
// não é erro, é o estado anônimo. Já um UUID enviado e não resolvido é erro
// de verdade e devolve 401/400, para o front limpar a chave do LocalStorage.
router.get('/me', async (req, res) => {
  const id = req.session?.id_cliente || req.get('X-Cliente-Id') || req.query.cliente_id;

  if (!id) return res.json({ cliente: null });
  if (!UUID.test(String(id))) return res.status(400).json({ erro: 'Identificador de cliente inválido.' });

  const cliente = await db.prepare(
    'SELECT id_cliente, nome, email, telefone, endereco FROM cliente WHERE id_cliente = ?'
  ).get(id);
  if (!cliente) return res.status(401).json({ erro: 'Sessão do cliente expirada.' });

  // se veio só do LocalStorage, promove para sessão
  if (!req.session.id_cliente) req.session.id_cliente = cliente.id_cliente;
  res.json({ cliente });
});

// PUT /api/cliente/conta  -> atualiza dados de contato
router.put('/conta', requireCliente, async (req, res) => {
  const telefone = String(req.body?.telefone ?? '').trim() || null;
  const endereco = String(req.body?.endereco ?? '').trim() || null;
  await db.prepare('UPDATE cliente SET telefone = ?, endereco = ? WHERE id_cliente = ?')
    .run(telefone, endereco, req.cliente.id_cliente);
  res.json({ ok: true, cliente: { ...req.cliente, telefone, endereco } });
});

module.exports = router;
