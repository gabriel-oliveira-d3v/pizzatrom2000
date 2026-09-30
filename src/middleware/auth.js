// ============================================================
//  Autenticação: admins (área restrita) e clientes (loja)
//  - sessão via express-session
//  - "Manter conectado" grava o UUID do cliente no LocalStorage
//    e o front reenvia no header X-Cliente-Id
// ============================================================
const db = require('../db/database');

const qAdmin = 'SELECT id_admin, nome, email, cargo, ativo FROM admin WHERE id_admin = ?';
const qPerms = `
  SELECT p.nome FROM permissao p
  JOIN admin_permissao ap ON ap.id_permissao = p.id_permissao
  WHERE ap.id_admin = ?
`;
const qCliente = 'SELECT id_cliente, nome, email, telefone, endereco, criado_em FROM cliente WHERE id_cliente = ?';

// ---------- ADMIN ----------
async function requireAuth(req, res, next) {
  const id = req.session?.id_admin;
  if (!id) return res.status(401).json({ erro: 'Não autenticado.' });

  const admin = await db.prepare(qAdmin).get(id);
  if (!admin || !admin.ativo) {
    req.session.destroy(() => {});
    return res.status(401).json({ erro: 'Sessão inválida ou admin inativo.' });
  }

  const permissoes = await db.prepare(qPerms).all(id);
  req.admin = { ...admin, permissoes: permissoes.map((r) => r.nome) };
  next();
}

function requirePermissao(permissao) {
  return (req, res, next) => {
    if (req.admin.cargo === 'gerente' || req.admin.permissoes.includes(permissao)) return next();
    res.status(403).json({ erro: `Sem permissão: ${permissao}.` });
  };
}

// ---------- CLIENTE ----------
// Aceita a sessão (cookie) ou o UUID reenviado pelo LocalStorage
// (é isso que reidrata o "manter conectado" no próximo acesso).
function idClienteDoRequest(req) {
  return req.session?.id_cliente || req.get('X-Cliente-Id') || req.query.cliente_id || null;
}

async function requireCliente(req, res, next) {
  const id = idClienteDoRequest(req);
  if (!id) return res.status(401).json({ erro: 'Você precisa entrar na sua conta para interagir.' });

  const cliente = await db.prepare(qCliente).get(id);
  if (!cliente) {
    if (req.session) delete req.session.id_cliente;
    return res.status(401).json({ erro: 'Sessão do cliente expirada. Entre novamente.' });
  }

  req.cliente = cliente;
  next();
}

// Quando o cliente não está logado, o front chama as rotas liberadas
// e usa o retorno para decidir se mostra o modal de login.
async function opcionalCliente(req, res, next) {
  const id = idClienteDoRequest(req);
  if (id) {
    const cliente = await db.prepare(qCliente).get(id).catch(() => null);
    if (cliente) req.cliente = cliente;
  }
  next();
}

module.exports = { requireAuth, requirePermissao, requireCliente, opcionalCliente, idClienteDoRequest };
