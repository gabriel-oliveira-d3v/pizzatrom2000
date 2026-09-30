-- ============================================================
--  PizzaTrom2000 - Modelo E-R (PostgreSQL / Neon)
--  UniSenac - Trabalho #1 - Full Stack
--
--  Entidades: Cliente, Admin, Permissao, Admin_Permissao,
--             Pizza, Avaliacao, Pedido, ItemPedido, ConteudoIA
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- 1. ADMINISTRADORES (área restrita) ----------
CREATE TABLE IF NOT EXISTS admin (
  id_admin     SERIAL PRIMARY KEY,
  nome         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  senha_hash   TEXT NOT NULL,          -- apenas hash (scrypt), nunca texto puro
  cargo        TEXT NOT NULL DEFAULT 'atendente',
  ativo        BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------- 2. PERMISSÕES (controle da área restrita) ----------
CREATE TABLE IF NOT EXISTS permissao (
  id_permissao SERIAL PRIMARY KEY,
  nome         TEXT NOT NULL UNIQUE,
  descricao    TEXT
);

CREATE TABLE IF NOT EXISTS admin_permissao (
  id_admin     INTEGER NOT NULL REFERENCES admin(id_admin) ON DELETE CASCADE,
  id_permissao INTEGER NOT NULL REFERENCES permissao(id_permissao) ON DELETE CASCADE,
  PRIMARY KEY (id_admin, id_permissao)
);

-- ---------- 3. CLIENTES (UUID exigido no requisito 5) ----------
CREATE TABLE IF NOT EXISTS cliente (
  id_cliente UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  telefone   TEXT,
  endereco   TEXT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 4. TABELA PRINCIPAL: PIZZAS ----------
CREATE TABLE IF NOT EXISTS pizza (
  id_pizza     SERIAL PRIMARY KEY,
  nome         TEXT NOT NULL,
  tamanho      TEXT NOT NULL,
  preco        NUMERIC(10, 2) NOT NULL CHECK (preco >= 0),
  ingredientes TEXT NOT NULL,
  destaque     BOOLEAN NOT NULL DEFAULT FALSE,        -- requisito 2: destaque = TRUE
  data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now(),  -- requisito 1: "últimos cadastrados"
  -- requisito 3: dados obtidos por consulta a IA (cache persistido)
  ia_descricao TEXT,
  ia_tags      TEXT[],
  ia_gerado_em TIMESTAMPTZ,
  ia_modelo    TEXT,
  id_admin     INTEGER REFERENCES admin(id_admin) ON DELETE SET NULL
);

-- ---------- 5. INTERAÇÃO: AVALIAÇÃO (nota + comentário + resposta) ----------
CREATE TABLE IF NOT EXISTS avaliacao (
  id_avaliacao      SERIAL PRIMARY KEY,
  nota              INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario        TEXT,
  data              TIMESTAMPTZ NOT NULL DEFAULT now(),
  resposta          TEXT,                             -- resposta do admin
  resposta_em       TIMESTAMPTZ,
  id_admin_resposta INTEGER REFERENCES admin(id_admin) ON DELETE SET NULL,
  id_cliente        UUID NOT NULL REFERENCES cliente(id_cliente) ON DELETE CASCADE,
  id_pizza          INTEGER NOT NULL REFERENCES pizza(id_pizza) ON DELETE CASCADE,
  CONSTRAINT avaliacao_unica UNIQUE (id_cliente, id_pizza)  -- 1 avaliação por cliente/pizza
);

-- ---------- 6. INTERAÇÃO: PEDIDO / RESERVA ----------
CREATE TABLE IF NOT EXISTS pedido (
  id_pedido    SERIAL PRIMARY KEY,
  data_hora    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'pendente'
               CHECK (status IN ('pendente','em_preparo','pronto','saiu_entrega','entregue','cancelado')),
  tipo_entrega TEXT NOT NULL CHECK (tipo_entrega IN ('delivery','retirada')),
  observacao   TEXT,
  id_cliente   UUID NOT NULL REFERENCES cliente(id_cliente) ON DELETE CASCADE,
  id_admin     INTEGER REFERENCES admin(id_admin) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS item_pedido (
  id_item     SERIAL PRIMARY KEY,
  id_pedido   INTEGER NOT NULL REFERENCES pedido(id_pedido) ON DELETE CASCADE,
  id_pizza    INTEGER NOT NULL REFERENCES pizza(id_pizza) ON DELETE RESTRICT,
  quantidade  INTEGER NOT NULL CHECK (quantidade > 0),
  observacoes TEXT
);

-- ---------- 7. CACHE DE CONTEÚDO GERADO POR IA ----------
CREATE TABLE IF NOT EXISTS conteudo_ia (
  id        SERIAL PRIMARY KEY,
  chave     TEXT NOT NULL UNIQUE,   -- ex.: 'visao_geral'
  titulo    TEXT,
  conteudo  TEXT NOT NULL,
  modelo    TEXT,
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Índices ----------
CREATE INDEX IF NOT EXISTS idx_pizza_destaque     ON pizza(destaque);
CREATE INDEX IF NOT EXISTS idx_pizza_cadastro     ON pizza(data_cadastro DESC);
CREATE INDEX IF NOT EXISTS idx_avaliacao_pizza    ON avaliacao(id_pizza);
CREATE INDEX IF NOT EXISTS idx_avaliacao_cliente  ON avaliacao(id_cliente);
CREATE INDEX IF NOT EXISTS idx_pedido_cliente     ON pedido(id_cliente);
CREATE INDEX IF NOT EXISTS idx_pedido_status      ON pedido(status);
CREATE INDEX IF NOT EXISTS idx_item_pedido        ON item_pedido(id_pedido);
