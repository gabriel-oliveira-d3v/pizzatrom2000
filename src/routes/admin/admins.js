// ============================================================
//  Administradores da área restrita
// ============================================================
const express = require('express');
const db = require('../../db/database');
const { hashSenha } = require('../../utils/hash');
const { requireAuth, requirePermissao } = require('../../middleware/auth');

const router = express.Router();
router.use(requireAuth, requirePermissao('gerenciar_admins'));

const CARGOS = ['gerente', 'atendente', 'cozinha'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validar(body, parcial = false) {
  const d = {};
  if (!parcial || body.nome !== undefined) {
    d.nome = String(body.nome ?? '').trim();
    if (d.nome.length < 3) return { erro: 'Informe o nome.' };
  }
  if (!parcial || body.email !== undefined) {
    d.email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(d.email)) return { erro: 'E-mail inválido.' };
  }
  if (!parcial || body.senha !== undefined) {
    d.senha = String(body.senha ?? '');
    if (d.senha.length < 6) return { erro: 'A senha precisa ter ao menos 6 caracteres.' };
  }
  if (!parcial || body.cargo !== undefined) {
    d.cargo = String(body.cargo ?? '').trim();
    if (!CARGOS.includes(d.cargo)) return { erro: `Cargo inválido. Use: ${CARGOS.join(', ')}.` };
  }
  if (body.ativo !== undefined) d.ativo = Boolean(body.ativo);
  return { dados: d };
}

// GET /api/admin/admins
router.get('/', async (req, res) => {
  const admins = await db.prepare(`
    SELECT a.id_admin, a.nome, a.email, a.cargo, a.ativo,
           COALESCE(
             (SELECT STRING_AGG(p.nome, ',') FROM permissao p
               JOIN admin_permissao ap ON ap.id_permissao = p.id_permissao
              WHERE ap.id_admin = a.id_admin), ''
           ) AS permissoes
    FROM admin a ORDER BY a.nome
  `).all();
  res.json(admins);
});

// POST /api/admin/admins
router.post('/', async (req, res) => {
  const v = validar(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  const d = v.dados;

  const existe = await db.prepare('SELECT 1 AS x FROM admin WHERE email = ?').get(d.email);
  if (existe) return res.status(409).json({ erro: 'Já existe um admin com este e-mail.' });

  const r = await db.prepare(`
    INSERT INTO admin (nome, email, senha_hash, cargo, ativo) VALUES (?, ?, ?, ?, ?) RETURNING id_admin
  `).run(d.nome, d.email, hashSenha(d.senha), d.cargo, d.ativo ?? true);

  res.status(201).json({ id_admin: r.lastInsertRowid, mensagem: `${d.nome} cadastrado!` });
});

// PUT /api/admin/admins/:id
router.put('/:id', async (req, res) => {
  const v = validar(req.body, true);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  const d = v.dados;

  if (d.email) {
    const outro = await db.prepare('SELECT 1 AS x FROM admin WHERE email = ? AND id_admin <> ?').get(d.email, req.params.id);
    if (outro) return res.status(409).json({ erro: 'Já existe um admin com este e-mail.' });
  }
  if (Number(req.params.id) === req.admin.id_admin && d.ativo === false) {
    return res.status(400).json({ erro: 'Você não pode desativar o próprio usuário.' });
  }

  const sets = [];
  const params = [];
  for (const [col, val] of Object.entries(d)) {
    sets.push(`${col} = ?`);
    params.push(col === 'senha' ? hashSenha(val) : val);
  }
  if (!sets.length) return res.status(400).json({ erro: 'Nada para atualizar.' });

  const r = await db.prepare(`UPDATE admin SET ${sets.join(', ')} WHERE id_admin = ?`).run(...params, req.params.id);
  if (!r.changes) return res.status(404).json({ erro: 'Admin não encontrado.' });
  res.json({ mensagem: 'Admin atualizado!' });
});

// DELETE /api/admin/admins/:id
router.delete('/:id', async (req, res) => {
  if (Number(req.params.id) === req.admin.id_admin) {
    return res.status(400).json({ erro: 'Você não pode excluir o próprio usuário.' });
  }
  const r = await db.prepare('DELETE FROM admin WHERE id_admin = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ erro: 'Admin não encontrado.' });
  res.json({ mensagem: 'Admin excluído!' });
});

module.exports = router;
module.exports.CARGOS = CARGOS;
