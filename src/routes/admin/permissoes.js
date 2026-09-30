// ============================================================
//  Permissões da área restrita e sua atribuição a admins
// ============================================================
const express = require('express');
const db = require('../../db/database');
const { requireAuth, requirePermissao } = require('../../middleware/auth');

const router = express.Router();
router.use(requireAuth, requirePermissao('gerenciar_permissoes'));

const normalizar = (s) => String(s).trim().toLowerCase().replace(/\s+/g, '_');
const ehUnico = (e) => e && (e.code === '23505' || String(e.message).includes('duplicate key'));

// GET /api/admin/permissoes
router.get('/', async (req, res) => {
  const permissoes = await db.prepare(`
    SELECT p.id_permissao, p.nome, p.descricao,
           (SELECT COUNT(*)::int FROM admin_permissao ap WHERE ap.id_permissao = p.id_permissao) AS total_admins
    FROM permissao p
    ORDER BY p.nome
  `).all();
  res.json(permissoes);
});

// POST /api/admin/permissoes
router.post('/', async (req, res) => {
  const nome = normalizar(req.body?.nome ?? '');
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da permissão.' });
  try {
    const r = await db.prepare('INSERT INTO permissao (nome, descricao) VALUES (?, ?) RETURNING id_permissao')
      .run(nome, String(req.body?.descricao ?? '').trim() || null);
    res.status(201).json(await db.prepare('SELECT * FROM permissao WHERE id_permissao = ?').get(r.lastInsertRowid));
  } catch (e) {
    if (ehUnico(e)) return res.status(409).json({ erro: 'Permissão já existe.' });
    throw e;
  }
});

// PUT /api/admin/permissoes/:id
router.put('/:id', async (req, res) => {
  const nome = normalizar(req.body?.nome ?? '');
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da permissão.' });
  try {
    const r = await db.prepare('UPDATE permissao SET nome = ?, descricao = ? WHERE id_permissao = ?')
      .run(nome, String(req.body?.descricao ?? '').trim() || null, Number(req.params.id));
    if (!r.changes) return res.status(404).json({ erro: 'Permissão não encontrada.' });
    res.json(await db.prepare('SELECT * FROM permissao WHERE id_permissao = ?').get(Number(req.params.id)));
  } catch (e) {
    if (ehUnico(e)) return res.status(409).json({ erro: 'Permissão já existe.' });
    throw e;
  }
});

// DELETE /api/admin/permissoes/:id
router.delete('/:id', async (req, res) => {
  const r = await db.prepare('DELETE FROM permissao WHERE id_permissao = ?').run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ erro: 'Permissão não encontrada.' });
  res.json({ mensagem: 'Permissão excluída!' });
});

// ---- Atribuição de permissões a um admin ----
// PUT /api/admin/permissoes/admin/:idAdmin  { permissoes: ['gerenciar_pizzas', ...] }
router.put('/admin/:idAdmin', async (req, res) => {
  const id_admin = Number(req.params.idAdmin);
  const nomes = Array.isArray(req.body?.permissoes) ? req.body.permissoes : [];
  if (!nomes.length) return res.status(400).json({ erro: 'Selecione ao menos uma permissão.' });

  try {
    await db.transaction(async (tx) => {
      await tx.prepare('DELETE FROM admin_permissao WHERE id_admin = ?').run(id_admin);
      const q = tx.prepare(`
        INSERT INTO admin_permissao (id_admin, id_permissao)
        SELECT ?, id_permissao FROM permissao WHERE nome = ?
      `);
      for (const nome of nomes) await q.run(id_admin, nome);
    });
  } catch (e) {
    if (ehUnico(e)) return res.status(409).json({ erro: 'Permissão inválida na lista.' });
    throw e;
  }

  res.json({ mensagem: 'Permissões atualizadas!' });
});

// GET /api/admin/permissoes/admin/:idAdmin
router.get('/admin/:idAdmin', async (req, res) => {
  const lista = await db.prepare(`
    SELECT p.nome FROM permissao p
    JOIN admin_permissao ap ON ap.id_permissao = p.id_permissao
    WHERE ap.id_admin = ? ORDER BY p.nome
  `).all(Number(req.params.idAdmin));
  res.json(lista.map((p) => p.nome));
});

module.exports = router;