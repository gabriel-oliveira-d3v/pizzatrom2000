// ============================================================
//  Conexão PostgreSQL (Neon) + camada de compatibilidade com a
//  interface simples que as rotas usam:
//
//    db.prepare(sql).get(...params)   ->  1 linha  | undefined
//    db.prepare(sql).all(...params)   ->  array de linhas
//    db.prepare(sql).run(...params)   ->  { changes, rows, lastInsertRowid }
//    await db.transaction(async (tx) => { ... })
//
//  O SQL das rotas continua escrito com "?" e é traduzido para
//  "$1, $2, ..." (placeholders do Postgres) automaticamente.
// ============================================================
const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// NUMERIC/NUMERIC[] chegam como string no pg; queremos number.
types.setTypeParser(1700, (v) => (v === null ? null : Number.parseFloat(v))); // numeric
types.setTypeParser(3802, (v) => v); // numeric[] -> array de string
// COUNT(*) volta como bigint (string); no front queremos number.
types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10))); // int8

const CONNECTION = process.env.DATABASE_URL;
if (!CONNECTION) {
  console.error('[db] DATABASE_URL não definida. Copie o arquivo .env.example para .env e preencha.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: CONNECTION,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 20_000,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => console.error('[db] erro inesperado no pool:', err.message));

// ---------- Conversão de placeholders ? -> $n ----------
// Ignora '?' dentro de literais de texto e de identificadores.
function toPostgres(sql) {
  let out = '';
  let i = 0;
  let n = 1;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') { // literal de texto ou identificador
      out += c;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) { out += c + c; i += 2; continue; }
          out += c; i += 1; break;
        }
        out += sql[i];
        i += 1;
      }
      continue;
    }
    if (c === '?') { out += `$${n}`; n += 1; i += 1; continue; }
    out += c;
    i += 1;
  }
  return out;
}

// ---------- Monta a interface a partir de um "runner" de queries ----------
function criarDb(executar) {
  return {
    // query crua (não converte placeholders)
    query: (sql, params) => executar(sql, params),

    prepare(sql) {
      const texto = toPostgres(sql);
      return {
        get: async (...params) => {
          const r = await executar(texto, params);
          return r.rows[0];
        },
        all: async (...params) => {
          const r = await executar(texto, params);
          return r.rows;
        },
        run: async (...params) => {
          const r = await executar(texto, params);
          const primeira = r.rows?.[0];
          return {
            changes: r.rowCount ?? 0,
            rows: r.rows ?? [],
            // atalho: use RETURNING <chave> no INSERT/UPDATE e leia .lastInsertRowid
            lastInsertRowid: primeira ? (primeira.id ?? Object.values(primeira)[0]) : null,
          };
        },
      };
    },

    // Transação real (BEGIN/COMMIT/ROLLBACK) num cliente dedicado.
    // O callback recebe um "tx" com a mesma interface, então o código
    // de dentro roda com as duas sintaxes.
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = criarDb((sql, params) => client.query(sql, params));
        const resultado = await fn(tx);
        await client.query('COMMIT');
        return resultado;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

const db = criarDb((sql, params) => pool.query(sql, params));
db.pool = pool;

// Cria as tabelas (idempotente) e espera o banco responder.
let pronto = null;
function iniciar() {
  if (!pronto) {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    pronto = pool.query(schema).then(() => console.log('[db] schema aplicado no PostgreSQL.'));
  }
  return pronto;
}

module.exports = db;
module.exports.iniciar = iniciar;
module.exports.toPostgres = toPostgres;
