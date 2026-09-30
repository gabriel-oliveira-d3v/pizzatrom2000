// ============================================================
//  Autenticação da área restrita (admins)
// ============================================================
const express = require('express');
const db = require('../db/database');
const { verificarSenha } = require('../utils/hash');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const senha = String(req.body?.senha ?? '');
  if (!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });

  const admin = await db.prepare('SELECT * FROM admin WHERE email = ?').get(email);
  if (!admin || !admin.ativo || !verificarSenha(senha, admin.senha_hash)) {
    return res.status(401).json({ erro: 'Credenciais inválidas.' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ erro: 'Erro ao criar sessão.' });
    req.session.id_admin = admin.id_admin;
    res.json({ admin: { id_admin: admin.id_admin, nome: admin.nome, email: admin.email, cargo: admin.cargo } });
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.clearCookie('pizzatrom.sid').json({ ok: true }));
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.session?.id_admin) return res.status(401).json({ erro: 'Não autenticado.' });

  const admin = await db.prepare(
    'SELECT id_admin, nome, email, cargo, ativo FROM admin WHERE id_admin = ?'
  ).get(req.session.id_admin);
  if (!admin || !admin.ativo) return res.status(401).json({ erro: 'Não autenticado.' });

  const permissoes = await db.prepare(`
    SELECT p.nome FROM permissao p
    JOIN admin_permissao ap ON ap.id_permissao = p.id_permissao
    WHERE ap.id_admin = ?
  `).all(admin.id_admin);

  res.json({ admin: { ...admin, permissoes: permissoes.map((p) => p.nome) } });
});

module.exports = router;