// ============================================================
//  Cria/atualiza o schema no PostgreSQL (idempotente).
//  Uso: npm run migrate
// ============================================================
require('dotenv').config();

const db = require('./database');

(async () => {
  try {
    await db.iniciar();
    const tabelas = await db.prepare(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `).all();
    console.log(`[migrate] ${tabelas.length} tabelas ensured:`);
    console.log(`[migrate] ${tabelas.map((t) => t.table_name).join(', ')}`);
    await db.pool.end();
  } catch (e) {
    console.error('[migrate] erro:', e.message);
    process.exit(1);
  }
})();