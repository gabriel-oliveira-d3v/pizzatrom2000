// ============================================================
//  PizzaTrom2000 — página do cliente
//
//  Cobre os requisitos 1 a 7 e 11 do enunciado:
//   1. destaques / últimos cadastrados / melhor avaliação
//   2. pesquisa + filtros + reexibição dos destaques
//   3. conteúdo da IA na página principal
//   4. login e cadastro do cliente
//   5. UUID do cliente no LocalStorage + reidratação
//   6. sem login, nenhuma interação com o item é liberada
//   7. "minhas interações": pedidos e avaliações
//  ============================================================

const API = (window.__API_BASE__ || '').replace(/\/$/, '');
const CHAVE_CLIENTE = 'cliente_id_pt2000';      // requisito 5: UUID no LocalStorage
const CHAVE_CARRINHO = 'carrinho_pt2000';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const dataBr = (iso) => (iso
  ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  : '');

// ---------- estado ----------
let cliente = null;                 // { id_cliente, nome, email, ... }
let pizzas = [];                    // lista já filtrada
let pizzaAberta = null;             // detalhe em exibição
let carrinho = lerJSON(CHAVE_CARRINHO, []);
let filtros = { busca: '', tamanho: '', ordenar: 'relevancia', destaque: false };
let ultimaInteracao = null;         // remember de onde veio um 401

function lerJSON(chave, padrao) {
  try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
}

// ============================================================
//  communication com a API
// ============================================================
async function api(caminho, opcoes = {}) {
  const cabecalhos = { ...(opcoes.headers || {}) };
  if (opcoes.body) cabecalhos['Content-Type'] = 'application/json';

  // requisito 5: o UUID guardado no LocalStorage viaja em toda requisição,
  // é isso que reidrata a sessão depois de um recarregamento da página.
  const uuid = localStorage.getItem(CHAVE_CLIENTE);
  if (uuid) cabecalhos['X-Cliente-Id'] = uuid;

  const r = await fetch(API + caminho, {
    ...opcoes,
    headers: cabecalhos,
    credentials: 'include',
  });

  let dados = null;
  try { dados = await r.json(); } catch { /* resposta sem corpo */ }

  if (!r.ok) {
    const err = new Error(dados?.erro || `Falha na requisição (${r.status}).`);
    err.status = r.status;
    throw err;
  }
  return dados;
}

async function apiSilencioso(caminho, opcoes = {}) {
  try { return await api(caminho, opcoes); } catch { return null; }
}

// ============================================================
//  aviso flutuante
// ============================================================
let timerToast;
function avisar(texto, erro = false) {
  const t = $('#toast');
  t.textContent = texto;
  t.classList.toggle('toast--erro', erro);
  t.classList.add('visivel');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('visivel'), erro ? 4200 : 2600);
}

// ============================================================
//  modais
// ============================================================
// O z-index cresce a cada abertura: assim um modal chamado de dentro
// de outro (ex.: login a partir do detalhe da pizza) fica por cima.
let zModal = 100;
function abrirModal(id) {
  const m = $(`#${id}`);
  m.style.zIndex = String(++zModal);
  m.classList.add('aberto');
  document.body.style.overflow = 'hidden';
}
function fecharModal(id) {
  $(`#${id}`).classList.remove('aberto');
  if (!$('.modal-fundo.aberto')) document.body.style.overflow = '';
}
$$('[data-fechar-modal]').forEach((b) => b.addEventListener('click', () => fecharModal(b.dataset.fecharModal)));
$$('.modal-fundo').forEach((f) => f.addEventListener('click', (e) => {
  if (e.target === f) fecharModal(f.id);
}));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const aberto = $('.modal-fundo.aberto');
    if (aberto) fecharModal(aberto.id);
  }
});

// ============================================================
//  REQUISITO 4 e 5 — sessão do cliente
// ============================================================
async function restaurarSessao() {
  // 1) tenta pelo cookie de sessão
  let dados = await apiSilencioso('/api/cliente/auth/me');
  // 2) sem cookie, usa o UUID do LocalStorage (reidratação)
  if (!dados && localStorage.getItem(CHAVE_CLIENTE)) {
    dados = await apiSilencioso('/api/cliente/auth/me', { headers: { 'X-Cliente-Id': localStorage.getItem(CHAVE_CLIENTE) } });
  }
  if (dados?.cliente) {
    cliente = dados.cliente;
    localStorage.setItem(CHAVE_CLIENTE, cliente.id_cliente); // reidratado: regrava
  } else {
    cliente = null;
    localStorage.removeItem(CHAVE_CLIENTE);
  }
  atualizarBotaoConta();
}

function atualizarBotaoConta() {
  const txt = $('#btn-conta-texto');
  const icone = $('#btn-conta-icone');
  const btnInteracoes = $('#btn-minhas-interacoes');
  if (cliente) {
    icone.textContent = '👋';
    txt.textContent = ` ${cliente.nome.split(' ')[0]}`;
    $('#btn-conta').title = `${cliente.nome} — sair da conta`;
    btnInteracoes.hidden = false;
  } else {
    icone.textContent = '👤';
    txt.textContent = ' Entrar';
    $('#btn-conta').title = 'Entrar ou criar conta';
    btnInteracoes.hidden = true;
  }
}

/** Grava a sessão no LocalStorage (requisito 5) e reflete isso na interface. */
function assumirSessao(d) {
  cliente = { id_cliente: d.id_cliente, nome: d.nome, email: d.email };
  localStorage.setItem(CHAVE_CLIENTE, cliente.id_cliente);
  atualizarBotaoConta();
}

/** Requisito 6: sem login, o clique devolve o modal de login. */
function exigirLogin(motivo) {
  ultimaInteracao = motivo || null;
  avisar(motivo || 'Entre na sua conta para continuar.', true);
  trocarAbaConta('login');
  $('#login-email').focus();
  abrirModal('modal-conta');
  return false;
}

function trocarAbaConta(qual) {
  const login = qual === 'login';
  $('#form-login').hidden = !login;
  $('#form-cadastro').hidden = login;
  $('#aba-login').setAttribute('aria-selected', String(login));
  $('#aba-cadastro').setAttribute('aria-selected', String(!login));
}

$('#aba-login').addEventListener('click', () => trocarAbaConta('login'));
$('#aba-cadastro').addEventListener('click', () => trocarAbaConta('cadastro'));
$('#btn-conta').addEventListener('click', () => {
  if (cliente) { carregarInteracoes(); abrirModal('modal-interacoes'); }
  else { trocarAbaConta('login'); abrirModal('modal-conta'); }
});
$('#btn-minhas-interacoes').addEventListener('click', () => {
  if (!cliente) return exigirLogin('Entre na sua conta para ver suas interações.');
  carregarInteracoes();
  abrirModal('modal-interacoes');
});

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erro = $('#login-erro');
  const btn = $('#btn-login');
  erro.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    const d = await api('/api/cliente/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#login-email').value.trim(),
        senha: $('#login-senha').value,
        manter_conectado: $('#login-manter').checked,
      }),
    });
    // requisito 5: guarda o UUID do cliente no LocalStorage
    assumirSessao(d);
    fecharModal('modal-conta');
    e.target.reset();
    avisar(`Bem-vindo de volta, ${cliente.nome.split(' ')[0]}! 🍕`);
    if (ultimaInteracao === 'avaliar') abrirFormAvaliacao();
    if (ultimaInteracao === 'carrinho') abrirCarrinho();
    ultimaInteracao = null;
    await recarregarTudo();
  } catch (err) {
    erro.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

$('#form-cadastro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erro = $('#cadastro-erro');
  const btn = $('#btn-cadastro');
  erro.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Criando…';
  try {
    const d = await api('/api/cliente/auth/cadastro', {
      method: 'POST',
      body: JSON.stringify({
        nome: $('#cad-nome').value.trim(),
        email: $('#cad-email').value.trim(),
        telefone: $('#cad-telefone').value.trim(),
        senha: $('#cad-senha').value,
        manter_conectado: $('#cad-manter').checked,
      }),
    });
    assumirSessao(d);
    fecharModal('modal-conta');
    e.target.reset();
    avisar(`Conta criada! Boas-vindas, ${cliente.nome.split(' ')[0]}. 🍕`);
    if (ultimaInteracao === 'avaliar') abrirFormAvaliacao();
    if (ultimaInteracao === 'carrinho') abrirCarrinho();
    ultimaInteracao = null;
    await recarregarTudo();
  } catch (err) {
    erro.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Criar conta';
  }
});

$('#btn-sair-conta').addEventListener('click', async () => {
  await apiSilencioso('/api/cliente/auth/logout', { method: 'POST' });
  cliente = null;
  localStorage.removeItem(CHAVE_CLIENTE);
  fecharModal('modal-interacoes');
  atualizarBotaoConta();
  avisar('Você saiu da conta.');
});

// ============================================================
//  REQUISITO 3 — conteúdo gerado por IA na página principal
// ============================================================
async function carregarTextoIA() {
  const d = await apiSilencioso('/api/ia/visao-geral');
  const marca = $('#marca-ia');
  if (!d) return;

  if (d.conteudo) {
    $('#vitrine-texto').textContent = d.conteudo;
    marca.hidden = false;
    marca.innerHTML = `<span aria-hidden="true">🤖</span> Texto escrito por <b>${esc(d.modelo)}</b> com base no nosso cardápio`;
  } else if (d.precisa_login) {
    // visitante anônimo: texto padrão + convite (a cota da IA só é gasta com login)
    marca.hidden = false;
    marca.innerHTML = '<span aria-hidden="true">🤖</span> Entre na sua conta para ver a sugestão da pizzar<b>IA</b>';
  } else if (!d.disponivel) {
    marca.hidden = false;
    marca.innerHTML = '<span aria-hidden="true">🤖</span> A IA entra no ar assim que a chave <b>GEMINI_API_KEY</b> estiver configurada';
  }

  // O botão de gerar outro texto só aparece para quem está logado como admin:
  // regenerar chama a API de IA, que é uma rota protegida.
  const me = await apiSilencioso('/api/auth/me');
  if (me?.admin) $('#btn-gerar-ia').hidden = false;
}

async function regenerarTextoIA() {
  const btn = $('#btn-gerar-ia');
  btn.disabled = true;
  btn.innerHTML = '<span aria-hidden="true">🤖</span> Gerando…';
  // `avisar` só existe para toasts do fluxo de conta; aqui usamos a própria marca
  const d = await apiSilencioso('/api/admin/ia/visao-geral', { method: 'POST' });
  btn.disabled = false;
  btn.innerHTML = '🔁 Gerar outro texto';

  if (!d || d.erro) {
    $('#marca-ia').innerHTML = `<span aria-hidden="true">🤖</span> Não deu para gerar agora (${esc(d?.erro || 'tente de novo')})`;
    return;
  }
  if (d.conteudo) $('#vitrine-texto').textContent = d.conteudo;
  $('#marca-ia').innerHTML = `<span aria-hidden="true">🤖</span> Texto escrito por <b>${esc(d.modelo)}</b> com base no nosso cardápio`;
}

document.addEventListener('DOMContentLoaded', () => {
  $('#btn-gerar-ia')?.addEventListener('click', regenerarTextoIA);
});

// ============================================================
//  REQUISITO 1 e 2 — destaques, listagem e filtros
// ============================================================
async function carregarCardapio() {
  const grade = $('#grade-pizzas');
  grade.innerHTML = '<p class="carregando">Carregando o cardápio…</p>';

  const query = new URLSearchParams();
  if (filtros.busca) query.set('busca', filtros.busca);
  if (filtros.tamanho) query.set('tamanho', filtros.tamanho);
  if (filtros.ordenar) query.set('ordenar', filtros.ordenar);
  if (filtros.destaque) query.set('destaque', '1');

  pizzas = await api(`/api/pizzas?${query}`);

  // popula o filtro de tamanho com os valores que existem de fato
  const sel = $('#tamanho');
  const tamanhos = [...new Set(pizzas.map((p) => p.tamanho))].sort();
  if (sel.dataset.valores !== tamanhos.join('|')) {
    sel.dataset.valores = tamanhos.join('|');
    sel.innerHTML = '<option value="">Todos</option>'
      + tamanhos.map((t) => `<option value="${esc(t)}"${t === filtros.tamanho ? ' selected' : ''}>${esc(t)}</option>`).join('');
  }

  if (!pizzas.length) {
    grade.innerHTML = `
      <div class="vazio" style="grid-column:1/-1;background:var(--massa);border:2px solid var(--tinta);border-radius:3px">
        <strong>Nenhuma pizza encontrada</strong>
        <p>Ajuste a busca ou limpe os filtros para ver o cardápio inteiro.</p>
        <button class="btn btn--claro" style="margin-top:14px" id="btn-limpar-vazio">Limpar filtros</button>
      </div>`;
    $('#btn-limpar-vazio')?.addEventListener('click', limparFiltros);
  } else {
    grade.innerHTML = pizzas.map(cartaoPizza).join('');
  }

  const n = pizzas.length;
  const texto = filtros.busca
    ? `${n} ${n === 1 ? 'resultado' : 'resultados'} para <b>${esc(filtros.busca)}</b>`
    : `${n} ${n === 1 ? 'pizza no cardápio' : 'pizzas no cardápio'}`;
  $('#resultado-contagem').innerHTML = texto;

  conectarBotoesPizza(grade);
}

async function carregarDestaques() {
  const bloco = $('#bloco-destaques');
  const grade = $('#grade-destaques');
  const d = await apiSilencioso('/api/pizzas/secoes');
  if (!d || !d.destaques?.length) { bloco.hidden = true; return; }

  grade.innerHTML = d.destaques.map((p) => cartaoPizza(p, true)).join('');
  bloco.hidden = false;
  conectarBotoesPizza(grade);
}

/** Cartão no formato de recorte de nota de pedido. */
function cartaoPizza(p, compacto = false) {
  const nota = p.nota_media != null ? Number(p.nota_media) : null;
  const estrelas = nota != null
    ? `<span class="estrelas">${'★'.repeat(Math.round(nota))}${'☆'.repeat(5 - Math.round(nota))}</span>`
    : '<span class="estrelas estrelas--vazia">☆☆☆☆☆</span>';

  return `
  <article class="ticket ${compacto ? '' : 'ticket--serrilhado'}" data-pizza="${p.id_pizza}">
    <div class="ticket-cab">
      <div>
        <span class="ticket-cod">Item ${String(p.id_pizza).padStart(3, '0')}${p.destaque ? ' · destaque' : ''}</span>
        <h3 class="ticket-nome">${esc(p.nome)}</h3>
      </div>
      <span class="ticket-preco">${fmt(p.preco)}<small>a unidade</small></span>
    </div>
    <div class="ticket-corpo">
      <span class="ticket-tamanho">${esc(p.tamanho)}</span>
      <p class="ticket-ingredientes">${esc(p.ingredientes)}</p>
      ${p.ia_descricao ? `<p class="ticket-ia">${esc(p.ia_descricao)}</p>` : ''}
      ${p.ia_tags?.length ? `<div class="ticket-tags">${p.ia_tags.map((t) => `<span class="ticket-tag">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="ticket-rodape">
        <span class="ticket-nota">${estrelas}${p.qtd_avaliacoes > 0 ? `<span class="qtd">(${p.qtd_avaliacoes})</span>` : ''}</span>
        <button class="btn btn--mini btn--principal" data-ver="${p.id_pizza}">Ver</button>
      </div>
    </div>
  </article>`;
}

/** Requisito 6: o botão só adiciona ao carrinho se o cliente estiver logado. */
function conectarBotoesPizza(raiz) {
  raiz.querySelectorAll('[data-ver]').forEach((btn) => {
    btn.addEventListener('click', () => abrirDetalhe(Number(btn.dataset.ver)));
  });
}

// ---------- filtros ----------
let timerBusca;
$('#busca').addEventListener('input', (e) => {
  clearTimeout(timerBusca);
  const valor = e.target.value;
  timerBusca = setTimeout(() => { filtros.busca = valor.trim(); carregarCardapio(); }, 320);
});
$('#tamanho').addEventListener('change', (e) => { filtros.tamanho = e.target.value; carregarCardapio(); });
$('#ordenar').addEventListener('change', (e) => { filtros.ordenar = e.target.value; carregarCardapio(); });
$('#form-pesquisa').addEventListener('submit', (e) => e.preventDefault());

$('[data-filtro-destaque]').addEventListener('click', (e) => {
  filtros.destaque = !filtros.destaque;
  e.currentTarget.setAttribute('aria-pressed', String(filtros.destaque));
  carregarCardapio();
});

$('#btn-limpar').addEventListener('click', limparFiltros);
function limparFiltros() {
  filtros = { busca: '', tamanho: '', ordenar: 'relevancia', destaque: false };
  $('#busca').value = '';
  $('#tamanho').value = '';
  $('#ordenar').value = 'relevancia';
  $('[data-filtro-destaque]').setAttribute('aria-pressed', 'false');
  carregarCardapio();
}

// ============================================================
//  REQUISITO 6 — detalhe da pizza, avaliações e avaliação própria
// ============================================================
async function abrirDetalhe(id) {
  const d = await apiSilencioso(`/api/pizzas/${id}`);
  if (!d) return avisar('Não foi possível carregar a pizza.', true);

  pizzaAberta = d.pizza;
  const p = d.pizza;
  const nota = p.nota_media != null ? Number(p.nota_media) : null;

  $('#modal-detalhe-titulo').textContent = p.nome;
  $('#detalhe-corpo').innerHTML = `
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:18px">
      <div style="flex:1;min-width:210px">
        <span class="ticket-tamanho">${esc(p.tamanho)} · item ${String(p.id_pizza).padStart(3, '0')}</span>
        <p class="detalhe-preco">${fmt(p.preco)}</p>
        <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="estrelas${nota == null ? ' estrelas--vazia' : ''}">${nota != null ? '★'.repeat(Math.round(nota)) + '☆'.repeat(5 - Math.round(nota)) : '☆☆☆☆☆'}</span>
          <span style="font-size:.87rem;color:var(--tinta-media)">
            ${nota != null ? `${nota.toFixed(1)} de 5` : 'Ainda sem avaliações'} · ${p.qtd_avaliacoes} ${p.qtd_avaliacoes === 1 ? 'avaliação' : 'avaliações'}
          </span>
        </div>
      </div>
      <div style="flex:1.4;min-width:230px">
        <p style="font-size:.92rem;line-height:1.6;color:var(--tinta-media)">${esc(p.ingredientes)}</p>
        ${p.ia_descricao ? `<p class="ticket-ia">🤖 ${esc(p.ia_descricao)}</p>` : ''}
        ${p.ia_tags?.length ? `<div class="ticket-tags">${p.ia_tags.map((t) => `<span class="ticket-tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>
    </div>

    <div class="campo">
      <label for="detalhe-obs">Alguma observação para esta pizza?</label>
      <input id="detalhe-obs" maxlength="200" placeholder="Ex.: sem cebola, massa fina">
    </div>

    <div style="border-top:3px solid var(--tinta);padding-top:16px;margin-top:6px">
      <h3 style="font-family:var(--display);font-weight:800;font-stretch:82%;font-size:1.15rem;margin-bottom:4px">O que acharam desta pizza</h3>
      <div id="lista-avaliacoes">${d.avaliacoes.length ? d.avaliacoes.map(itemAvaliacao).join('') : '<p class="avaliacao-comentario" style="color:var(--tinta-fraca)">Ainda ninguém avaliou. Seja o primeiro!</p>'}</div>
      <button class="btn btn--claro" style="margin-top:14px" id="btn-avaliar">
        ${d.jaAvaliou ? 'Atualizar minha avaliação' : 'Avaliar esta pizza'}
      </button>
    </div>

    <form id="form-avaliar" hidden style="margin-top:18px;padding-top:16px;border-top:2px dashed var(--borda-ticket)">
      <p class="campo-legenda campo-legenda--obrig">Sua nota</p>
      <div class="estrela-picker" id="estrela-picker" role="radiogroup" aria-label="Nota de 1 a 5"></div>
      <div class="campo" style="margin-top:14px">
        <label for="av-comentario">Comentário</label>
        <textarea id="av-comentario" maxlength="500" placeholder="Conte como foi a massa, o sabor, a entrega…"></textarea>
      </div>
      <p class="mensagem-erro" id="avaliar-erro"></p>
      <div class="modal-acoes" style="margin-top:6px">
        <button type="button" class="btn btn--claro" id="btn-cancelar-avaliar">Cancelar</button>
        <button type="submit" class="btn btn--principal" id="btn-enviar-avaliacao">Enviar avaliação</button>
      </div>
    </form>`;

  $('#btn-detalhe-adicionar').textContent = cliente ? 'Adicionar ao carrinho' : 'Entrar para pedir';
  $('#btn-detalhe-adicionar').onclick = () => {
    if (!cliente) return exigirLogin('Entre na sua conta para montar seu pedido.');
    const obs = $('#detalhe-obs').value.trim();
    adicionarAoCarrinho(p, obs);
    fecharModal('modal-detalhe');
    abrirCarrinho();
  };

  $('#btn-avaliar').onclick = () => {
    if (!cliente) return exigirLogin('Entre na sua conta para avaliar esta pizza.');
    abrirFormAvaliacao();
  };
  $('#btn-cancelar-avaliar').onclick = () => $('#form-avaliar').hidden = true;

  abrirModal('modal-detalhe');
}

function itemAvaliacao(a) {
  const estrelas = `<span class="estrelas">${'★'.repeat(a.nota)}${'☆'.repeat(5 - a.nota)}</span>`;
  return `
  <div class="avaliacao-item">
    <div class="avaliacao-topo">
      <span class="avaliacao-autor">${esc(a.cliente_nome)}</span>
      <span class="avaliacao-data">${dataBr(a.data)}</span>
    </div>
    <div style="margin-top:3px">${estrelas}</div>
    <p class="avaliacao-comentario">${esc(a.comentario)}</p>
    ${a.resposta ? `<div class="avaliacao-resposta"><b>Resposta da equipe${a.admin_nome ? ` — ${esc(a.admin_nome)}` : ''}</b>${esc(a.resposta)}</div>` : ''}
  </div>`;
}

function abrirFormAvaliacao() {
  const form = $('#form-avaliar');
  if (!form) return;
  form.hidden = false;
  $('#avaliar-erro').textContent = '';
  $('#av-comentario').value = '';

  // Requisito 6: sem login, o formulário nem aparece
  if (!cliente) return exigirLogin('Entre na sua conta para avaliar esta pizza.');

  const picker = $('#estrela-picker');
  let nota = 0;
  const montar = () => {
    picker.innerHTML = [1, 2, 3, 4, 5].map((n) => `
      <button type="button" role="radio" aria-checked="${n === nota}" aria-label="${n} ${n === 1 ? 'estrela' : 'estrelas'}"
              data-nota="${n}" data-preenchida="${n <= nota ? 1 : 0}">★</button>`).join('');
    picker.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => { nota = Number(b.dataset.nota); montar(); });
      b.addEventListener('mouseenter', () => {
        const alvo = Number(b.dataset.nota);
        picker.querySelectorAll('button').forEach((x) => { x.dataset.preenchida = Number(x.dataset.nota) <= alvo ? 1 : 0; });
      });
    });
  };
  montar();
  picker.addEventListener('mouseleave', () => montar(), { once: true });

  form.onsubmit = async (e) => {
    e.preventDefault();
    $('#avaliar-erro').textContent = '';
    if (!nota) { $('#avaliar-erro').textContent = 'Escolha uma nota de 1 a 5 estrelas.'; return; }
    const btn = $('#btn-enviar-avaliacao');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    try {
      const r = await api('/api/avaliacoes', {
        method: 'POST',
        body: JSON.stringify({
          id_pizza: pizzaAberta.id_pizza,
          nota,
          comentario: $('#av-comentario').value.trim(),
        }),
      });
      avisar(r.mensagem || 'Avaliação enviada!');
      form.hidden = true;
      await abrirDetalhe(pizzaAberta.id_pizza);   // recarrega o detalhe
      await recarregarTudo({ semDestaques: true });
    } catch (err) {
      $('#avaliar-erro').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar avaliação';
    }
  };
}

// ============================================================
//  Carrinho (LocalStorage) + checkout
// ============================================================
function salvarCarrinho() {
  localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(carrinho));
  atualizarBadge();
}
function atualizarBadge() {
  const badge = $('#carrinho-qtd');
  const n = carrinho.reduce((s, i) => s + i.quantidade, 0);
  badge.textContent = n;
  badge.hidden = n === 0;
}
function adicionarAoCarrinho(p, observacoes) {
  const chave = (i) => i.id_pizza === p.id_pizza && (i.observacoes || '') === (observacoes || '');
  const item = carrinho.find(chave);
  if (item) item.quantidade += 1;
  else carrinho.push({
    id_pizza: p.id_pizza, nome: p.nome, tamanho: p.tamanho,
    preco: Number(p.preco), quantidade: 1, observacoes: observacoes || null,
  });
  salvarCarrinho();
  avisar(`${p.nome} no carrinho! 🛒`);
}
function renderCarrinho() {
  const alvo = $('#carrinho-itens');
  if (!carrinho.length) {
    alvo.innerHTML = '<p style="color:var(--tinta-media);padding:14px 0">Seu carrinho está vazio. Escolha uma pizza no cardápio.</p>';
    $('#carrinho-total').innerHTML = '';
    $('#form-checkout').hidden = true;
    return;
  }
  $('#form-checkout').hidden = false;
  alvo.innerHTML = carrinho.map((i, idx) => `
    <div class="carrinho-linha">
      <div>
        <strong>${esc(i.nome)}</strong>
        <span style="font-size:.78rem;color:var(--tinta-fraca)">${esc(i.tamanho)}</span>
        ${i.observacoes ? `<span class="carrinho-obs">Obs.: ${esc(i.observacoes)}</span>` : ''}
      </div>
      <div class="qtd-ctrl">
        <button type="button" data-acao="diminuir" data-idx="${idx}" aria-label="Diminuir quantidade de ${esc(i.nome)}">−</button>
        <span class="qtd-num">${i.quantidade}</span>
        <button type="button" data-acao="aumentar" data-idx="${idx}" aria-label="Aumentar quantidade de ${esc(i.nome)}">+</button>
        <span class="qtd-preco">${fmt(i.preco * i.quantidade)}</span>
      </div>
    </div>`).join('');
  const total = carrinho.reduce((s, i) => s + i.preco * i.quantidade, 0);
  $('#carrinho-total').innerHTML = `<span>Total</span><span>${fmt(total)}</span>`;
}

$('#carrinho-itens').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-acao]');
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  if (btn.dataset.acao === 'aumentar') carrinho[idx].quantidade += 1;
  else {
    carrinho[idx].quantidade -= 1;
    if (carrinho[idx].quantidade < 1) carrinho.splice(idx, 1);
  }
  salvarCarrinho();
  renderCarrinho();
});

$('#btn-carrinho').addEventListener('click', () => {
  if (!carrinho.length) return avisar('Seu carrinho está vazio. Escolha uma pizza no cardápio.');
  abrirCarrinho();
});
function abrirCarrinho() {
  renderCarrinho();
  if (cliente?.endereco && !$('#endereco').value) $('#endereco').value = cliente.endereco;
  abrirModal('modal-carrinho');
}
$('#btn-fechar-carrinho').addEventListener('click', () => fecharModal('modal-carrinho'));

$('#tipo_entrega').addEventListener('change', (e) => {
  const delivery = e.target.value === 'delivery';
  $('#campo-endereco').hidden = !delivery;
  $('#endereco').required = delivery;
});
$('#tipo_entrega').dispatchEvent(new Event('change'));

$('#form-checkout').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erro = $('#checkout-erro');
  erro.textContent = '';
  if (!cliente) return exigirLogin('Entre na sua conta para enviar o pedido.');
  if (!carrinho.length) { erro.textContent = 'Adicione itens ao carrinho antes de finalizar.'; return; }

  const tipo = $('#tipo_entrega').value;
  const endereco = $('#endereco').value.trim();
  if (tipo === 'delivery' && !endereco) {
    erro.textContent = 'Informe o endereço de entrega.';
    return;
  }

  const btn = $('#btn-finalizar');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    const d = await api('/api/pedidos', {
      method: 'POST',
      body: JSON.stringify({
        tipo_entrega: tipo,
        endereco: tipo === 'delivery' ? endereco : null,
        observacao: $('#obs-pedido').value.trim() || null,
        itens: carrinho.map(({ id_pizza, quantidade, observacoes }) => ({ id_pizza, quantidade, observacoes })),
      }),
    });
    carrinho = [];
    salvarCarrinho();
    fecharModal('modal-carrinho');
    $('#sucesso-msg').innerHTML = `
      <p style="line-height:1.6;color:var(--tinta-media)">
        Pedido <strong style="color:var(--tinta)">#${d.id_pedido}</strong> confirmado.<br>
        Total de <strong style="color:var(--tinta)">${fmt(d.total)}</strong>.<br>
        ${d.resumo.map((r) => esc(`${r.quantidade}× ${r.nome}`)).join(', ')}.
      </p>
      <p style="margin-top:12px;font-size:.88rem;color:var(--tinta-fraca)">Já avisamos a cozinha. Você acompanha o status em “Minhas interações”.</p>`;
    abrirModal('modal-sucesso');
    e.target.reset();
    $('#tipo_entrega').dispatchEvent(new Event('change'));
  } catch (err) {
    if (err.status === 401) return exigirLogin('Sua sessão expirou. Entre de novo para enviar o pedido.');
    erro.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Finalizar pedido';
  }
});

$('#btn-ok').addEventListener('click', () => {
  fecharModal('modal-sucesso');
  carregarInteracoes();
  abrirModal('modal-interacoes');
});

// ============================================================
//  REQUISITO 7 — minhas interações
// ============================================================
$('#aba-pedidos').addEventListener('click', () => trocarAbaInteracao('pedidos'));
$('#aba-avaliacoes').addEventListener('click', () => trocarAbaInteracao('avaliacoes'));
let abaInteracao = 'pedidos';
function trocarAbaInteracao(qual) {
  abaInteracao = qual;
  $('#aba-pedidos').setAttribute('aria-selected', String(qual === 'pedidos'));
  $('#aba-avaliacoes').setAttribute('aria-selected', String(qual === 'avaliacoes'));
  renderInteracoes();
}

async function carregarInteracoes() {
  if (!cliente) return exigirLogin('Entre na sua conta para ver suas interações.');
  $('#interacoes-corpo').innerHTML = '<p class="carregando">Carregando…</p>';
  const d = await apiSilencioso('/api/cliente/interacoes');
  if (!d) {
    $('#interacoes-corpo').innerHTML = '<div class="vazio"><strong>Não foi possível carregar</strong><p>Verifique sua conexão e tente de novo.</p></div>';
    return;
  }
  dadosInteracoes = d;

  // requisito 3: sugestão personalizada da IA, a partir do histórico
  const sug = await apiSilencioso('/api/ia/sugestao');
  $('#interacoes-resumo').innerHTML = `
    <div class="sugestao-ia">
      <p class="marca-ia" style="margin:0;padding:0;background:none;border:0">
        <span aria-hidden="true">🤖</span> Sugestão personalizada pela IA
      </p>
      ${sug?.mensagem
        ? `<p class="sugestao-ia-texto">${esc(sug.mensagem)}</p>`
        : '<p class="sugestao-ia-texto" style="color:var(--tinta-media)">A IA entra no ar assim que a chave GEMINI_API_KEY estiver configurada.</p>'}
    </div>
    <div class="filtros-linha" style="margin-top:12px">
      <span class="resultado-contagem" style="margin:0;color:var(--tinta-media)">
        <b style="color:var(--tomate)">${d.resumo.total_pedidos}</b> pedidos ·
        <b style="color:var(--tomate)">${d.resumo.total_avaliacoes}</b> avaliações ·
        total gasto <b style="color:var(--tomate)">${fmt(d.resumo.total_gasto)}</b>
      </span>
    </div>`;

  renderInteracoes();
}

let dadosInteracoes = null;
function renderInteracoes() {
  if (!dadosInteracoes) return;
  const corpo = $('#interacoes-corpo');

  if (abaInteracao === 'pedidos') {
    if (!dadosInteracoes.pedidos.length) {
      corpo.innerHTML = '<div class="vazio"><strong>Você ainda não fez pedidos</strong><p>Escolha uma pizza no cardápio e seu histórico aparece aqui.</p></div>';
      return;
    }
    corpo.innerHTML = dadosInteracoes.pedidos.map((p) => `
      <div class="interacao-bloco">
        <div class="interacao-cab">
          <strong>Pedido #${p.id_pedido}</strong>
          ${seloStatus(p.status)}
        </div>
        <p style="font-size:.78rem;color:var(--tinta-fraca);margin-bottom:7px">
          ${dataBr(p.data_hora)} · ${p.tipo_entrega === 'delivery' ? 'Delivery' : 'Retirada no balcão'}
          ${p.observacao ? ` · obs.: ${esc(p.observacao)}` : ''}
        </p>
        <p class="interacao-itens">${p.itens.map((i) => `${i.quantidade}× ${esc(i.nome)} <span style="color:var(--tinta-fraca)">(${esc(i.tamanho)})</span>`).join('<br>')}</p>
        <p class="interacao-total" style="margin-top:9px">Total: ${fmt(p.total)}</p>
      </div>`).join('');
    return;
  }

  if (!dadosInteracoes.avaliacoes.length) {
    corpo.innerHTML = '<div class="vazio"><strong>Você ainda não avaliou nenhuma pizza</strong><p>Abra uma pizza no cardápio e conte como foi.</p></div>';
    return;
  }
  corpo.innerHTML = dadosInteracoes.avaliacoes.map((a) => `
    <div class="interacao-bloco">
      <div class="interacao-cab">
        <strong>${esc(a.pizza_nome)}</strong>
        <span class="estrelas">${'★'.repeat(a.nota)}${'☆'.repeat(5 - a.nota)}</span>
      </div>
      <p style="font-size:.78rem;color:var(--tinta-fraca);margin-bottom:6px">${dataBr(a.data)}</p>
      <p class="interacao-itens">${esc(a.comentario)}</p>
      ${a.resposta
        ? `<div class="avaliacao-resposta"><b>Resposta da equipe${a.admin_nome ? ` — ${esc(a.admin_nome)}` : ''}</b>${esc(a.resposta)}</div>`
        : '<p style="margin-top:8px;font-size:.82rem;color:var(--tinta-fraca);italic">A cozinha ainda não respondeu.</p>'}
    </div>`).join('');
}

const SELOS = {
  pendente: ['selo--amarelo', 'Pendente'],
  em_preparo: ['selo--amarelo', 'Em preparo'],
  pronto: ['selo--verde', 'Pronto'],
  saiu_entrega: ['selo--verde', 'Saiu para entrega'],
  entregue: ['selo--verde', 'Entregue'],
  cancelado: ['selo--vermelho', 'Cancelado'],
};
function seloStatus(status) {
  const [cor, texto] = SELOS[status] || ['selo--neutro', status];
  return `<span class="selo ${cor}">${texto}</span>`;
}

// ============================================================
//  arranque
// ============================================================
async function recarregarTudo(opcoes = {}) {
  await Promise.all([
    carregarCardapio(),
    carregarTextoIA(),
    opcoes.semDestaques ? Promise.resolve() : carregarDestaques(),
  ]);
}

(async () => {
  await restaurarSessao();
  await recarregarTudo();
  atualizarBadge();
})();