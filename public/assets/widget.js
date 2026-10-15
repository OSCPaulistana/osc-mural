'use strict';
// Widget do Mural OSC. Roda dentro do app da área de trabalho (window.mural existe)
// ou em qualquer navegador, para pré-visualização.
(() => {
  const params = new URLSearchParams(location.search);
  const UNIDADE = params.get('unidade') || '';
  const CACHE = `mural:cache:${UNIDADE || 'todas'}`;
  const app = window.mural || null;
  const naPrevia = window.top !== window;
  const $ = (id) => document.getElementById(id);

  const FOTO_MS = 8000;
  const POR_ABA = 8;
  const PREFS = 'mural:sistemas';

  if (!app && !naPrevia) document.body.classList.add('navegador');
  if (app) document.body.classList.add('no-app');

  const NOME_UNIDADE = { todas: 'Todas as unidades', assis: 'Assis', 'sao-paulo': 'São Paulo' };

  let dados = { sistemas: [], avisos: [], eventos: [], elogios: [], secao: 'agenda', fotos: [] };
  let vistos = null; // ids dos avisos já exibidos; null até a primeira carga
  let recolhido = false;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icone = (n) => `<i class="ic" style="--i:url(/icones/${esc(n)}.svg)"></i>`;
  const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function dataDe(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d);
  }

  function diasAte(iso) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.round((dataDe(iso) - hoje) / 86400000);
  }

  function relativo(iso) {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ontem' : `${d} dias`;
  }

  function quandoEvento(iso) {
    const diff = diasAte(iso);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    return maiuscula(dataDe(iso).toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', ''));
  }

  const mes = (d) => d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');

  // ---------- Renderização ----------

  function blocoSistema(s) {
    const dica = s.descricao ? `${s.nome}: ${s.descricao}` : s.nome;
    const marca = s.logo ? `<img src="${esc(s.logo)}" alt="">` : icone(s.icone);
    return `<button class="sistema" data-id="${esc(s.id)}" title="${esc(dica)}">
      <span class="tile" style="--cor:var(--cor-${esc(s.cor)})">${marca}</span>
      <span class="rotulo">${esc(s.nome)}</span>
    </button>`;
  }

  // ---------- Atalhos: abas de 8 e preferências deste computador ----------
  // Cada colaborador escolhe quais atalhos aparecem e em que ordem. Fica salvo neste PC;
  // atalhos novos publicados pelo admin entram no fim da lista.

  let abaAtual = 0;
  let personalizando = false;

  function lerPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS));
      if (p && Array.isArray(p.ordem) && Array.isArray(p.ocultos)) return p;
    } catch {}
    return { ordem: [], ocultos: [] };
  }

  function salvarPrefs(p) {
    try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch {}
  }

  /** Todos os sistemas na ordem escolhida pelo colaborador. */
  function sistemasOrdenados() {
    const { ordem } = lerPrefs();
    const posicao = new Map(ordem.map((id, i) => [id, i]));
    return dados.sistemas
      .map((s, i) => ({ s, i }))
      .sort((a, b) => (posicao.get(a.s.id) ?? 1e6 + a.i) - (posicao.get(b.s.id) ?? 1e6 + b.i))
      .map((x) => x.s);
  }

  function sistemasVisiveis() {
    const ocultos = new Set(lerPrefs().ocultos);
    return sistemasOrdenados().filter((s) => !ocultos.has(s.id));
  }

  function renderSistemas() {
    const visiveis = sistemasVisiveis();
    const paginas = Math.max(1, Math.ceil(visiveis.length / POR_ABA));
    abaAtual = Math.min(abaAtual, paginas - 1);
    $('abas').innerHTML = paginas > 1
      ? Array.from({ length: paginas }, (_, i) => `<button class="aba${i === abaAtual ? ' ativa' : ''}" role="tab" aria-selected="${i === abaAtual}" data-aba="${i}" title="Atalhos ${i * POR_ABA + 1} a ${Math.min((i + 1) * POR_ABA, visiveis.length)}">${i + 1}</button>`).join('')
      : '<span class="titulo-sistemas">Sistemas</span>';
    const pagina = visiveis.slice(abaAtual * POR_ABA, (abaAtual + 1) * POR_ABA);
    $('sistemas').innerHTML = pagina.map(blocoSistema).join('')
      || '<p class="vazio">Nenhum atalho escolhido. Use o botão ao lado para escolher.</p>';
    $('trilho-sistemas').innerHTML = visiveis.map(blocoSistema).join('');
    $('bloco-sistemas').hidden = !dados.sistemas.length;
    if (personalizando) renderPersonalizar();
  }

  function renderPersonalizar() {
    const ocultos = new Set(lerPrefs().ocultos);
    const lista = sistemasOrdenados();
    $('lista-personalizar').innerHTML = lista.map((s, i) => {
      const visivel = !ocultos.has(s.id);
      const marca = s.logo ? `<img src="${esc(s.logo)}" alt="">` : icone(s.icone);
      return `<div class="item-p${visivel ? '' : ' oculto'}">
        <span class="tile" style="--cor:var(--cor-${esc(s.cor)})">${marca}</span>
        <span class="nome-p">${esc(s.nome)}</span>
        <button class="mini" data-p="mostrar" data-id="${esc(s.id)}" title="${visivel ? 'Esconder' : 'Mostrar'}" aria-pressed="${visivel}">${icone(visivel ? 'eye' : 'eye-off')}</button>
        <button class="mini" data-p="subir" data-id="${esc(s.id)}" title="Mover para cima"${i === 0 ? ' disabled' : ''}>${icone('chevron-up')}</button>
        <button class="mini" data-p="descer" data-id="${esc(s.id)}" title="Mover para baixo"${i === lista.length - 1 ? ' disabled' : ''}>${icone('chevron-down')}</button>
      </div>`;
    }).join('');
  }

  function personalizar(ativo) {
    personalizando = ativo;
    $('personalizar').hidden = !ativo;
    $('sistemas').hidden = ativo;
    $('abas').hidden = ativo;
    $('bloco-sistemas').classList.toggle('editando', ativo);
    $('btn-personalizar').classList.toggle('ativo', ativo);
    renderSistemas();
  }

  function mudarPreferencia(acao, id) {
    const prefs = lerPrefs();
    const ordem = sistemasOrdenados().map((s) => s.id);
    const i = ordem.indexOf(id);
    if (acao === 'mostrar') {
      prefs.ocultos = prefs.ocultos.includes(id) ? prefs.ocultos.filter((x) => x !== id) : [...prefs.ocultos, id];
    } else if (i >= 0) {
      const j = i + (acao === 'subir' ? -1 : 1);
      if (j < 0 || j >= ordem.length) return;
      [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
    }
    prefs.ordem = ordem;
    salvarPrefs(prefs);
    renderSistemas();
  }

  function linhaAviso(a, chegouAgora) {
    const meta = [];
    if (a.prioridade === 'urgente') meta.push('<b>Urgente</b>');
    if (a.prioridade === 'importante') meta.push('<b>Importante</b>');
    if (a.fixado) meta.push('Fixado');
    if (a.unidade !== 'todas') meta.push(esc(NOME_UNIDADE[a.unidade]));
    const anexo = a.anexoUrl
      ? (/[.](jpe?g|png|webp)$/i.test(a.anexoNome || a.anexoUrl)
        ? `<button class="anexo anexo-foto" data-anexo="${esc(a.anexoUrl)}" data-foto="1" data-legenda="${esc(a.anexoNome || a.titulo)}" type="button"><img src="${esc(a.anexoUrl)}" alt="" loading="lazy"><span>${esc(a.anexoNome || 'Foto anexada')}</span></button>`
        : `<button class="anexo" data-anexo="${esc(a.anexoUrl)}" type="button">${icone('paperclip')}<span>${esc(a.anexoNome || 'Abrir anexo')}</span></button>`)
      : '';
    return `<article class="aviso ${esc(a.prioridade)}${chegouAgora ? ' chegou' : ''}" data-id="${esc(a.id)}">
      <span class="marca-p"></span>
      <h3>${esc(a.titulo)}</h3>
      <span class="quando">${relativo(a.criadoEm)}</span>
      ${a.texto ? `<p>${esc(a.texto)}</p>` : ''}
      ${anexo}
      ${meta.length ? `<div class="meta">${meta.join(' · ')}</div>` : ''}
    </article>`;
  }

  function linhaEvento(e) {
    const dia = dataDe(e.data);
    const hoje = diasAte(e.data) === 0;
    const perto = diasAte(e.data) < 7;
    const quando = perto ? `<span class="quando-ev">${quandoEvento(e.data)}</span>` : '';
    const partes = [e.hora, e.local].filter(Boolean).map(esc);
    const detalhe = [quando, ...partes].filter(Boolean).join(' · ');
    return `<div class="evento${hoje ? ' hoje' : ''}">
      <div class="dia"><strong>${dia.getDate()}</strong><span>${mes(dia)}</span></div>
      <div class="info">
        <h3 title="${esc(e.titulo)}">${esc(e.titulo)}</h3>
        ${detalhe ? `<div class="detalhe">${detalhe}</div>` : ''}
      </div>
    </div>`;
  }

  function linhaElogio(e) {
    return `<div class="elogio">
      <span class="coracao">${icone('heart')}</span>
      <div class="info">
        <h3 title="${esc(e.titulo)}">${esc(e.titulo)}</h3>
        <p>${esc(e.texto)}</p>
        <div class="detalhe">${[relativo(e.criadoEm), e.unidade !== 'todas' ? esc(NOME_UNIDADE[e.unidade]) : ''].filter(Boolean).join(' · ')}</div>
      </div>
    </div>`;
  }

  function renderSecao() {
    const elogios = dados.secao === 'elogios';
    $('secao-titulo').textContent = elogios ? 'Elogios' : 'Agenda';
    if (!elogios) {
      $('secao-corpo').innerHTML = dados.eventos.map(linhaEvento).join('') || '<p class="vazio">Nada marcado por enquanto.</p>';
      return;
    }
    // O servidor já filtra pela vigência; aqui vai o reforço para o cache offline.
    const hoje = new Date().toLocaleDateString('sv-SE');
    const noAr = (dados.elogios || []).filter((e) => (!e.inicioEm || e.inicioEm <= hoje) && (!e.fimEm || e.fimEm >= hoje));
    $('secao-corpo').innerHTML = noAr.map(linhaElogio).join('') || '<p class="vazio">Nenhum elogio no momento.</p>';
  }

  // ---------- Foto do aviso em tamanho grande ----------

  function abrirVisor(url, legenda) {
    $('visor-img').src = url;
    $('visor-img').alt = legenda || 'Foto do aviso';
    $('visor-legenda').textContent = legenda || '';
    $('visor').hidden = false;
  }

  function fecharVisor() {
    $('visor').hidden = true;
    $('visor-img').removeAttribute('src');
  }

  function render() {
    $('data').textContent = maiuscula(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace('-feira', ''));

    renderSistemas();

    const novos = vistos ? dados.avisos.filter((a) => !vistos.has(a.id)) : [];
    $('avisos').innerHTML = dados.avisos.map((a) => linhaAviso(a, novos.includes(a))).join('')
      || '<p class="vazio">Nenhum aviso no momento.</p>';
    $('n-avisos').textContent = dados.avisos.length || '';
    $('trilho-bolha').textContent = dados.avisos.filter((a) => a.prioridade !== 'info').length || '';

    renderSecao();

    galeria.atualizar(dados.fotos || []);

    if (app) for (const a of novos) if (a.prioridade === 'urgente') app.notificar(a.titulo, a.texto);
    vistos = new Set(dados.avisos.map((a) => a.id));
    if (recolhido) avisarTamanhoDoTrilho();
  }

  // ---------- Fotos no rodapé ----------
  // Cada foto fica 8 s na tela. Pausa com o mouse em cima, com o mural recolhido e quando o
  // Windows informa que a janela está coberta, para não gastar processamento à toa.
  // Clicar abre a galeria completa, com todos os álbuns.

  const galeria = {
    itens: [],
    chave: '',
    indice: 0,
    atual: null, // { item, el, decorrido }
    mouseEmCima: false,

    atualizar(fotos) {
      const chave = fotos.map((f) => `${f.id}:${f.url}:${f.album}:${f.data}`).join('|');
      if (chave === this.chave) return;
      const idAtual = this.atual?.item.id;
      this.chave = chave;
      this.itens = fotos;
      $('galeria').hidden = !fotos.length;
      const albuns = new Set(fotos.map((f) => f.albumId)).size;
      $('g-contagem').textContent = albuns ? `${albuns} ${albuns === 1 ? 'álbum' : 'álbuns'}` : '';
      if (!fotos.length) return this.limpar();
      const mesmo = fotos.findIndex((f) => f.id === idAtual);
      if (mesmo >= 0) { this.indice = mesmo; this.legendar(fotos[mesmo]); return; }
      this.mostrar(0);
    },

    parado() {
      return this.mouseEmCima || recolhido || document.hidden || !energiaAtiva;
    },

    legendar(f) {
      $('g-legenda').textContent = f.legenda ? `${f.album} · ${f.legenda}` : f.album;
      const d = dataDe(f.data);
      $('g-data').textContent = `${d.getDate()} de ${d.toLocaleDateString('pt-BR', { month: 'long' })}`;
    },

    mostrar(i) {
      const f = this.itens[i];
      if (!f) return;
      this.indice = i;
      const palco = $('palco');
      const el = document.createElement('img');
      el.className = 'camada';
      el.alt = f.legenda || f.album;
      el.decoding = 'async';
      el.src = f.url;
      el.addEventListener('error', () => setTimeout(() => this.proxima(el), 1000), { once: true });
      el.addEventListener('load', () => {
        requestAnimationFrame(() => el.classList.add('visivel'));
        setTimeout(() => { for (const c of palco.querySelectorAll('.camada')) if (c !== el) c.remove(); }, 700);
      }, { once: true });
      palco.prepend(el);
      this.atual = { item: f, el, decorrido: 0 };
      this.legendar(f);
      $('g-barra').style.width = '0%';
    },

    proxima(origem) {
      if (origem && this.atual?.el !== origem) return; // evento atrasado de uma foto que já saiu
      if (this.itens.length === 1) { if (this.atual) this.atual.decorrido = 0; return; }
      this.mostrar((this.indice + 1) % this.itens.length);
    },

    tick(ms) {
      const a = this.atual;
      if (!a || this.parado()) return;
      a.decorrido += ms;
      $('g-barra').style.width = `${Math.min(100, (a.decorrido / FOTO_MS) * 100)}%`;
      if (a.decorrido >= FOTO_MS) this.proxima(a.el);
    },

    limpar() {
      for (const c of $('palco').querySelectorAll('.camada')) c.remove();
      this.atual = null;
    },
  };

  function abrirGaleria(albumId) {
    if (app?.abrirGaleria) return app.abrirGaleria(albumId || '');
    if (app) return toast('Atualize o Mural OSC para ver a galeria: baixe a versão nova no site.');
    const consulta = new URLSearchParams();
    if (albumId) consulta.set('album', albumId);
    if (UNIDADE) consulta.set('unidade', UNIDADE);
    window.open(`/galeria${consulta.size ? '?' + consulta : ''}`, '_blank', 'noopener');
  }

  $('palco').addEventListener('click', () => abrirGaleria(galeria.atual?.item.albumId));
  $('btn-galeria').addEventListener('click', () => abrirGaleria());
  $('palco').addEventListener('mouseenter', () => { galeria.mouseEmCima = true; });
  $('palco').addEventListener('mouseleave', () => { galeria.mouseEmCima = false; });
  setInterval(() => galeria.tick(200), 200);

  // ---------- Dados e tempo real ----------

  // O mural pergunta ao site se algo mudou: a cada 30 s com ele à vista, a cada 90 s quando está
  // coberto por programas, e para de perguntar com a tela bloqueada. Quando nada mudou, o site
  // responde "304" sem conteúdo (ETag), então cada consulta custa quase nada.
  const INTERVALO_VISIVEL = 30_000;
  const INTERVALO_COBERTO = 90_000;
  let energiaAtiva = true;
  let timerConsulta;
  let ultimoTexto = '';

  function mostrarAviso(texto) {
    $('offline').textContent = texto;
    $('offline').hidden = !texto;
  }

  async function carregar() {
    clearTimeout(timerConsulta);
    try {
      const r = await fetch('/api/dados' + (UNIDADE ? '?unidade=' + encodeURIComponent(UNIDADE) : ''), { cache: 'no-cache' });
      if (r.status === 401) {
        mostrarAviso(naPrevia ? 'Sua sessão expirou. Entre de novo no admin.' : app
          ? 'Instalação não autorizada. Baixe a versão atualizada no site do Mural OSC.'
          : 'Este mural só abre pelo app instalado ou com login no admin.');
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const texto = await r.text();
      mostrarAviso('');
      if (texto !== ultimoTexto) {
        ultimoTexto = texto;
        dados = JSON.parse(texto);
        try { localStorage.setItem(CACHE, texto); } catch {}
        render();
      }
    } catch {
      mostrarAviso('Sem conexão. Mostrando o último conteúdo recebido.');
      // Sem internet na hora de ligar o PC: mostra o último conteúdo conhecido em vez de um painel vazio.
      if (!vistos) {
        try {
          const cache = JSON.parse(localStorage.getItem(CACHE));
          if (cache) { dados = cache; render(); }
        } catch {}
      }
    } finally {
      agendar();
    }
  }

  function agendar() {
    clearTimeout(timerConsulta);
    if (!energiaAtiva) return;
    timerConsulta = setTimeout(carregar, document.hidden ? INTERVALO_COBERTO : INTERVALO_VISIVEL);
  }

  // Ao voltar a ficar à vista, confere na hora se chegou aviso novo.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && energiaAtiva) carregar(); });

  if (app?.onEnergia) {
    app.onEnergia((ativo) => {
      energiaAtiva = ativo;
      if (ativo) carregar();
      else clearTimeout(timerConsulta);
    });
  }

  // ---------- Ações ----------

  let timerToast;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('visivel');
    clearTimeout(timerToast);
    timerToast = setTimeout(() => t.classList.remove('visivel'), 2800);
  }

  async function abrirSistema(el) {
    const sistema = dados.sistemas.find((s) => s.id === el.dataset.id);
    if (!sistema) return;
    if (app) {
      const r = await app.abrir(sistema.id);
      if (!r.ok) toast(r.erro);
    } else if (sistema.tipo === 'site') {
      window.open(sistema.endereco, '_blank', 'noopener');
    } else {
      toast(`${sistema.nome} abre pelo app instalado nos PCs.`);
    }
  }

  function avisarTamanhoDoTrilho() {
    if (app) requestAnimationFrame(() => app.recolher(true, $('trilho').scrollHeight));
  }

  function recolher(valor) {
    recolhido = valor;
    $('painel').hidden = valor;
    $('trilho').hidden = !valor;
    try { localStorage.setItem('mural:recolhido', valor ? '1' : ''); } catch {}
    if (!app) return;
    if (valor) avisarTamanhoDoTrilho();
    else app.recolher(false, 0);
  }

  document.addEventListener('click', (ev) => {
    const anexo = ev.target.closest('[data-anexo]');
    if (anexo) {
      ev.stopPropagation();
      // Foto abre grandona dentro do mural; documento abre no navegador padrão.
      if (anexo.hasAttribute('data-foto')) { abrirVisor(anexo.dataset.anexo, anexo.dataset.legenda); return; }
      window.open(anexo.dataset.anexo, '_blank', 'noopener'); // https cai no shell.openExternal do Electron
      return;
    }
    const sistema = ev.target.closest('.sistema');
    if (sistema && !personalizando) return abrirSistema(sistema);
    const aba = ev.target.closest('[data-aba]');
    if (aba) { abaAtual = Number(aba.dataset.aba); return renderSistemas(); }
    const pref = ev.target.closest('[data-p]');
    if (pref) return mudarPreferencia(pref.dataset.p, pref.dataset.id);
    const aviso = ev.target.closest('.aviso');
    if (aviso) aviso.classList.toggle('aberto');
  });
  $('btn-personalizar').addEventListener('click', () => personalizar(!personalizando));
  $('p-concluir').addEventListener('click', () => personalizar(false));
  $('p-restaurar').addEventListener('click', () => { salvarPrefs({ ordem: [], ocultos: [] }); abaAtual = 0; renderSistemas(); });
  // Rolar o mouse sobre os atalhos troca de aba.
  $('sistemas').addEventListener('wheel', (ev) => {
    const paginas = Math.ceil(sistemasVisiveis().length / POR_ABA);
    if (paginas < 2) return;
    ev.preventDefault();
    abaAtual = Math.max(0, Math.min(paginas - 1, abaAtual + (ev.deltaY > 0 ? 1 : -1)));
    renderSistemas();
  }, { passive: false });
  $('btn-recolher').addEventListener('click', () => recolher(true));
  $('btn-expandir').addEventListener('click', () => recolher(false));
  $('trilho-avisos').addEventListener('click', () => recolher(false));
  $('visor-fechar').addEventListener('click', (ev) => { ev.stopPropagation(); fecharVisor(); });
  $('visor').addEventListener('click', (ev) => { if (ev.target === $('visor')) fecharVisor(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('visor').hidden) fecharVisor(); });

  // ---------- Início ----------

  let comecarRecolhido = false;
  try { comecarRecolhido = !naPrevia && localStorage.getItem('mural:recolhido') === '1'; } catch {}
  if (comecarRecolhido) recolher(true);

  carregar();
  setInterval(() => { if (vistos && !document.hidden) render(); }, 60_000); // atualiza "há X min", "Hoje" e a data
})();
