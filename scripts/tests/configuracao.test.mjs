import test from 'node:test';
import assert from 'node:assert/strict';
import { validarConfiguracao, conferirAcesso } from '../conferir-desktop.mjs';

test('o build recusa placeholders e credenciais ausentes ou curtas', () => {
  for (const chave of [undefined, '', '[SENSITIVE]', '[CHAVE_DE_EXEMPLO]', 'curta']) {
    assert.throws(() => validarConfiguracao('https://mural.example', chave), /chave/i);
  }
});
test('o destino de produção precisa ser uma origem HTTPS', () => {
  for (const url of ['http://mural.example', 'https://user:senha@mural.example', 'https://mural.example/qualquer']) {
    assert.throws(() => validarConfiguracao(url, 'credencial-de-teste'));
  }
  assert.equal(validarConfiguracao('https://mural.example/', 'credencial-de-teste'), 'https://mural.example');
});
test('um servidor que rejeita a chave impede a publicação', async () => {
  const anterior = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ erro: 'Não autorizado.' }), { status: 401 });
  try { await assert.rejects(conferirAcesso('https://mural.example', 'credencial-de-teste'), /HTTP 401/); }
  finally { globalThis.fetch = anterior; }
});
