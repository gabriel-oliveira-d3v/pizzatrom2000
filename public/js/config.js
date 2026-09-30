// ============================================================
//  Configuração da API.
//
//  Em desenvolvimento (localhost) o back e o front ficam na mesma
//  origem, então API_BASE fica vazio e basta usar caminho relativo.
//
//  Fora de localhost o front está na Vercel e o back no Render,
//  então apontamos direto para a API. Se o serviço mudar de nome
//  ou de região, troque a constante abaixo (e espelhe no
//  CORS_ORIGENS do servidor).
// ============================================================
window.__API_BASE__ = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? ''
  : 'https://pizzatrom2000.onrender.com';