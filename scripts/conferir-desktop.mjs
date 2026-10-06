export function validarConfiguracao(url, chave) {
  if (typeof chave !== 'string' || chave.length < 12 || /^\[.*\]$/.test(chave)) {
    throw new Error('A chave dos PCs não é válida. A Vercel não exporta segredos: sincronize a chave real antes de gerar o instalador.');
  }
  const destino = new URL(url);
  if (destino.protocol !== 'https:' || destino.username || destino.password || destino.pathname !== '/') {
    throw new Error('Configure MURAL_SITE_URL com a origem HTTPS do site.');
  }
  return destino.origin;
}

export async function conferirAcesso(url, chave) {
  const origem = validarConfiguracao(url, chave);
  const resposta = await fetch(`${origem}/api/dados`, {
    headers: { 'X-Mural-Chave': chave }, signal: AbortSignal.timeout(20_000),
  });
  if (!resposta.ok) throw new Error(`O servidor rejeitou a configuração do instalador (HTTP ${resposta.status}). Nenhum arquivo foi publicado.`);
  const dados = await resposta.json();
  if (!['sistemas', 'avisos', 'eventos', 'fotos'].every((campo) => Array.isArray(dados[campo]))) {
    throw new Error('A API não retornou o conteúdo esperado do mural.');
  }
  return origem;
}
