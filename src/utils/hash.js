// Hash de senha com scrypt (node:crypto) - nunca armazenar senha em texto puro.
// Formato salvo: scrypt$<salt_hex>$<hash_hex>
const crypto = require('crypto');

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, KEYLEN, SCRYPT_OPTS).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verificarSenha(senha, senhaHash) {
  try {
    const [algo, salt, hash] = String(senhaHash).split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const tentativa = crypto.scryptSync(senha, salt, KEYLEN, SCRYPT_OPTS);
    const esperado = Buffer.from(hash, 'hex');
    return tentativa.length === esperado.length && crypto.timingSafeEqual(tentativa, esperado);
  } catch {
    return false;
  }
}

module.exports = { hashSenha, verificarSenha };
