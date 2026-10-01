// ============================================================
//  PizzaTrom2000 — painel administrativo
//
//  Requisitos atendidos aqui: 8 (área restrita), 9 (dashboard com
//  gráficos), 10 (CRUD do item principal), 11 (responder
//  avaliação, enviar e-mail, confirmar pedido, excluir).
// ============================================================

const API = (window.__API_BASE__ || '').replace(/\/$/, '');

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const dataHora = (iso) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '');

const STATUS_PEDIDO = [
  ['pendente', 'Pendente'], ['em_preparo', 'Em preparo'], ['pronto', 'Pronto'],
  ['saiu_entrega', 'Saiu para entrega'], ['entregue', 'Entregue'], ['cancelado', 'Cancelado'],
];
const CARGOS = ['gerente', 'atendente', 'cozinha'];
const TAMANHOS = ['Broto', 'Média', 'Grande', 'Família'];
const CORES = {
  pendente: '#f2b705', em_preparo: '#e08214', pronto: '#2f7a3f',
  saiu_entrega: '#2b6cb0', entregue: '#1a7f5a', cancelado: '#8a1919',
};

let adminAtual = null;
let permissoesTodas = [];
const graficos = {};

// ============================================================
//  API
// ============================================================
async function api(caminho, opcoes = {}) {
  const r = await fetch(API + caminho, {
    ...opcoes,
    headers: { ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}), ...(opcoes.headers || {}) },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    credentials: 'include',
  });
  if (r.status === 401) {
    // caminho absoluto na origem do front: não pode ser relativo, senão ao
    // abrir /admin/ o navegador resolveria como /admin/admin/login.html
    location.replace('/admin/login.html');
    throw new Error('Não autenticado.');
  }
}

let timerToast;
function avisar(msg, erro = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('toast--erro', erro);
  t.classList.add('visivel');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('visivel'), erro ? 4200 : 2500);
}

function seloStatus(status) {
  const mapa = {
    pendente: 'selo--amarelo', em_preparo: 'selo--amarelo', pronto: 'selo--verde',
    saiu_entrega: 'selo--verde', entregue: 'selo--verde', cancelado: 'selo--vermelho',
  };
  const texto = (STATUS_PEDIDO.find(([k]) => k === status) || [null, status])[1];
  return `<span class="selo ${mapa[status] || 'selo--neutro'}">${esc(texto)}</span>`;
}

let zModal = 100;
function modalAbrir(id) {
  const m = $(`#${id}`);
  m.style.zIndex = String(++zModal);
  m.classList.add('aberto');
  document.body.style.overflow = 'hidden';
}
function modalFechar(id) {
  $(`#${id}`).classList.remove('aberto');
  if (!$('.modal-fundo.aberto')) document.body.style.overflow = '';
}
$('#btn-fechar-detalhe').addEventListener('click', () => modalFechar('modal-detalhe'));
$$('.modal-fundo').forEach((f) => f.addEventListener('click', (e) => {
  if (e.target === f) modalFechar(f.id);
}));

// ============================================================
//  Formulário genérico em modal
//  campos: { name, label, type, value, required, options, attrs, hint }
//          type 'select' | 'textarea' | 'checks' | 'checkbox'
// ============================================================
function abrirFormulario(titulo, campos, textoBotao, aoEnviar) {
  $('#modal-form-titulo').textContent = titulo;
  const corpo = $('#modal-form-corpo');
  corpo.innerHTML = '';

  const form = document.createElement('form');
  campos.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'campo';

    if (c.type === 'checks') {
      div.innerHTML = `<label>${esc(c.label)}</label><div class="checks"></div>`;
      const box = div.querySelector('.checks');
      c.options.forEach((o) => {
        const lab = document.createElement('label');
        const marcado = (c.value || []).includes(o.id);
        lab.innerHTML = `<input type="checkbox" name="${esc(c.name)}" value="${esc(o.id)}" ${marcado ? 'checked' : ''}> ${esc(o.nome)}`;
        box.appendChild(lab);
      });
    } else if (c.type === 'select') {
      div.innerHTML = `<label>${esc(c.label)}</label><select name="${esc(c.name)}" ${c.required ? 'required' : ''}></select>`;
      const sel = div.querySelector('select');
      c.options.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        if (String(o.value) === String(c.value)) opt.selected = true;
        sel.appendChild(opt);
      });
    } else if (c.type === 'textarea') {
      div.innerHTML = `<label>${esc(c.label)}</label><textarea name="${esc(c.name)}" ${c.required ? 'required' : ''} ${c.attrs || ''}></textarea>`;
      div.querySelector('textarea').value = c.value ?? '';
    } else if (c.type === 'checkbox') {
      div.innerHTML = `<label style="display:flex;align-items:center;gap:9px;cursor:pointer;margin:0">
          <input type="checkbox" name="${esc(c.name)}" style="width:auto" ${c.value ? 'checked' : ''}>
          <span>${esc(c.label)}</span></label>`;
    } else {
      const tag = 'input';
      div.innerHTML = `<label>${esc(c.label)}</label>
        <input name="${esc(c.name)}" type="${c.type || 'text'}" value="${esc(c.value ?? '')}"
               ${c.required ? 'required' : ''} ${c.attrs || ''}>`;
    }
    if (c.hint) {
      const h = document.createElement('p');
      h.style.cssText = 'font-size:.78rem;color:var(--tinta-fraca);margin-top:5px';
      h.textContent = c.hint;
      div.appendChild(h);
    }
    form.appendChild(div);
  });

  const erro = document.createElement('p');
  erro.className = 'mensagem-erro';
  form.appendChild(erro);

  const acoes = document.createElement('div');
  acoes.className = 'modal-acoes';
  acoes.innerHTML = `<button type="button" class="btn btn--claro" data-cancelar>Cancelar</button>
                     <button type="submit" class="btn btn--principal">${esc(textoBotao)}</button>`;
  form.appendChild(acoes);
  corpo.appendChild(form);

  acoes.querySelector('[data-cancelar]').addEventListener('click', () => modalFechar('modal-form'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.textContent = '';
    const dados = {};
    campos.forEach((c) => {
      if (c.type === 'checks') {
        dados[c.name] = [...form.querySelectorAll(`input[name="${c.name}"]:checked`)].map((i) => i.value);
      } else if (c.type === 'checkbox') {
        dados[c.name] = form.elements[c.name].checked;
      } else {
        dados[c.name] = form.elements[c.name].value;
      }
    });
    const btn = acoes.querySelector('button[type="submit"]');
    const rotulo = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Salvando…';
    try {
      await aoEnviar(dados);
      modalFechar('modal-form');
    } catch (err) {
      erro.textContent = err.message;
      btn.disabled = false;
      btn.textContent = rotulo;
    }
  });

  modalAbrir('modal-form');
}

// ============================================================
//  Sessão e abas
// ============================================================
async function checarSessao() {
  const { admin } = await api('/api/auth/me');
  adminAtual = admin;
  $('#admin-nome').textContent = `${admin.nome} · ${admin.cargo}`;

  const mapa = {
    pedidos: 'gerenciar_pedidos',
    avaliacoes: 'gerenciar_avaliacoes',
    pizzas: 'gerenciar_pizzas',
    clientes: 'gerenciar_clientes',
    admins: 'gerenciar_admins',
    permissoes: 'gerenciar_permissoes',
  };
  const tem = (p) => admin.cargo === 'gerente' || admin.permissoes.includes(p);

  // O painel é a aba inicial e é só de leitura, então fica visível para
  // qualquer admin. As demais abas somem conforme as permissões da conta.
  // Importante: não trocar de aba aqui, senão a seção do dashboard fica
  // com display:none e o Chart.js desenha os gráficos em canvas 0x0.
  $$('#abas .aba').forEach((b) => {
    if (b.dataset.aba === 'dashboard') return;
    b.hidden = !tem(mapa[b.dataset.aba]);
  });
}

$('#btn-sair').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.replace('login.html');
});

function trocarAba(nome) {
  $$('#abas .aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nome));
  $$('.secao').forEach((s) => s.classList.toggle('ativa', s.id === `secao-${nome}`));
  // a seção acabou de sair de display:none; deixa o layout assentar antes
  // de pedir os dados, senão gráficos e listas medem 0x0.
  requestAnimationFrame(() => carregar[nome]?.());
}
$$('#abas .aba').forEach((b) => b.addEventListener('click', () => {
  if (b.hidden) return;
  trocarAba(b.dataset.aba);
}));

// ============================================================
//  REQUISITO 9 — DASHBOARD com gráficos
// ============================================================
async function carregarDashboard() {
  const d = await api('/api/admin/dashboard');

  $('#painel-data').textContent = `Resumo de ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}.`
    + (d.kpi.nota_media ? ` Nota média das avaliações: ${d.kpi.nota_media} de 5.` : '');

  $('#kpis').innerHTML = `
    ${kpi('Faturamento', fmt(d.kpi.faturamento), 'kpi--dinheiro')}
    ${kpi('Pedidos ativos', d.kpi.pedidos_ativos, 'kpi--tomate')}
    ${kpi('Ticket médio', fmt(d.kpi.ticket_medio))}
    ${kpi('Clientes', d.kpi.total_clientes)}
    ${kpi('Avaliações', d.kpi.total_avaliacoes)}
    ${kpi('Pizzas no cardápio', `${d.kpi.total_pizzas} (${d.kpi.total_destaques} em destaque)`)}`;

  grafico('g-status', {
    tipo: 'doughnut',
    dados: {
      labels: d.graficos.pedidos_por_status.map((x) => x.rotulo),
      datasets: [{
        data: d.graficos.pedidos_por_status.map((x) => x.valor),
        backgroundColor: d.graficos.pedidos_por_status.map((x) => corDoStatus(x.rotulo)),
        borderColor: '#fdf3dd',
        borderWidth: 2,
      }],
    },
    opcoes: {
      plugins: { legend: { position: 'right', labels: { color: '#2a1c18', font: { family: 'Archivo', size: 11 }, boxWidth: 12 } } },
    },
  });

  grafico('g-faturamento', {
    tipo: 'bar',
    dados: {
      labels: d.graficos.faturamento_7_dias.map((x) => x.rotulo),
      datasets: [{
        label: 'Faturamento',
        data: d.graficos.faturamento_7_dias.map((x) => x.valor),
        backgroundColor: '#2f7a3f',
        borderRadius: 3,
      }],
    },
    opcoes: escalaDinheiro('y'),
  });

  grafico('g-mais-pedidas', {
    tipo: 'bar',
    dados: {
      labels: d.graficos.pizzas_mais_pedidas.map((x) => x.rotulo),
      datasets: [{
        label: 'Unidades pedidas',
        data: d.graficos.pizzas_mais_pedidas.map((x) => x.valor),
        backgroundColor: '#c62828',
        borderRadius: 3,
      }],
    },
    opcoes: { indexAxis: 'y', ...escalaDinheiro('x'), plugins: { legend: { display: false } } },
  });

  grafico('g-notas', {
    tipo: 'radar',
    dados: {
      labels: d.graficos.nota_media_por_pizza.map((x) => x.rotulo),
      datasets: [{
        label: 'Nota média',
        data: d.graficos.nota_media_por_pizza.map((x) => x.valor),
        backgroundColor: 'rgba(242,183,5,.28)',
        borderColor: '#b58700',
        pointBackgroundColor: '#b58700',
        borderWidth: 2,
      }],
    },
    opcoes: {
      scales: { r: { min: 0, max: 5, ticks: { stepSize: 1, color: '#6b554d', font: { size: 10 } }, pointLabels: { color: '#2a1c18', font: { family: 'Archivo', size: 11 } }, grid: { color: '#ddcba3' } } },
      plugins: { legend: { display: false } },
    },
  });

  // listas de apoio
  $('#painel-avaliacoes').innerHTML = d.avaliacoesRecentes.length
    ? d.avaliacoesRecentes.map((a) => `
      <div class="avaliacao-item" style="border-bottom:1px dashed var(--borda-ticket);padding:9px 0">
        <div class="avaliacao-topo">
          <span class="avaliacao-autor">${esc(a.cliente_nome)} <span style="font-weight:400;color:var(--tinta-fraca)">em ${esc(a.pizza_nome)}</span></span>
          <span class="estrelas">${'★'.repeat(a.nota)}${'☆'.repeat(5 - a.nota)}</span>
        </div>
        <p class="avaliacao-comentario" style="font-size:.86rem">${esc(a.comentario || '')}</p>
        ${a.resposta ? '<span class="selo selo--verde" style="margin-top:5px">Respondida</span>' : '<span class="selo selo--amarelo" style="margin-top:5px">Sem resposta</span>'}
      </div>`).join('')
    : '<p class="carregando">Nenhuma avaliação ainda.</p>';

  $('#painel-clientes').innerHTML = d.clientesRecentes.length
    ? d.clientesRecentes.map((c) => `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px dashed var(--borda-ticket);font-size:.89rem">
        <span><strong>${esc(c.nome)}</strong><br><span style="color:var(--tinta-fraca);font-size:.8rem">${esc(c.email)}</span></span>
        <span style="color:var(--tinta-fraca);white-space:nowrap">${new Date(c.criado_em).toLocaleDateString('pt-BR')}</span>
      </div>`).join('')
    : '<p class="carregando">Nenhum cliente ainda.</p>';
}

function kpi(rotulo, valor, classe = '') {
  return `<div class="kpi ${classe}"><div class="kpi-rotulo">${esc(rotulo)}</div><div class="kpi-valor">${esc(valor)}</div></div>`;
}
function corDoStatus(rotulo) {
  const chave = Object.keys(CORES).find((k) => STATUS_PEDIDO.find(([c, t]) => c === k && t === rotulo));
  return CORES[chave] || '#6b554d';
}
function escalaDinheiro(eixo) {
  return {
    scales: {
      [eixo]: {
        beginAtZero: true,
        ticks: { color: '#6b554d', font: { size: 10 }, callback: (v) => (eixo === 'y' ? `R$ ${v}` : v) },
        grid: { color: 'rgba(221,203,163,.6)' },
      },
      [eixo === 'y' ? 'x' : 'y']: {
        ticks: { color: '#2a1c18', font: { family: 'Archivo', size: 11 } },
        grid: { display: false },
      },
    },
  };
}
function grafico(id, { tipo, dados, opcoes }) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof window.Chart === 'undefined') return;

  // Um canvas dentro de uma seção oculta tem 0x0 e o Chart.js guardaria
  // isso como tamanho final. Se acontecer, espera a próxima renderização.
  if (!canvas.parentElement.clientWidth) {
    requestAnimationFrame(() => requestAnimationFrame(() => grafico(id, { tipo, dados, opcoes })));
    return;
  }

  graficos[id]?.destroy();
  graficos[id] = new window.Chart(canvas, {
    type: tipo,
    data: dados,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: { legend: { labels: { color: '#2a1c18', font: { family: 'Archivo', size: 11 }, boxWidth: 12 } } },
      ...opcoes,
    },
  });
}

// requisito 3: o admin gera o texto da IA que aparece na home
$('#btn-gerar-ia').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Gerando…';
  try {
    const r = await api('/api/admin/ia/visao-geral', { method: 'POST' });
    avisar(`${r.mensagem} A página inicial já mostra o novo texto.`);
  } catch (err) {
    avisar(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Gerar texto da IA';
  }
});

// ============================================================
//  PEDIDOS (requisito 11)
// ============================================================
async function carregarPedidos() {
  const status = $('#filtro-status').value;
  const pedidos = await api(`/api/admin/pedidos${status ? `?status=${status}` : ''}`);
  const el = $('#lista-pedidos');
  if (!pedidos.length) {
    el.innerHTML = '<div class="vazio"><strong>Nenhum pedido com esse status</strong><p>Troque o filtro acima para ver os outros pedidos.</p></div>';
    return;
  }
  el.innerHTML = pedidos.map((p) => `
    <article class="pedido-card">
      <div class="info">
        <strong>#${p.id_pedido} — ${esc(p.cliente_nome)}</strong>
        <span class="sub">${p.tipo_entrega === 'delivery' ? '🛵 Delivery' : '🏃 Retirada no balcão'} · ${dataHora(p.data_hora)}</span>
        <span class="sub">📞 ${esc(p.cliente_telefone || 'sem telefone')} · ${esc(p.cliente_email)}</span>
        <span class="sub"><strong>Total: ${fmt(p.total)}</strong>${p.admin_nome ? ` · atendido por ${esc(p.admin_nome)}` : ''}</span>
      </div>
      ${seloStatus(p.status)}
      <div class="acoes-pedido">
        <button class="btn btn--claro btn--mini" data-ver="${p.id_pedido}">Detalhes</button>
        <select data-status="${p.id_pedido}" aria-label="Status do pedido ${p.id_pedido}">
          ${STATUS_PEDIDO.map(([v, l]) => `<option value="${v}" ${v === p.status ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        ${p.status === 'pendente'
          ? `<button class="btn btn--principal btn--mini" data-confirmar="${p.id_pedido}">Confirmar + e-mail</button>`
          : ''}
        <button class="btn btn--perigo btn--mini" data-excluir-pedido="${p.id_pedido}">Excluir</button>
      </div>
    </article>`).join('');
}

$('#filtro-status').addEventListener('change', carregarPedidos);

$('#lista-pedidos').addEventListener('change', async (e) => {
  const sel = e.target.closest('select[data-status]');
  if (!sel) return;
  try {
    await api(`/api/admin/pedidos/${sel.dataset.status}`, { method: 'PUT', body: { status: sel.value } });
    avisar('Status atualizado!');
  } catch (err) { avisar(err.message, true); }
  carregarPedidos();
  if ($('#secao-dashboard').classList.contains('ativa')) carregarDashboard();
});

$('#lista-pedidos').addEventListener('click', async (e) => {
  const ver = e.target.closest('[data-ver]');
  const confirmar = e.target.closest('[data-confirmar]');
  const excluir = e.target.closest('[data-excluir-pedido]');

  if (ver) {
    const p = await api(`/api/admin/pedidos/${ver.dataset.ver}`);
    $('#modal-detalhe-titulo').textContent = `Pedido #${p.id_pedido}`;
    $('#modal-detalhe-corpo').innerHTML = `
      <div class="detalhe-meta">
        <p><strong>Cliente:</strong> ${esc(p.cliente_nome)} — ${esc(p.cliente_telefone || 'sem telefone')}</p>
        <p><strong>E-mail:</strong> ${esc(p.cliente_email)}</p>
        <p><strong>Entrega:</strong> ${p.tipo_entrega === 'delivery' ? `🛵 ${esc(p.cliente_endereco || 'endereço não informado')}` : '🏃 Retirada no balcão'}</p>
        <p><strong>Feito em:</strong> ${dataHora(p.data_hora)} · ${seloStatus(p.status)}</p>
        ${p.observacao ? `<p><strong>Observação:</strong> ${esc(p.observacao)}</p>` : ''}
      </div>
      <div class="tabela-caixa"><table class="detalhe-itens">
        <thead><tr><th>Pizza</th><th>Tam.</th><th>Qtd</th><th>Unitário</th><th>Subtotal</th></tr></thead>
        <tbody>
          ${p.itens.map((i) => `<tr>
            <td><strong>${esc(i.pizza_nome)}</strong>${i.observacoes ? `<br><small style="color:var(--tinta-fraca)">Obs.: ${esc(i.observacoes)}</small>` : ''}</td>
            <td>${esc(i.tamanho)}</td><td>${i.quantidade}</td>
            <td>${fmt(i.preco)}</td><td>${fmt(i.preco * i.quantidade)}</td></tr>`).join('')}
        </tbody>
      </table></div>
      <p class="detalhe-total">Total: ${fmt(p.total)}</p>`;
    modalAbrir('modal-detalhe');
    return;
  }

  if (confirmar) {
    const id = confirmar.dataset.confirmar;
    try {
      const r = await api(`/api/admin/pedidos/${id}`, { method: 'PUT', body: { status: 'em_preparo', enviar_email: true } });
      avisar(r.email?.enviado
        ? `Pedido confirmado e e-mail enviado para ${''}`
        : `Pedido confirmado. ${r.email?.motivo || ''}`);
      carregarPedidos();
    } catch (err) { avisar(err.message, true); }
    return;
  }

  if (excluir && window.confirm('Excluir este pedido? Essa ação não pode ser desfeita.')) {
    try {
      await api(`/api/admin/pedidos/${excluir.dataset.excluirPedido}`, { method: 'DELETE' });
      avisar('Pedido excluído.');
      carregarPedidos();
    } catch (err) { avisar(err.message, true); }
  }
});

// ============================================================
//  AVALIAÇÕES (requisito 11)
// ============================================================
async function carregarAvaliacoes() {
  const apenasSemResposta = $('#filtro-avaliacoes').value === '1';
  const lista = await api(`/api/admin/avaliacoes${apenasSemResposta ? '?respondidas=0' : ''}`);
  const el = $('#lista-avaliacoes');

  if (!lista.length) {
    el.innerHTML = `<div class="vazio"><strong>${apenasSemResposta ? 'Todas as avaliações foram respondidas' : 'Nenhuma avaliação ainda'}</strong>
      <p>${apenasSemResposta ? 'Altere o filtro para ver o histórico completo.' : 'Assim que um cliente avaliar uma pizza, ela aparece aqui.'}</p></div>`;
    return;
  }

  el.innerHTML = lista.map((a) => `
    <article class="avaliacao-card" data-id="${a.id_avaliacao}">
      <div class="avaliacao-cab">
        <div class="avaliacao-quem">
          ${esc(a.cliente_nome)}
          <small>${esc(a.cliente_email)} · em ${esc(a.pizza_nome)} · ${dataHora(a.data)}</small>
        </div>
        <span class="estrelas">${'★'.repeat(a.nota)}${'☆'.repeat(5 - a.nota)}</span>
      </div>
      <p class="avaliacao-corpo">${esc(a.comentario || '')}</p>
      ${a.resposta
        ? `<div class="avaliacao-resposta"><b>Respondida por ${esc(a.admin_nome || 'equipe')}${a.resposta_em ? ` em ${dataHora(a.resposta_em)}` : ''}</b>${esc(a.resposta)}</div>`
        : '<span class="avaliacao-enviada" style="background:var(--queijo-claro);color:#8a6200;border-left-color:var(--queijo)">Ainda sem resposta da cozinha</span>'}
      <div class="avaliacao-acoes">
        <button class="btn btn--claro btn--mini" data-responder="${a.id_avaliacao}">${a.resposta ? 'Editar resposta' : 'Responder'}</button>
        <button class="btn btn--perigo btn--mini" data-excluir-avaliacao="${a.id_avaliacao}">Excluir avaliação</button>
      </div>
    </article>`).join('');
}
$('#filtro-avaliacoes').addEventListener('change', carregarAvaliacoes);

$('#lista-avaliacoes').addEventListener('click', async (e) => {
  const responder = e.target.closest('[data-responder]');
  const excluir = e.target.closest('[data-excluir-avaliacao]');

  if (responder) {
    const card = responder.closest('.avaliacao-card');
    const lista = await api('/api/admin/avaliacoes');
    const a = lista.find((x) => String(x.id_avaliacao) === responder.dataset.responder);
    abrirFormulario(`Responder ${a.pizza_nome}`, [
      { name: 'contexto', label: 'Avaliação do cliente', type: 'textarea', value: `${a.nota}/5 — ${a.cliente_nome}: "${a.comentario}"`, attrs: 'readonly' },
      { name: 'resposta', label: 'Sua resposta (aparece na página da pizza)', type: 'textarea', value: a.resposta || '', required: true, attrs: 'maxlength="800" placeholder="Ex.: Obrigado pelo retorno! Vamos ajustar o ponto da massa."' },
      { name: 'enviar_email', label: 'Enviar esta resposta por e-mail para o cliente', type: 'checkbox', value: false },
    ], 'Salvar resposta', async (d) => {
      const r = await api(`/api/admin/avaliacoes/${a.id_avaliacao}`, {
        method: 'PUT', body: { resposta: d.resposta, enviar_email: d.enviar_email },
      });
      avisar(r.email?.enviado ? 'Resposta salva e e-mail enviado!' : `${r.mensagem}${r.email?.motivo ? ` ${r.email.motivo}` : ''}`);
      card.remove();
      if (!$('#lista-avaliacoes').children.length) carregarAvaliacoes();
    });
    return;
  }

  if (excluir && window.confirm('Excluir esta avaliação? Ela sai da página da pizza e da média de estrelas.')) {
    try {
      await api(`/api/admin/avaliacoes/${excluir.dataset.excluirAvaliacao}`, { method: 'DELETE' });
      avisar('Avaliação excluída.');
      carregarAvaliacoes();
    } catch (err) { avisar(err.message, true); }
  }
});

// ============================================================
//  PIZZAS (requisito 10) — com destaque e geração por IA
// ============================================================
async function carregarPizzas() {
  const pizzas = await api('/api/admin/pizzas');
  const tb = $('#tab-pizzas');
  tb.innerHTML = pizzas.length ? '' : '<tr><td colspan="6"><p class="carregando">Nenhuma pizza cadastrada.</p></td></tr>';

  pizzas.forEach((p) => {
    const nota = p.nota_media != null ? Number(p.nota_media) : null;
    const estrelas = nota != null
      ? `<span class="estrelas">${'★'.repeat(Math.round(nota))}${'☆'.repeat(5 - Math.round(nota))}</span> ${nota.toFixed(1)} (${p.qtd_avaliacoes})`
      : '<span style="color:var(--tinta-fraca)">sem avaliações</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${esc(p.nome)}</strong>${p.destaque ? ' <span class="selo selo--amarelo">⭐ destaque</span>' : ''}
        ${p.ia_descricao ? '<br><small style="color:var(--tinta-fraca)">🤖 Texto gerado por IA</small>' : ''}
        <br><small style="color:var(--tinta-media)">${esc(p.ingredientes)}</small>
      </td>
      <td>${esc(p.tamanho)}</td>
      <td style="font-weight:700;font-variant-numeric:tabular-nums">${fmt(p.preco)}</td>
      <td>${estrelas}</td>
      <td>${esc(p.cadastrado_por || '—')}</td>
      <td><div class="acoes-linha">
        <button class="btn btn--claro btn--mini" data-editar="${p.id_pizza}">Editar</button>
        <button class="btn btn--claro btn--mini" data-ia="${p.id_pizza}" title="Gerar descrição e tags com IA">🤖 IA</button>
        <button class="btn btn--perigo btn--mini" data-excluir="${p.id_pizza}">Excluir</button>
      </div></td>`;
    tr._pizza = p;
    tb.appendChild(tr);
  });
}

function formPizza(pizza, aoEnviar) {
  abrirFormulario(pizza ? `Editar ${pizza.nome}` : 'Nova pizza', [
    { name: 'nome', label: 'Nome da pizza', value: pizza?.nome, required: true },
    { name: 'tamanho', label: 'Tamanho', type: 'select', value: pizza?.tamanho || 'Grande', options: TAMANHOS.map((t) => ({ value: t, label: t })) },
    { name: 'preco', label: 'Preço (R$)', type: 'number', value: pizza?.preco, required: true, attrs: 'min="0" step="0.01"' },
    { name: 'ingredientes', label: 'Ingredientes', type: 'textarea', value: pizza?.ingredientes, required: true, attrs: 'maxlength="300"' },
    { name: 'destaque', label: 'Marcar como destaque (aparece no topo da loja)', type: 'checkbox', value: pizza?.destaque },
  ], pizza ? 'Salvar' : 'Cadastrar', aoEnviar);
}

$('#btn-nova-pizza').addEventListener('click', () => formPizza(null, async (d) => {
  await api('/api/admin/pizzas', { method: 'POST', body: d });
  avisar('Pizza cadastrada!');
  carregarPizzas();
}));

$('#tab-pizzas').addEventListener('click', async (e) => {
  const editar = e.target.closest('[data-editar]');
  const excluir = e.target.closest('[data-excluir]');
  const ia = e.target.closest('[data-ia]');

  if (ia) {
    const btn = ia;
    btn.disabled = true;
    try {
      const r = await api(`/api/admin/ia/pizza/${ia.dataset.ia}`, { method: 'POST' });
      avisar(r.mensagem);
      carregarPizzas();
    } catch (err) { avisar(err.message, true); btn.disabled = false; }
    return;
  }
  if (editar) {
    const pizza = editar.closest('tr')._pizza;
    formPizza(pizza, async (d) => {
      await api(`/api/admin/pizzas/${pizza.id_pizza}`, { method: 'PUT', body: d });
      avisar('Pizza atualizada!');
      carregarPizzas();
    });
    return;
  }
  if (excluir && window.confirm('Excluir esta pizza do cardápio?')) {
    try {
      await api(`/api/admin/pizzas/${excluir.dataset.excluir}`, { method: 'DELETE' });
      avisar('Pizza excluída.');
      carregarPizzas();
    } catch (err) { avisar(err.message, true); }
  }
});

// ============================================================
//  CLIENTES
// ============================================================
async function carregarClientes() {
  const clientes = await api('/api/admin/clientes');
  const tb = $('#tab-clientes');
  tb.innerHTML = clientes.length ? '' : '<tr><td colspan="8"><p class="carregando">Nenhum cliente cadastrado.</p></td></tr>';

  clientes.forEach((c) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(c.nome)}</strong></td>
      <td>${esc(c.email)}</td>
      <td>${esc(c.telefone || '—')}</td>
      <td>${c.qtd_pedidos}</td>
      <td>${c.qtd_avaliacoes}</td>
      <td style="font-weight:700;font-variant-numeric:tabular-nums">${fmt(c.total_gasto)}</td>
      <td style="white-space:nowrap">${new Date(c.criado_em).toLocaleDateString('pt-BR')}</td>
      <td><div class="acoes-linha">
        <button class="btn btn--claro btn--mini" data-editar="${esc(c.id_cliente)}">Editar</button>
        <button class="btn btn--perigo btn--mini" data-excluir="${esc(c.id_cliente)}">Excluir</button>
      </div></td>`;
    tr._cliente = c;
    tb.appendChild(tr);
  });
}

$('#tab-clientes').addEventListener('click', async (e) => {
  const editar = e.target.closest('[data-editar]');
  const excluir = e.target.closest('[data-excluir]');

  if (editar) {
    const c = editar.closest('tr')._cliente;
    abrirFormulario(`Editar ${c.nome}`, [
      { name: 'nome', label: 'Nome', value: c.nome, required: true },
      { name: 'telefone', label: 'Telefone', value: c.telefone || '' },
      { name: 'endereco', label: 'Endereço', value: c.endereco || '' },
    ], 'Salvar', async (d) => {
      await api(`/api/admin/clientes/${c.id_cliente}`, { method: 'PUT', body: d });
      avisar('Cliente atualizado!');
      carregarClientes();
    });
    return;
  }
  if (excluir && window.confirm(`Excluir a conta de ${excluir.closest('tr')._cliente.nome}? Os pedidos e avaliações dela também serão removidos.`)) {
    try {
      await api(`/api/admin/clientes/${excluir.dataset.excluir}`, { method: 'DELETE' });
      avisar('Cliente excluído.');
      carregarClientes();
    } catch (err) { avisar(err.message, true); }
  }
});

// ============================================================
//  ADMINS
// ============================================================
async function carregarAdmins() {
  if (!permissoesTodas.length) permissoesTodas = await api('/api/admin/permissoes').catch(() => []);
  const admins = await api('/api/admin/admins');
  const tb = $('#tab-admins');
  tb.innerHTML = admins.length ? '' : '<tr><td colspan="6"><p class="carregando">Nenhum admin cadastrado.</p></td></tr>';

  admins.forEach((a) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(a.nome)}</strong></td>
      <td>${esc(a.email)}</td>
      <td>${esc(a.cargo)}</td>
      <td>${a.ativo ? '<span class="selo selo--verde">Ativo</span>' : '<span class="selo selo--vermelho">Inativo</span>'}</td>
      <td style="font-size:.8rem;color:var(--tinta-media)">${esc(a.permissoes.replace(/,/g, ', ') || '—')}</td>
      <td><div class="acoes-linha">
        <button class="btn btn--claro btn--mini" data-editar="${a.id_admin}">Editar</button>
        ${a.id_admin !== adminAtual.id_admin ? `<button class="btn btn--perigo btn--mini" data-excluir="${a.id_admin}">Excluir</button>` : '<span class="selo selo--neutro">você</span>'}
      </div></td>`;
    tr._admin = a;
    tb.appendChild(tr);
  });
}

function formAdmin(admin, aoEnviar) {
  const campos = [
    { name: 'nome', label: 'Nome', value: admin?.nome, required: true },
    { name: 'email', label: 'E-mail', type: 'email', value: admin?.email, required: true },
    { name: 'cargo', label: 'Cargo', type: 'select', value: admin?.cargo || 'atendente', options: CARGOS.map((c) => ({ value: c, label: c })) },
    { name: 'senha', label: admin ? 'Nova senha (deixe vazio para manter a atual)' : 'Senha', type: 'password', value: '', required: !admin, attrs: 'minlength="6" autocomplete="new-password"' },
  ];
  if (!admin && permissoesTodas.length) {
    campos.push({ name: 'permissoes', label: 'Permissões desta conta', type: 'checks', options: permissoesTodas, value: [] });
  }
  abrirFormulario(admin ? `Editar ${admin.nome}` : 'Novo administrador', campos, admin ? 'Salvar' : 'Cadastrar', aoEnviar);
}

$('#btn-novo-admin').addEventListener('click', () => formAdmin(null, async (d) => {
  const r = await api('/api/admin/admins', { method: 'POST', body: d });
  // atribui as permissões marcadas logo após criar a conta
  if (d.permissoes?.length) {
    await api(`/api/admin/permissoes/admin/${r.id_admin}`, { method: 'PUT', body: { permissoes: d.permissoes } });
  }
  avisar('Administrador cadastrado!');
  carregarAdmins();
}));

$('#tab-admins').addEventListener('click', async (e) => {
  const editar = e.target.closest('[data-editar]');
  const excluir = e.target.closest('[data-excluir]');

  if (editar) {
    const a = editar.closest('tr')._admin;
    if (!permissoesTodas.length) permissoesTodas = await api('/api/admin/permissoes').catch(() => []);
    abrirFormulario(`Editar ${a.nome}`, [
      { name: 'nome', label: 'Nome', value: a.nome, required: true },
      { name: 'email', label: 'E-mail', type: 'email', value: a.email, required: true },
      { name: 'cargo', label: 'Cargo', type: 'select', value: a.cargo, options: CARGOS.map((c) => ({ value: c, label: c })) },
      { name: 'ativo', label: 'Conta ativa (pode entrar no painel)', type: 'checkbox', value: a.ativo },
      { name: 'permissoes', label: 'Permissões desta conta', type: 'checks', options: permissoesTodas, value: a.permissoes.split(',').filter(Boolean) },
    ], 'Salvar', async (d) => {
      if (!d.senha) delete d.senha;
      await api(`/api/admin/admins/${a.id_admin}`, { method: 'PUT', body: d });
      await api(`/api/admin/permissoes/admin/${a.id_admin}`, { method: 'PUT', body: { permissoes: d.permissoes } });
      avisar('Administrador atualizado!');
      carregarAdmins();
    });
    return;
  }
  if (excluir && window.confirm('Excluir este administrador?')) {
    try {
      await api(`/api/admin/admins/${excluir.dataset.excluir}`, { method: 'DELETE' });
      avisar('Administrador excluído.');
      carregarAdmins();
    } catch (err) { avisar(err.message, true); }
  }
});

// ============================================================
//  PERMISSÕES
// ============================================================
async function carregarPermissoes() {
  const perms = await api('/api/admin/permissoes');
  permissoesTodas = perms.map((p) => ({ id: p.nome, nome: p.nome }));
  const tb = $('#tab-permissoes');
  tb.innerHTML = perms.length ? '' : '<tr><td colspan="4"><p class="carregando">Nenhuma permissão cadastrada.</p></td></tr>';

  perms.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code style="background:var(--massa-vazia);padding:2px 7px;border-radius:2px;font-size:.85em">${esc(p.nome)}</code></td>
      <td>${esc(p.descricao || '—')}</td>
      <td>${p.total_admins}</td>
      <td><div class="acoes-linha">
        <button class="btn btn--claro btn--mini" data-editar="${p.id_permissao}">Editar</button>
        <button class="btn btn--perigo btn--mini" data-excluir="${p.id_permissao}">Excluir</button>
      </div></td>`;
    tr._permissao = p;
    tb.appendChild(tr);
  });
}

function formPermissao(p, aoEnviar) {
  abrirFormulario(p ? `Editar ${p.nome}` : 'Nova permissão', [
    { name: 'nome', label: 'Nome (ex.: gerenciar_estoque)', value: p?.nome, required: true, attrs: 'pattern="[a-z0-9_]+" placeholder="gerenciar_estoque"' },
    { name: 'descricao', label: 'O que essa permissão libera', type: 'textarea', value: p?.descricao || '', attrs: 'maxlength="160"' },
  ], p ? 'Salvar' : 'Cadastrar', aoEnviar);
}

$('#btn-nova-permissao').addEventListener('click', () => formPermissao(null, async (d) => {
  await api('/api/admin/permissoes', { method: 'POST', body: d });
  avisar('Permissão cadastrada!');
  carregarPermissoes();
}));

$('#tab-permissoes').addEventListener('click', async (e) => {
  const editar = e.target.closest('[data-editar]');
  const excluir = e.target.closest('[data-excluir]');

  if (editar) {
    const p = editar.closest('tr')._permissao;
    formPermissao(p, async (d) => {
      await api(`/api/admin/permissoes/${p.id_permissao}`, { method: 'PUT', body: d });
      avisar('Permissão atualizada!');
      carregarPermissoes();
    });
    return;
  }
  if (excluir && window.confirm('Excluir esta permissão? Ela sai de todos os administradores.')) {
    try {
      await api(`/api/admin/permissoes/${excluir.dataset.excluir}`, { method: 'DELETE' });
      avisar('Permissão excluída!');
      carregarPermissoes();
    } catch (err) { avisar(err.message, true); }
  }
});

// ============================================================
//  arranque
// ============================================================
const carregar = {
  dashboard: carregarDashboard,
  pedidos: carregarPedidos,
  avaliacoes: carregarAvaliacoes,
  pizzas: carregarPizzas,
  clientes: carregarClientes,
  admins: carregarAdmins,
  permissoes: carregarPermissoes,
};

async function iniciar() {
  try {
    await checarSessao();
    if (adminAtual.cargo !== 'gerente' && !adminAtual.permissoes.includes('gerenciar_avaliacoes')) {
      $('#filtro-avaliacoes').disabled = true;
    }
    await carregarDashboard();
  } catch { /* api() já redirecionou */ }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();

// mantém o painel de pedidos e os gráficos atualizados sem recarregar a página
setInterval(() => {
  if ($('#secao-pedidos').classList.contains('ativa')) carregarPedidos().catch(() => {});
  if ($('#secao-dashboard').classList.contains('ativa')) carregarDashboard().catch(() => {});
}, 30000);