// ============================================================
//  PizzaTrom2000 - servidor Express
//  Backend + front estático (desenvolvimento) e API (produção)
// ============================================================
require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const db = require('./src/db/database');
const seed = require('./src/db/seed');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- CORS (front na Vercel, back no Render) ----------
const CORS_ORIGENS = (process.env.CORS_ORIGENS || 'http://localhost:3000')
  .split(',').map((o) => o.trim()).filter(Boolean);

app.use((req, res, next) => {
  const origem = req.headers.origin;
  if (origem && CORS_ORIGENS.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cliente-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

app.use(session({
  name: 'pizzatrom.sid',
  secret: process.env.SESSION_SECRET || 'pizzatrom2000-dev-secret-trocar-em-producao',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: CORS_ORIGENS.some((o) => !o.includes('localhost')) ? 'none' : 'lax',
    secure: CORS_ORIGENS.some((o) => !o.includes('localhost')),
    maxAge: 1000 * 60 * 60 * 8, // 8h
  },
}));

// ---------- Loja (público + cliente logado) ----------
app.use('/api/pizzas', require('./src/routes/pizzas'));
app.use('/api/pedidos', require('./src/routes/pedidos'));
app.use('/api/avaliacoes', require('./src/routes/avaliacoes'));
app.use('/api/ia', require('./src/routes/ia'));
app.use('/api/cliente/auth', require('./src/routes/cliente/auth'));
app.use('/api/cliente', require('./src/routes/cliente/interacoes'));

// ---------- Área restrita ----------
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/admin/pizzas', require('./src/routes/admin/pizzas'));
app.use('/api/admin/pedidos', require('./src/routes/admin/pedidos'));
app.use('/api/admin/avaliacoes', require('./src/routes/admin/avaliacoes'));
app.use('/api/admin/clientes', require('./src/routes/admin/clientes'));
app.use('/api/admin/admins', require('./src/routes/admin/admins'));
app.use('/api/admin/permissoes', require('./src/routes/admin/permissoes'));
app.use('/api/admin/dashboard', require('./src/routes/admin/dashboard'));
app.use('/api/admin/ia', require('./src/routes/ia').admin);

app.get('/api/health', (req, res) => res.json({ ok: true, ia: Boolean(process.env.GEMINI_API_KEY) }));

// ---------- Front estático ----------
app.use(express.static(path.join(__dirname, 'public')));

// 404 da API
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// Tratamento de erros (respeita err.status, ex.: 503 quando a IA não está configurada)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  else console.warn(`[${status}] ${req.method} ${req.originalUrl}: ${err.message}`);
  res.status(status).json({ erro: status >= 500 ? 'Erro interno do servidor.' : err.message });
});

// ---------- Subida ----------
(async () => {
  try {
    await db.iniciar();
    await seed();
    app.listen(PORT, () => {
      console.log(`🍕 PizzaTrom2000 rodando em http://localhost:${PORT}`);
      console.log(`   Loja:  http://localhost:${PORT}/`);
      console.log(`   Admin: http://localhost:${PORT}/admin/login.html`);
      console.log(`   CORS:  ${CORS_ORIGENS.join(', ')}`);
    });
  } catch (e) {
    console.error('[startup] falha:', e.message);
    process.exit(1);
  }
})();