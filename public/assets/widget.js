'use strict';
// Widget do Mural OSC. Roda dentro do app da área de trabalho (window.mural existe)
// ou em qualquer navegador, para pré-visualização.
(() => {
  const params = new URLSearchParams(location.search);
  const UNIDADE = params.get('unidade') || '';
  const app = window.mural || null;
  const naPrevia = window.top !== window;
  const $ = (id) => document.getElementById(id);

  const FOTO_MS = 8000;
  const VIDEO_MAX_S = 45;

  if (!app && !naPrevia) document.body.classList.add('navegador');

  const NOME_UNIDADE = { todas: 'Todas as unidades', assis: 'Assis', 'sao-paulo': 'São Paulo' };

  let dados = { sistemas: [], avisos: [], eventos: [], midias: [] };
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

  function linhaAviso(a, chegouAgora) {
    const meta = [];
    if (a.prioridade === 'urgente') meta.push('<b>Urgente</b>');
    if (a.prioridade === 'importante') meta.push('<b>Importante</b>');
    if (a.fixado) meta.push('Fixado');
    if (a.unidade !== 'todas') meta.push(esc(NOME_UNIDADE[a.unidade]));
    return `<article class="aviso ${esc(a.prioridade)}${chegouAgora ? ' chegou' : ''}" data-id="${esc(a.id)}">
      <span class="marca-p"></span>
      <h3>${esc(a.titulo)}</h3>
      <span class="quando">${relativo(a.criadoEm)}</span>
      ${a.texto ? `<p>${esc(a.texto)}</p>` : ''}
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

  function render() {
    $('data').textContent = maiuscula(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace('-feira', ''));

    const sistemas = dados.sistemas.map(blocoSistema).join('');
    $('sistemas').innerHTML = sistemas;
    $('sistemas').hidden = !sistemas;
    $('trilho-sistemas').innerHTML = sistemas;

    const novos = vistos ? dados.avisos.filter((a) => !vistos.has(a.id)) : [];
    $('avisos').innerHTML = dados.avisos.map((a) => linhaAviso(a, novos.includes(a))).join('')
      || '<p class="vazio">Nenhum aviso no momento.</p>';
    $('n-avisos').textContent = dados.avisos.length || '';
    $('trilho-bolha').textContent = dados.avisos.filter((a) => a.prioridade !== 'info').length || '';

    $('eventos').innerHTML = dados.eventos.map(linhaEvento).join('') || '<p class="vazio">Nada marcado por enquanto.</p>';

    galeria.atualizar(dados.midias || []);

    if (app) for (const a of novos) if (a.prioridade === 'urgente') app.notificar(a.titulo, a.texto);
    vistos = new Set(dados.avisos.map((a) => a.id));
    if (recolhido) avisarTamanhoDoTrilho();
  }

  // ---------- Galeria de fotos e vídeos ----------
  // Fotos ficam 8 s na tela; vídeos tocam sem som até o fim (no máximo 45 s).
  // Pausa com o mouse em cima, com o mural recolhido e quando o Windows informa que a
  // janela está coberta por outros programas, para não gastar processamento à toa.

  const galeria = {
    itens: [],
    chave: '',
    indice: 0,
    atual: null, // { item, el, decorrido }
    mouseEmCima: false,

    atualizar(midias) {
      const chave = midias.map((m) => `${m.id}:${m.url}:${m.legenda}:${m.data}`).join('|');
      if (chave === this.chave) return;
      const idAtual = this.atual?.item.id;
      this.chave = chave;
      this.itens = midias;
      $('galeria').hidden = !midias.length;
      $('g-contagem').textContent = midias.length > 1 ? `${midias.length}` : '';
      if (!midias.length) return this.limpar();
      const mesmo = midias.findIndex((m) => m.id === idAtual);
      if (mesmo >= 0) { this.indice = mesmo; this.legendar(midias[mesmo]); return; }
      this.mostrar(0);
    },

    parado() {
      return this.mouseEmCima || recolhido || document.hidden || !energiaAtiva;
    },

    legendar(m) {
      $('g-legenda').textContent = m.legenda;
      const d = dataDe(m.data);
      $('g-data').textContent = `${d.getDate()} de ${d.toLocaleDateString('pt-BR', { month: 'long' })}${m.tipo === 'video' ? ' · vídeo' : ''}`;
    },

    mostrar(i) {
      const m = this.itens[i];
      if (!m) return;
      this.indice = i;
      const palco = $('palco');
      const el = document.createElement(m.tipo === 'video' ? 'video' : 'img');
      el.className = 'camada';
      el.src = m.url;
      if (m.tipo === 'video') {
        el.muted = true;
        el.playsInline = true;
        el.preload = 'auto';
        el.addEventListener('ended', () => this.proxima(el));
      } else {
        el.alt = m.legenda;
        el.decoding = 'async';
      }
      el.addEventListener('error', () => setTimeout(() => this.proxima(el), 1000), { once: true });
      el.addEventListener(m.tipo === 'video' ? 'loadeddata' : 'load', () => {
        requestAnimationFrame(() => el.classList.add('visivel'));
        setTimeout(() => { for (const c of palco.querySelectorAll('.camada')) if (c !== el) c.remove(); }, 700);
        if (m.tipo === 'video' && !this.parado()) el.play().catch(() => {});
      }, { once: true });
      palco.prepend(el);
      this.atual = { item: m, el, decorrido: 0 };
      this.legendar(m);
      $('g-barra').style.width = '0%';
    },

    proxima(origem) {
      if (origem && this.atual?.el !== origem) return; // evento atrasado de uma mídia que já saiu
      if (this.itens.length === 1 && this.atual?.item.tipo === 'foto') { this.atual.decorrido = 0; return; }
      this.mostrar((this.indice + 1) % this.itens.length);
    },

    tick(ms) {
      const a = this.atual;
      if (!a) return;
      if (a.item.tipo === 'video') {
        const v = a.el;
        if (this.parado()) { if (!v.paused) v.pause(); return; }
        if (v.paused && v.readyState >= 2) v.play().catch(() => {});
        if (!v.duration) return;
        const total = Math.min(v.duration, VIDEO_MAX_S);
        $('g-barra').style.width = `${Math.min(100, (v.currentTime / total) * 100)}%`;
        if (v.currentTime >= VIDEO_MAX_S) this.proxima(v);
      } else {
        if (this.parado()) return;
        a.decorrido += ms;
        $('g-barra').style.width = `${Math.min(100, (a.decorrido / FOTO_MS) * 100)}%`;
        if (a.decorrido >= FOTO_MS) this.proxima(a.el);
      }
    },

    limpar() {
      for (const c of $('palco').querySelectorAll('.camada')) c.remove();
      this.atual = null;
    },
  };

  $('palco').addEventListener('click', () => galeria.proxima());
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
        mostrarAviso(naPrevia ? 'Sua sessão expirou. Entre de novo no admin.' : 'Este mural só abre pelo app instalado ou com login no admin.');
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const texto = await r.text();
      mostrarAviso('');
      if (texto !== ultimoTexto) {
        ultimoTexto = texto;
        dados = JSON.parse(texto);
        try { localStorage.setItem('mural:cache', texto); } catch {}
        render();
      }
    } catch {
      mostrarAviso('Sem conexão. Mostrando o último conteúdo recebido.');
      // Sem internet na hora de ligar o PC: mostra o último conteúdo conhecido em vez de um painel vazio.
      if (!vistos) {
        try {
          const cache = JSON.parse(localStorage.getItem('mural:cache'));
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
    const sistema = ev.target.closest('.sistema');
    if (sistema) return abrirSistema(sistema);
    const aviso = ev.target.closest('.aviso');
    if (aviso) aviso.classList.toggle('aberto');
  });
  $('btn-recolher').addEventListener('click', () => recolher(true));
  $('btn-expandir').addEventListener('click', () => recolher(false));
  $('trilho-avisos').addEventListener('click', () => recolher(false));

  // ---------- Início ----------

  let comecarRecolhido = false;
  try { comecarRecolhido = !naPrevia && localStorage.getItem('mural:recolhido') === '1'; } catch {}
  if (comecarRecolhido) recolher(true);

  carregar();
  setInterval(() => { if (vistos && !document.hidden) render(); }, 60_000); // atualiza "há X min", "Hoje" e a data
})();
