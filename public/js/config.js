// ============================================================
//  Configuração da API.
//
//  Em desenvolvimento o front roda na mesma origem do back,
//  então API_BASE fica vazio e basta usar caminho relativo.
//
//  Em produção o front fica na Vercel e o back no Render: troque
//  a linha abaixo pela URL do Render (o mesmo valor fica no
//  CORS_ORIGENS do servidor). O deploy script faz isso
//  automaticamente a partir da variável de ambiente RENDER_API_URL.
// ============================================================
window.__API_BASE__ = '';