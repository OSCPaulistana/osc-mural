'use strict';
// Galeria do Mural OSC: todos os álbuns, as fotos de cada um e a foto em tela cheia.
// Abre numa janela própria pelo app instalado, ou numa aba para quem está no admin.
(() => {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const UNIDADE = params.get('unidade') || '';
  const noApp = params.get('app') === '1';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const miniatura = (url, largura = 1600) => typeof url === 'string'
    && url.includes('res.cloudinary.com') && /\/image\/upload\//.test(url) && !/\/image\/upload\/[^/]*[a-z]_/.test(url)
    ? url.replace('/image/upload/', `/image/upload/f_auto,q_auto,w_${largura}/`)
    : url;

  let albuns = [];
  let album = null; // álbum aberto
  let indice = -1; // foto em tela cheia

  function dataLonga(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  const contar = (n) => `${n} ${n === 1 ? 'foto' : 'fotos'}`;

  function mostrarAlbuns() {
    album = null;
    $('voltar').hidden = true;
    $('titulo').textContent = 'Galeria de fotos';
    $('subtitulo').textContent = albuns.length ? `${albuns.length} ${albuns.length === 1 ? 'álbum' : 'álbuns'}` : '';
    $('fotos').hidden = true;
    $('albuns').hidden = false;
    $('albuns').innerHTML = albuns.map((a) => `
      <button class="album" data-album="${esc(a.id)}" type="button">
        <span class="capa">${a.capa ? `<img src="${esc(miniatura(a.capa, 800))}" alt="" loading="lazy">` : ''}</span>
        <strong>${esc(a.titulo)}</strong>
        <span>${dataLonga(a.data)} · ${contar(a.fotos.length)}</span>
      </button>`).join('');
    $('vazio').hidden = albuns.length > 0;
    $('vazio').textContent = 'Ainda não há álbuns publicados.';
    history.replaceState(null, '', location.pathname + (UNIDADE || noApp ? `?${new URLSearchParams({ ...(noApp ? { app: '1' } : {}), ...(UNIDADE ? { unidade: UNIDADE } : {}) })}` : ''));
  }

  function abrirAlbum(id) {
    album = albuns.find((a) => a.id === id);
    if (!album) return mostrarAlbuns();
    $('voltar').hidden = false;
    $('titulo').textContent = album.titulo;
    $('subtitulo').textContent = `${dataLonga(album.data)} · ${contar(album.fotos.length)}`;
    $('albuns').hidden = true;
    $('fotos').hidden = false;
    $('fotos').innerHTML = album.fotos.map((f, i) => `
      <button class="foto" data-foto="${i}" type="button" title="${esc(f.legenda || 'Ampliar')}">
        <img src="${esc(miniatura(f.url, 800))}" alt="${esc(f.legenda)}" loading="lazy">
      </button>`).join('');
    $('vazio').hidden = album.fotos.length > 0;
    $('vazio').textContent = 'Este álbum ainda não tem fotos.';
    window.scrollTo(0, 0);
  }

  function ampliar(i) {
    if (!album || !album.fotos.length) return;
    indice = (i + album.fotos.length) % album.fotos.length;
    const f = album.fotos[indice];
    $('foto-grande').src = miniatura(f.url, 1920);
    $('foto-grande').alt = f.legenda || album.titulo;
    $('legenda-grande').textContent = f.legenda || album.titulo;
    $('posicao').textContent = `${indice + 1} de ${album.fotos.length}`;
    $('tela-cheia').hidden = false;
    // Deixa a próxima foto pronta para a navegação não piscar.
    const proxima = album.fotos[(indice + 1) % album.fotos.length];
    if (proxima) new Image().src = miniatura(proxima.url, 1920);
  }

  function fecharFoto() {
    $('tela-cheia').hidden = true;
    indice = -1;
  }

  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-album]');
    if (a) return abrirAlbum(a.dataset.album);
    const f = ev.target.closest('[data-foto]');
    if (f) return ampliar(Number(f.dataset.foto));
  });
  $('voltar').addEventListener('click', mostrarAlbuns);
  $('anterior').addEventListener('click', () => ampliar(indice - 1));
  $('proxima').addEventListener('click', () => ampliar(indice + 1));
  $('fechar-foto').addEventListener('click', fecharFoto);
  $('tela-cheia').addEventListener('click', (ev) => { if (ev.target === $('tela-cheia')) fecharFoto(); });
  $('fechar').addEventListener('click', () => window.close());
  document.addEventListener('keydown', (ev) => {
    if (!$('tela-cheia').hidden) {
      if (ev.key === 'ArrowLeft') ampliar(indice - 1);
      else if (ev.key === 'ArrowRight') ampliar(indice + 1);
      else if (ev.key === 'Escape') fecharFoto();
      return;
    }
    if (ev.key === 'Escape') {
      if (album) mostrarAlbuns();
      else if (noApp) window.close();
    }
  });

  async function carregar() {
    try {
      const r = await fetch('/api/galeria' + (UNIDADE ? `?unidade=${encodeURIComponent(UNIDADE)}` : ''), { cache: 'no-cache' });
      if (r.status === 401) throw new Error('A galeria só abre pelo app instalado ou com login no admin.');
      if (!r.ok) throw new Error('Não foi possível carregar a galeria. Tente de novo em instantes.');
      albuns = (await r.json()).albuns;
      const pedido = params.get('album');
      if (pedido && albuns.some((a) => a.id === pedido)) abrirAlbum(pedido);
      else mostrarAlbuns();
    } catch (erro) {
      $('vazio').hidden = false;
      $('vazio').textContent = erro.message;
    }
  }

  if (noApp) $('fechar').hidden = false;
  carregar();
})();
