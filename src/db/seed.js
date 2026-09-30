// ============================================================
//  Seed idempotente: permissões, admin gerente, pizzas de exemplo.
//  Roda sozinho (npm run seed) e também no start, se o banco
//  estiver vazio.
// ============================================================
const db = require('./database');
const { hashSenha } = require('../utils/hash');

const PERMISSOES = [
  ['gerenciar_pizzas', 'Cadastrar, editar e remover pizzas do cardápio'],
  ['gerenciar_pedidos', 'Visualizar e atualizar o status dos pedidos'],
  ['gerenciar_avaliacoes', 'Responder e excluir avaliações dos clientes'],
  ['gerenciar_clientes', 'Visualizar, editar e remover clientes'],
  ['gerenciar_admins', 'Cadastrar, editar e remover administradores'],
  ['gerenciar_permissoes', 'Cadastrar permissões e atribuí-las a administradores'],
  ['usar_ia', 'Gerar descrições e sugestões com Inteligência Artificial'],
];

// nome, tamanho, preço, ingredientes, destaque
const PIZZAS = [
  ['Margherita', 'Grande', 42.90, 'Molho de tomate, mussarela, manjericão fresco e azeite', true],
  ['Calabresa', 'Grande', 44.90, 'Mussarela, calabresa fatiada, cebola e orégano', true],
  ['Portuguesa', 'Grande', 49.90, 'Presunto, ovos, cebola, azeitona, mussarela e orégano', true],
  ['Quatro Queijos', 'Grande', 52.90, 'Mussarela, provolone, parmesão e gorgonzola', true],
  ['Frango com Catupiry', 'Grande', 51.90, 'Frango desfiado temperado, catupiry e milho', false],
  ['Pepperoni', 'Grande', 54.90, 'Mussarela, pepperoni e orégano', true],
  ['Vegetariana', 'Média', 39.90, 'Abobrinha, berinjela, pimentão, tomate e mussarela', false],
  ['Chocolate', 'Broto', 24.90, 'Chocolate ao leite derretido com granulado', false],
];

async function seed() {
  await db.iniciar();

  const { n: qtdAdmins } = await db.prepare('SELECT COUNT(*)::int AS n FROM admin').get();
  if (qtdAdmins > 0) {
    console.log('[seed] Banco já possui dados, nada a fazer.');
    return;
  }

  await db.transaction(async (tx) => {
    const insPerm = tx.prepare('INSERT INTO permissao (nome, descricao) VALUES (?, ?) RETURNING id_permissao');
    for (const [nome, desc] of PERMISSOES) await insPerm.run(nome, desc);

    const novoAdmin = await tx.prepare(`
      INSERT INTO admin (nome, email, senha_hash, cargo, ativo)
      VALUES (?, ?, ?, 'gerente', TRUE) RETURNING id_admin
    `).run('Administrador', 'admin@pizzatrom2000.com', hashSenha('admin123'));
    const id_admin = novoAdmin.lastInsertRowid;

    const insAP = tx.prepare('INSERT INTO admin_permissao (id_admin, id_permissao) VALUES (?, ?)');
    const todas = await tx.prepare('SELECT id_permissao FROM permissao').all();
    for (const p of todas) await insAP.run(id_admin, p.id_permissao);

    const insPizza = tx.prepare(`
      INSERT INTO pizza (nome, tamanho, preco, ingredientes, destaque, id_admin)
      VALUES (?, ?, ?, ?, ?, ?) RETURNING id_pizza
    `);
    for (const [nome, tam, preco, ing, destaque] of PIZZAS) {
      await insPizza.run(nome, tam, preco, ing, destaque, id_admin);
    }
  });

  console.log('[seed] Pronto!');
  console.log('[seed] Admin: admin@pizzatrom2000.com / admin123 (gerente, todas as permissões)');
  console.log(`[seed] ${PIZZAS.length} pizzas de exemplo cadastradas.`);
}

if (require.main === module) {
  seed()
    .then(() => db.pool.end())
    .catch((e) => { console.error('[seed] erro:', e.message); process.exit(1); });
}

module.exports = seed;
