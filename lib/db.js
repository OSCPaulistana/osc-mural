'use strict';
// Conexão com o Postgres (Neon em produção, qualquer Postgres no desenvolvimento).
const { Pool, types } = require('pg');

// Colunas "date" voltam como texto AAAA-MM-DD, sem conversão de fuso.
types.setTypeParser(1082, (v) => v);

let pool;

function obterPool() {
  if (pool) return pool;
  const bruta = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!bruta) throw new Error('DATABASE_URL não está configurada.');
  // O Neon manda sslmode=require; verify-full mantém a verificação completa do certificado.
  const url = bruta.replace(/sslmode=(prefer|require|verify-ca)\b/, 'sslmode=verify-full');
  pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
  try {
    // Na Vercel (Fluid compute), fecha conexões ociosas antes de a instância dormir.
    require('@vercel/functions').attachDatabasePool(pool);
  } catch {}
  return pool;
}

async function consulta(texto, parametros = []) {
  const r = await obterPool().query(texto, parametros);
  return r.rows;
}

module.exports = { consulta, obterPool };
