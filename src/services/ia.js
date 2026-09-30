// ============================================================
//  Requisito 3: consulta à plataforma de Inteligência Artificial
//  Provedor: Google Gemini (REST, sem SDK).
//  Usa structured output (responseMimeType + responseSchema) para
//  o modelo devolver JSON válido sempre.
// ============================================================

const CHAVE = () => (process.env.GEMINI_API_KEY || '').trim();
const MODELO = () => (process.env.GEMINI_MODELO || 'gemini-3.5-flash-lite').trim();
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const IA_DISPONIVEL = () => Boolean(CHAVE());

/**
 * O driver `pg` devolve colunas date/timestamp como objetos Date, não como
 * string. Esta função normaliza os dois formatos para "YYYY-MM-DD".
 */
const soData = (v) => {
  if (!v) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

/**
 * Consulta a IA e devolve o objeto JSON pedido.
 * @param {string} prompt
 * @param {object} schema  responseSchema no formato do Gemini
 */
async function consultarIA(prompt, schema, { temperatura = 0.7, maxTokens = 800 } = {}) {
  if (!IA_DISPONIVEL()) {
    throw Object.assign(new Error('IA não configurada: defina GEMINI_API_KEY no arquivo .env.'), { status: 503 });
  }

  const url = `${BASE}/${MODELO()}:generateContent`;
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CHAVE() },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: 'Você é o assistente da pizzaria PizzaTrom2000. Responda SEMPRE em português do Brasil e somente com JSON válido no formato pedido.' }],
      },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: temperatura,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    throw new Error(`Gemini respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
  }

  const dados = await resposta.json();
  const texto = dados?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!texto.trim()) throw new Error('A IA não retornou conteúdo. Tente novamente.');

  try {
    return JSON.parse(texto);
  } catch {
    // fallback: extrai o primeiro bloco { ... }
    const inicio = texto.indexOf('{');
    const fim = texto.lastIndexOf('}');
    if (inicio >= 0 && fim > inicio) return JSON.parse(texto.slice(inicio, fim + 1));
    throw new Error('Não foi possível interpretar a resposta da IA.');
  }
}

const TIPOS = {
  texto: { type: 'string' },
  listaTexto: { type: 'array', items: { type: 'string' } },
  inteiro: { type: 'integer' },
};

// ---------- Gera descrição + tags + sugestão para uma pizza ----------
async function gerarPizza(pizza) {
  const schema = {
    type: 'object',
    properties: {
      descricao: { type: 'string', description: 'Descrição apetitosa da pizza, até 240 caracteres, em português.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'De 3 a 5 tags curtas, como "vegetariana", "sem lactose".' },
      sugestao: { type: 'string', description: 'Uma frase curta de sugestão de acompanhamento para quem vai pedir esta pizza.' },
    },
    required: ['descricao', 'tags', 'sugestao'],
  };

  const prompt = `Pizza: "${pizza.nome}" (tamanho ${pizza.tamanho}, R$ ${Number(pizza.preco).toFixed(2)})
Ingredientes: ${pizza.ingredientes}

Gere uma descrição saborosa, tags e uma sugestão curta de acompanhamento.`;

  const r = await consultarIA(prompt, schema);
  return {
    ia_descricao: String(r.descricao || '').slice(0, 400),
    ia_tags: (Array.isArray(r.tags) ? r.tags : []).map((t) => String(t).slice(0, 60)).slice(0, 5),
    sugestao: String(r.sugestao || '').slice(0, 200),
  };
}

// ---------- Gera a "visão geral" da loja exibida na página principal ----------
async function gerarVisaoGeral(pizzas) {
  const schema = {
    type: 'object',
    properties: {
      titulo: { type: 'string' },
      texto: { type: 'string', description: 'Um parágrafo curto (até 400 caracteres) apresentando a loja com base nas pizzas cadastradas.' },
      destaques: { type: 'array', items: { type: 'string' }, description: 'Até 3 argumentos curtos de venda da loja.' },
    },
    required: ['titulo', 'texto', 'destaques'],
  };

  const lista = pizzas
    .map((p) => `- ${p.nome} (${p.tamanho}, R$ ${Number(p.preco).toFixed(2)}): ${p.ingredientes}${p.destaque ? ' [destaque]' : ''}`)
    .join('\n');

  const prompt = `Estas são as pizzas do cardápio da PizzaTrom2000:
${lista}

Escreva um texto curto e convidativo apresentando a loja para a página inicial.`;

  const r = await consultarIA(prompt, schema);
  return {
    titulo: String(r.titulo || 'PizzaTrom2000').slice(0, 80),
    conteudo: String(r.texto || '').slice(0, 600),
    tags: (Array.isArray(r.destaques) ? r.destaques : []).map((t) => String(t).slice(0, 60)).slice(0, 3),
  };
}

// ---------- Sugestão personalizada de combo (usa o histórico do cliente) ----------
async function gerarSugestaoCliente(cliente, pizzas, pedidos) {
  const schema = {
    type: 'object',
    properties: {
      mensagem: { type: 'string', description: 'Uma frase Personalized SHORT recomendando uma pizza do cardápio.' },
      id_pizza: { type: 'integer', description: 'ID da pizza recomendada (deve existir na lista enviada).' },
    },
    required: ['mensagem', 'id_pizza'],
  };

  const cardapio = pizzas.map((p) => `${p.id_pizza}: ${p.nome} (${p.tamanho}, R$ ${Number(p.preco).toFixed(2)})`).join('\n');
  const historico = pedidos.length
    ? pedidos.map((p) => `${soData(p.data_hora)} — ${p.itens}`).join('\n')
    : 'ainda sem pedidos';

  const prompt = `Cliente: ${cliente.nome}
Cardápio (id: nome - tamanho - preço):
${cardapio}
Histórico de pedidos: ${historico}

Recomende UMA pizza do cardápio e escreva uma frase curta de sugestão.`;

  return consultarIA(prompt, schema, { temperatura: 0.8, maxTokens: 300 });
}

module.exports = { consultarIA, gerarPizza, gerarVisaoGeral, gerarSugestaoCliente, IA_DISPONIVEL, MODELO, soData };
