'use strict';
// Painel do administrador do Mural OSC.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icone = (n) => `<i class="ic" style="--i:url(/icones/${esc(n)}.svg)"></i>`;

  const UNIDADES = [['todas', 'Todas as unidades'], ['assis', 'Assis'], ['sao-paulo', 'São Paulo']];
  const NOME_UNIDADE = Object.fromEntries(UNIDADES);
  const PRIORIDADES = [['info', 'Normal'], ['importante', 'Importante'], ['urgente', 'Urgente']];
  const ICONES_SISTEMA = ['building-2', 'cloud', 'briefcase', 'layout-dashboard', 'landmark', 'users', 'mail', 'calculator', 'file-text', 'folder',
    'chart-column', 'message-circle', 'shield-check', 'scale', 'receipt', 'monitor', 'headset', 'book-open', 'database', 'globe'];
  const CORES = ['grafite', 'petroleo', 'azul', 'ciano', 'verde', 'ambar', 'vermelho', 'roxo'];
  const TIPOS_MIDIA = { 'image/jpeg': 15, 'image/png': 15, 'image/webp': 15, 'video/mp4': 200, 'video/webm': 200 };

  const VISTAS = {
    avisos: {
      titulo: 'Avisos',
      subtitulo: 'O que todo mundo precisa ler hoje.',
      novo: 'Novo aviso',
      singular: 'aviso',
      campos: [
        { nome: 'titulo', rotulo: 'Título', tipo: 'texto', max: 90, obrig: true, placeholder: 'Manutenção do servidor no sábado' },
        { nome: 'texto', rotulo: 'Mensagem', tipo: 'area', max: 600 },
        { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'prioridade', padrao: 'info', ajuda: 'Urgente aparece no topo e também como notificação do Windows.' },
        { nome: 'unidade', rotulo: 'Quem vê', tipo: 'select', opcoes: UNIDADES, padrao: 'todas', metade: true },
        { nome: 'expiraEm', rotulo: 'Mostrar até', tipo: 'data', metade: true, ajuda: 'Em branco, fica até você remover.' },
        { nome: 'fixado', rotulo: 'Fixar no topo da lista', tipo: 'check' },
      ],
    },
    eventos: {
      titulo: 'Agenda',
      subtitulo: 'Reuniões, treinamentos, feriados e datas do escritório.',
      novo: 'Novo evento',
      singular: 'evento',
      campos: [
        { nome: 'titulo', rotulo: 'Título', tipo: 'texto', max: 90, obrig: true, placeholder: 'Treinamento do Domínio Folha' },
        { nome: 'data', rotulo: 'Data', tipo: 'data', obrig: true, metade: true },
        { nome: 'hora', rotulo: 'Horário', tipo: 'hora', metade: true, ajuda: 'Opcional.' },
        { nome: 'local', rotulo: 'Local', tipo: 'texto', max: 60, placeholder: 'Sala de reuniões', metade: true },
        { nome: 'unidade', rotulo: 'Quem vê', tipo: 'select', opcoes: UNIDADES, padrao: 'todas', metade: true },
      ],
    },
    midias: {
      titulo: 'Fotos e vídeos',
      subtitulo: 'Passam em sequência no rodapé do mural. As mais recentes aparecem primeiro.',
      novo: 'Enviar fotos e vídeos',
      singular: 'foto ou vídeo',
      campos: [
        { nome: 'legenda', rotulo: 'Legenda', tipo: 'texto', max: 90, obrig: true, placeholder: 'Café dos aniversariantes de setembro' },
        { nome: 'data', rotulo: 'Data do evento', tipo: 'data', obrig: true, metade: true },
        { nome: 'unidade', rotulo: 'Quem vê', tipo: 'select', opcoes: UNIDADES, padrao: 'todas', metade: true },
      ],
    },
    pcs: {
      titulo: 'Computadores',
      subtitulo: 'PCs com o mural instalado. Cada um avisa a cada 5 minutos que está ligado.',
      novo: 'Baixar instalador',
      singular: 'computador',
      campos: [],
    },
    sistemas: {
      titulo: 'Sistemas',
      subtitulo: 'Atalhos do topo do mural. A ordem desta lista é a ordem nos PCs.',
      novo: 'Novo sistema',
      singular: 'sistema',
      campos: [
        { nome: 'nome', rotulo: 'Nome', tipo: 'texto', max: 24, obrig: true, placeholder: 'Domínio', metade: true },
        { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', max: 60, placeholder: 'Sistema contábil', metade: true },
        { nome: 'tipo', rotulo: 'O atalho abre', tipo: 'opcoes', opcoes: [['site', 'Um site'], ['programa', 'Um programa do PC']], padrao: 'site' },
        { nome: 'endereco', rotulo: 'Endereço', tipo: 'texto', max: 400, obrig: true },
        { nome: 'logo', rotulo: 'Logo', tipo: 'logo' },
        { nome: 'icone', rotulo: 'Ícone, se não houver logo', tipo: 'icones', padrao: 'globe' },
        { nome: 'cor', rotulo: 'Cor do ícone', tipo: 'cores', padrao: 'grafite' },
      ],
    },
  };

  const AJUDA_ENDERECO = {
    site: { placeholder: 'https://', ajuda: 'Abre no navegador padrão do colaborador.' },
    programa: { placeholder: 'C:\\Pasta\\programa.exe', ajuda: 'Caminho completo do .exe ou .lnk. Se o programa não existir no PC, o mural avisa o colaborador.' },
  };

  let dados = { sistemas: [], avisos: [], eventos: [], midias: [], pcs: [] };
  let vista = 'avisos';
  let editando = null; // id do item em edição, ou null para novo
  let envio = null; // arquivos escolhidos para enviar

  // ---------- API ----------

  async function api(metodo, url, corpo, tipoConteudo) {
    const bruto = corpo instanceof Blob;
    const r = await fetch(url, {
      method: metodo,
      headers: corpo ? { 'Content-Type': bruto ? tipoConteudo : 'application/json' } : {},
      body: corpo ? (bruto ? corpo : JSON.stringify(corpo)) : undefined,
    });
    const json = await r.json().catch(() => null);
    if (r.status === 401 && url !== '/api/login') { mostrarLogin(); throw new Error('Sessão expirada. Entre de novo.'); }
    if (!r.ok) throw new Error(json?.erro || 'Não deu certo. Tente de novo.');
    return json;
  }

  // ---------- Formatação ----------

  const hojeIso = () => new Date().toLocaleDateString('sv-SE');
  function dataDe(iso) { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); }
  const dataCurta = (iso) => dataDe(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  const mes = (d) => d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  function relativo(iso) {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ontem' : `há ${d} dias`;
  }

  // ---------- Listas ----------

  const acoes = (id, extras = '') => `<div class="acoes">${extras}
      <button class="btn-ico" data-acao="editar" data-id="${esc(id)}" title="Editar">${icone('pencil')}</button>
      <button class="btn-ico perigo" data-acao="excluir" data-id="${esc(id)}" title="Excluir">${icone('trash-2')}</button>
    </div>`;

  function linhaAviso(a) {
    const expirado = a.expiraEm && a.expiraEm < hojeIso();
    const meta = [];
    if (expirado) meta.push(`Saiu do mural em ${dataCurta(a.expiraEm)}`);
    else {
      if (a.prioridade !== 'info') meta.push(`<b class="${esc(a.prioridade)}">${a.prioridade === 'urgente' ? 'Urgente' : 'Importante'}</b>`);
      if (a.fixado) meta.push('Fixado');
      meta.push(esc(NOME_UNIDADE[a.unidade]));
      if (a.expiraEm) meta.push(`até ${dataCurta(a.expiraEm)}`);
    }
    meta.push(`publicado ${relativo(a.criadoEm)}`);
    return `<div class="linha${expirado ? ' passado' : ''}">
      <span class="marca-p ${expirado ? '' : esc(a.prioridade)}"></span>
      <div class="linha-info"><strong>${esc(a.titulo)}</strong>${a.texto ? `<p>${esc(a.texto)}</p>` : ''}<div class="meta">${meta.join(' · ')}</div></div>
      ${acoes(a.id)}
    </div>`;
  }

  function linhaEvento(e) {
    const passou = e.data < hojeIso();
    const hoje = e.data === hojeIso();
    const dia = dataDe(e.data);
    const meta = [
      dia.toLocaleDateString('pt-BR', { weekday: 'long' }),
      e.hora,
      e.local && esc(e.local),
      esc(NOME_UNIDADE[e.unidade]),
    ].filter(Boolean);
    return `<div class="linha${passou ? ' passado' : ''}">
      <div class="dia${hoje ? ' hoje' : ''}"><strong>${dia.getDate()}</strong><span>${mes(dia)}</span></div>
      <div class="linha-info"><strong>${esc(e.titulo)}</strong><div class="meta">${meta.join(' · ')}${passou ? ' · já passou' : ''}</div></div>
      ${acoes(e.id)}
    </div>`;
  }

  function linhaSistema(s, i, total) {
    const mover = `<button class="btn-ico" data-acao="subir" data-id="${esc(s.id)}" title="Mover para cima"${i === 0 ? ' disabled' : ''}>${icone('arrow-up')}</button>
      <button class="btn-ico" data-acao="descer" data-id="${esc(s.id)}" title="Mover para baixo"${i === total - 1 ? ' disabled' : ''}>${icone('arrow-down')}</button>`;
    const marca = s.logo ? `<img src="${esc(s.logo)}" alt="">` : icone(s.icone);
    return `<div class="linha">
      <span class="tile" style="--cor:var(--cor-${esc(s.cor)})">${marca}</span>
      <div class="linha-info">
        <strong>${esc(s.nome)}</strong>${s.descricao ? ` <span class="meta">· ${esc(s.descricao)}</span>` : ''}
        <div class="meta">${s.tipo === 'site' ? 'Site' : 'Programa'} · <code>${esc(s.endereco)}</code></div>
      </div>
      ${acoes(s.id, mover)}
    </div>`;
  }

  function cartaoMidia(m) {
    const d = dataDe(m.data);
    const previa = m.tipo === 'video'
      ? `<video src="${esc(m.url)}#t=1" muted preload="metadata"></video><span class="tipo">${icone('play')}Vídeo</span>`
      : `<img src="${esc(m.url)}" alt="" loading="lazy">`;
    return `<figure class="midia">
      <div class="thumb">${previa}${acoes(m.id).replace('class="acoes"', 'class="acoes sobre"')}</div>
      <figcaption class="midia-rodape">
        <strong title="${esc(m.legenda)}">${esc(m.legenda)}</strong>
        <span>${d.getDate()} ${mes(d)} · ${esc(NOME_UNIDADE[m.unidade])}</span>
      </figcaption>
    </figure>`;
  }

  function linhaPc(p) {
    const meta = [
      esc(p.usuario || 'usuário desconhecido'),
      esc(NOME_UNIDADE[p.unidade] || p.unidade),
      p.versao ? `versão ${esc(p.versao)}` : '',
      p.online ? '<b class="online">ligado agora</b>' : `visto ${relativo(p.vistoEm)}`,
    ].filter(Boolean);
    return `<div class="linha${p.online ? '' : ' passado'}">
      <span class="marca-p${p.online ? ' online' : ''}"></span>
      <div class="linha-info"><strong>${esc(p.computador || p.id)}</strong><div class="meta">${meta.join(' · ')}</div></div>
      <div class="acoes"><button class="btn-ico perigo" data-acao="excluir" data-id="${esc(p.id)}" title="Tirar da lista">${icone('trash-2')}</button></div>
    </div>`;
  }

  function ordenados() {
    const h = hojeIso();
    if (vista === 'avisos') {
      const peso = { urgente: 0, importante: 1, info: 2 };
      return [...dados.avisos].sort((a, b) =>
        (Boolean(a.expiraEm && a.expiraEm < h) - Boolean(b.expiraEm && b.expiraEm < h))
        || ((a.prioridade !== 'urgente') - (b.prioridade !== 'urgente')) || (b.fixado - a.fixado)
        || (peso[a.prioridade] - peso[b.prioridade]) || b.criadoEm.localeCompare(a.criadoEm));
    }
    if (vista === 'eventos') {
      return [...dados.eventos].sort((a, b) => ((a.data < h) - (b.data < h)) || a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''));
    }
    if (vista === 'midias') {
      return [...dados.midias].sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
    }
    if (vista === 'pcs') return dados.pcs;
    return dados.sistemas;
  }

  function render() {
    const v = VISTAS[vista];
    $('titulo').textContent = v.titulo;
    $('subtitulo').textContent = v.subtitulo;
    $('novo-rotulo').textContent = v.novo;
    for (const a of document.querySelectorAll('.menu a')) a.classList.toggle('ativo', a.dataset.vista === vista);

    const h = hojeIso();
    $('c-avisos').textContent = dados.avisos.filter((a) => !a.expiraEm || a.expiraEm >= h).length || '';
    $('c-eventos').textContent = dados.eventos.filter((e) => e.data >= h).length || '';
    $('c-midias').textContent = dados.midias.length || '';
    $('c-sistemas').textContent = dados.sistemas.length || '';
    $('c-pcs').textContent = dados.pcs.length || '';

    const itens = ordenados();
    if (vista === 'midias') {
      const zona = `<label class="soltar" id="soltar">${icone('image-plus')}<div><strong>Arraste fotos e vídeos para cá</strong>
        <span>ou clique para escolher. Fotos JPG, PNG ou WEBP até 15 MB. Vídeos MP4 ou WEBM até 200 MB, sem som no mural.</span></div></label>`;
      $('conteudo').innerHTML = zona + (itens.length ? `<div class="grade-midias">${itens.map(cartaoMidia).join('')}</div>` : '');
      return;
    }
    if (!itens.length) {
      $('conteudo').innerHTML = vista === 'pcs'
        ? '<div class="vazio"><strong>Nenhum computador ainda</strong>Instale o mural pela página de instalação e o PC aparece aqui em alguns segundos.</div>'
        : `<div class="vazio"><strong>Nenhum ${v.singular} ainda</strong>Use “${v.novo}” para publicar o primeiro.</div>`;
      return;
    }
    const linha = { avisos: linhaAviso, eventos: linhaEvento, pcs: linhaPc }[vista] || linhaSistema;
    $('conteudo').innerHTML = `<div class="tabela">${itens.map((item, i) => linha(item, i, itens.length)).join('')}</div>`;
  }

  async function recarregar() {
    dados = await api('GET', '/api/admin/dados');
    mostrarConectados(dados.conectados);
    render();
  }

  function mostrarConectados(total) {
    $('n-conectados').textContent = total === 0 ? 'Nenhum PC conectado' : total === 1 ? '1 PC conectado agora' : `${total} PCs conectados agora`;
  }

  // ---------- Formulário ----------

  function campoHtml(c, valor) {
    const id = `f-${c.nome}`;
    const metade = c.metade ? ' metade' : '';
    const ajuda = `<div class="ajuda" id="${id}-ajuda">${esc(c.ajuda || '')}</div>`;
    const v = valor ?? c.padrao ?? '';
    switch (c.tipo) {
      case 'texto':
      case 'area': {
        const contador = c.max ? `<span class="contador" id="${id}-n">${String(v).length}/${c.max}</span>` : '';
        const entrada = c.tipo === 'area'
          ? `<textarea id="${id}" name="${c.nome}" maxlength="${c.max}">${esc(v)}</textarea>`
          : `<input class="input" id="${id}" name="${c.nome}" maxlength="${c.max}" value="${esc(v)}" placeholder="${esc(c.placeholder || '')}">`;
        return `<div class="campo${metade}"><label class="rotulo" for="${id}">${esc(c.rotulo)}${contador}</label>${entrada}${c.ajuda || c.nome === 'endereco' ? ajuda : ''}</div>`;
      }
      case 'data':
      case 'hora':
        return `<div class="campo${metade}"><label class="rotulo" for="${id}">${esc(c.rotulo)}</label>
          <input class="input" type="${c.tipo === 'data' ? 'date' : 'time'}" id="${id}" name="${c.nome}" value="${esc(v)}">${c.ajuda ? ajuda : ''}</div>`;
      case 'select':
        return `<div class="campo${metade}"><label class="rotulo" for="${id}">${esc(c.rotulo)}</label>
          <select id="${id}" name="${c.nome}">${c.opcoes.map(([o, r]) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>${c.ajuda ? ajuda : ''}</div>`;
      case 'check':
        return `<div class="campo"><label class="check"><input type="checkbox" name="${c.nome}"${v === true ? ' checked' : ''}>${esc(c.rotulo)}</label></div>`;
      case 'prioridade':
        return `<div class="campo"><span class="rotulo">${esc(c.rotulo)}</span><div class="opcoes">${PRIORIDADES.map(([o, r]) =>
          `<label><input type="radio" name="${c.nome}" value="${o}"${o === v ? ' checked' : ''}><span class="marca-p ${o}"></span>${r}</label>`).join('')}</div>${ajuda}</div>`;
      case 'opcoes':
        return `<div class="campo"><span class="rotulo">${esc(c.rotulo)}</span><div class="opcoes">${c.opcoes.map(([o, r]) =>
          `<label><input type="radio" name="${c.nome}" value="${o}"${o === v ? ' checked' : ''}>${esc(r)}</label>`).join('')}</div></div>`;
      case 'icones':
        return `<div class="campo"><span class="rotulo">${esc(c.rotulo)}</span><div class="grade-icones">${ICONES_SISTEMA.map((n) =>
          `<label title="${n}"><input type="radio" name="${c.nome}" value="${n}"${n === v ? ' checked' : ''}>${icone(n)}</label>`).join('')}</div></div>`;
      case 'cores':
        return `<div class="campo"><span class="rotulo">${esc(c.rotulo)}</span><div class="cores">${CORES.map((n) =>
          `<label title="${n}" style="--c:var(--cor-${n})"><input type="radio" name="${c.nome}" value="${n}"${n === v ? ' checked' : ''}></label>`).join('')}</div></div>`;
      case 'logo':
        return `<div class="campo"><span class="rotulo">${esc(c.rotulo)}</span><div class="logo-campo">
          <span class="tile" id="logo-previa">${v ? `<img src="${esc(v)}" alt="">` : icone('image')}</span>
          <input type="hidden" name="logo" value="${esc(v)}">
          <button class="btn" type="button" id="logo-enviar">${v ? 'Trocar' : 'Enviar logo'}</button>
          <button class="btn" type="button" id="logo-remover"${v ? '' : ' hidden'}>Remover</button>
          <span class="ajuda">PNG com fundo transparente fica melhor.</span>
        </div></div>`;
      default:
        return '';
    }
  }

  function ajustarEndereco() {
    const tipo = document.querySelector('input[name="tipo"]:checked')?.value;
    const campo = $('f-endereco');
    if (!tipo || !campo) return;
    campo.placeholder = AJUDA_ENDERECO[tipo].placeholder;
    $('f-endereco-ajuda').textContent = AJUDA_ENDERECO[tipo].ajuda;
  }

  function abrirDialogo(titulo, html, rotuloSalvar) {
    $('dialogo-titulo').textContent = titulo;
    $('campos').innerHTML = html;
    $('erro-form').hidden = true;
    $('salvar').disabled = false;
    $('salvar').textContent = rotuloSalvar;
    ajustarEndereco();
    $('dialogo').showModal();
    $('campos').querySelector('input.input, textarea')?.focus();
  }

  function abrirFormulario(id) {
    const v = VISTAS[vista];
    envio = null;
    editando = id || null;
    const item = id ? dados[vista].find((x) => x.id === id) : null;
    abrirDialogo(item ? `Editar ${v.singular}` : v.novo, v.campos.map((c) => campoHtml(c, item?.[c.nome])).join(''), item ? 'Salvar' : 'Publicar');
  }

  function abrirEnvio(arquivos) {
    const recusados = [];
    const aceitos = [];
    for (const f of arquivos) {
      const limite = TIPOS_MIDIA[f.type];
      if (!limite) recusados.push(`${f.name} (formato não aceito)`);
      else if (f.size > limite * 1024 * 1024) recusados.push(`${f.name} (maior que ${limite} MB)`);
      else aceitos.push(f);
    }
    if (!aceitos.length) return toast(recusados.length ? `Não dá para enviar: ${recusados.join(', ')}` : 'Nenhum arquivo escolhido.');

    envio = aceitos;
    editando = null;
    const eventos = [...dados.eventos].sort((a, b) => b.data.localeCompare(a.data));
    const miniaturas = aceitos.map((f) => {
      const src = URL.createObjectURL(f);
      return f.type.startsWith('video/') ? `<video src="${src}#t=1" muted preload="metadata"></video>` : `<img src="${src}" alt="">`;
    }).join('');
    const campos = VISTAS.midias.campos.map((c) => campoHtml(c, c.nome === 'data' ? hojeIso() : undefined)).join('');
    const doEvento = `<div class="campo"><label class="rotulo" for="f-evento">Do evento</label>
      <select id="f-evento"><option value="">Nenhum em especial</option>${eventos.map((e) =>
        `<option value="${esc(e.id)}">${esc(e.titulo)} · ${dataCurta(e.data)}</option>`).join('')}</select>
      <div class="ajuda">Escolher um evento preenche a legenda e a data.</div></div>`;
    const aviso = recusados.length ? `<div class="campo ajuda">Ficaram de fora: ${esc(recusados.join(', '))}</div>` : '';
    abrirDialogo(aceitos.length === 1 ? 'Enviar 1 arquivo' : `Enviar ${aceitos.length} arquivos`,
      `<div class="campo arquivos-escolhidos">${miniaturas}</div>${aviso}${doEvento}${campos}`, 'Enviar e publicar');
  }

  /** O arquivo vai do navegador direto para o Vercel Blob; o site só autoriza e registra. */
  async function enviarParaBlob(pasta, arquivo, aoProgredir) {
    if (typeof window.muralUpload !== 'function') throw new Error('O envio de arquivos não carregou. Recarregue a página.');
    const base = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'arquivo';
    try {
      return await window.muralUpload(`${pasta}/${base}`, arquivo, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        contentType: arquivo.type,
        multipart: arquivo.size > 20 * 1024 * 1024,
        onUploadProgress: aoProgredir ? ({ percentage }) => aoProgredir(Math.round(percentage)) : undefined,
      });
    } catch (erro) {
      if (/login|token/i.test(erro.message)) throw new Error('Sua sessão expirou. Entre de novo.');
      if (/content type|contentType/i.test(erro.message)) throw new Error('Formato não aceito.');
      if (/too large|size/i.test(erro.message)) throw new Error('Arquivo grande demais.');
      throw new Error('Não foi possível enviar o arquivo.');
    }
  }

  function lerFormulario(campos) {
    const form = $('form-item');
    const corpo = {};
    for (const c of campos) {
      if (c.tipo === 'check') corpo[c.nome] = form.elements[c.nome].checked;
      else corpo[c.nome] = (form.elements[c.nome]?.value ?? '').trim();
    }
    return corpo;
  }

  async function enviarArquivos() {
    const corpo = lerFormulario(VISTAS.midias.campos);
    if (!corpo.legenda) throw new Error('Preencha a legenda.');
    if (!corpo.data) throw new Error('Preencha a data do evento.');
    const falhas = [];
    for (let i = 0; i < envio.length; i++) {
      const arquivo = envio[i];
      const passo = envio.length > 1 ? ` ${i + 1} de ${envio.length}` : '';
      $('salvar').textContent = `Enviando${passo}…`;
      try {
        const blob = await enviarParaBlob('midias', arquivo, (pct) => { $('salvar').textContent = `Enviando${passo}… ${pct}%`; });
        await api('POST', '/api/midias', { ...corpo, url: blob.url });
      } catch (erro) {
        falhas.push(`${arquivo.name}: ${erro.message}`);
      }
    }
    if (falhas.length === envio.length) throw new Error(falhas.join(' '));
    $('dialogo').close();
    toast(falhas.length ? `Enviado, mas ${falhas.length} arquivo(s) falharam.` : 'Enviado. Já está passando no mural.');
  }

  $('form-item').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('salvar').disabled = true;
    const rotulo = $('salvar').textContent;
    try {
      if (envio) {
        await enviarArquivos();
      } else {
        const corpo = lerFormulario(VISTAS[vista].campos);
        if (editando) await api('PUT', `/api/${vista}/${editando}`, corpo);
        else await api('POST', `/api/${vista}`, corpo);
        $('dialogo').close();
        toast(editando ? 'Alteração publicada.' : 'Publicado. Já aparece nos PCs.');
      }
      await recarregar();
    } catch (erro) {
      $('erro-form').textContent = erro.message;
      $('erro-form').hidden = false;
      $('salvar').disabled = false;
      $('salvar').textContent = rotulo;
    }
  });

  $('form-item').addEventListener('input', (ev) => {
    const alvo = ev.target;
    if (alvo.name === 'tipo') ajustarEndereco();
    const contador = alvo.id && $(`${alvo.id}-n`);
    if (contador) contador.textContent = `${alvo.value.length}/${alvo.maxLength}`;
  });

  $('form-item').addEventListener('change', (ev) => {
    if (ev.target.id !== 'f-evento' || !ev.target.value) return;
    const evento = dados.eventos.find((e) => e.id === ev.target.value);
    if (!evento) return;
    $('f-legenda').value = evento.titulo;
    $('f-data').value = evento.data;
    $('f-unidade').value = evento.unidade;
  });

  // Logo do sistema: sobe na hora e o formulário guarda só o endereço.
  $('form-item').addEventListener('click', (ev) => {
    if (ev.target.closest('#logo-enviar')) $('arquivo-logo').click();
    if (ev.target.closest('#logo-remover')) definirLogo('');
  });
  function definirLogo(url) {
    $('form-item').elements.logo.value = url;
    $('logo-previa').innerHTML = url ? `<img src="${esc(url)}" alt="">` : icone('image');
    $('logo-enviar').textContent = url ? 'Trocar' : 'Enviar logo';
    $('logo-remover').hidden = !url;
  }
  $('arquivo-logo').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) throw new Error('Use PNG, JPG ou WEBP.');
      if (f.size > 2 * 1024 * 1024) throw new Error('O logo pode ter no máximo 2 MB.');
      $('logo-enviar').textContent = 'Enviando…';
      const { url } = await enviarParaBlob('logos', f);
      definirLogo(url);
    } catch (erro) {
      $('logo-enviar').textContent = 'Enviar logo';
      $('erro-form').textContent = erro.message;
      $('erro-form').hidden = false;
    }
  });

  $('fechar').addEventListener('click', () => $('dialogo').close());
  $('cancelar').addEventListener('click', () => $('dialogo').close());
  $('novo').addEventListener('click', () => {
    if (vista === 'midias') return $('arquivos').click();
    if (vista === 'pcs') return window.open('/', '_blank', 'noopener');
    abrirFormulario(null);
  });
  $('arquivos').addEventListener('change', (ev) => {
    const arquivos = [...ev.target.files];
    ev.target.value = '';
    if (arquivos.length) abrirEnvio(arquivos);
  });

  $('conteudo').addEventListener('click', async (ev) => {
    if (ev.target.closest('#soltar')) { ev.preventDefault(); return $('arquivos').click(); }
    const botao = ev.target.closest('button[data-acao]');
    if (!botao) return;
    const { acao, id } = botao.dataset;
    try {
      if (acao === 'editar') return abrirFormulario(id);
      if (acao === 'excluir') {
        const item = dados[vista].find((x) => x.id === id);
        const nome = item?.titulo || item?.nome || item?.legenda || item?.computador;
        const aviso = vista === 'pcs'
          ? `Tirar “${nome}” da lista? Se o mural continuar instalado nele, o PC volta a aparecer quando ligar.`
          : `Excluir “${nome}”? Some do mural de todos os PCs.`;
        if (!confirm(aviso)) return;
        await api('DELETE', `/api/${vista}/${id}`);
        toast('Removido do mural.');
      }
      if (acao === 'subir' || acao === 'descer') {
        await api('POST', `/api/sistemas/${id}/mover`, { direcao: acao === 'subir' ? -1 : 1 });
      }
      await recarregar();
    } catch (erro) {
      toast(erro.message);
    }
  });

  // Arrastar arquivos para a área de envio
  for (const tipo of ['dragenter', 'dragover']) {
    $('conteudo').addEventListener(tipo, (ev) => {
      if (vista !== 'midias' || !ev.dataTransfer?.types.includes('Files')) return;
      ev.preventDefault();
      $('soltar')?.classList.add('arrastando');
    });
  }
  $('conteudo').addEventListener('dragleave', (ev) => {
    if (!ev.relatedTarget || !$('conteudo').contains(ev.relatedTarget)) $('soltar')?.classList.remove('arrastando');
  });
  $('conteudo').addEventListener('drop', (ev) => {
    if (vista !== 'midias') return;
    ev.preventDefault();
    $('soltar')?.classList.remove('arrastando');
    abrirEnvio([...ev.dataTransfer.files]);
  });

  // ---------- Navegação, prévia, login ----------

  function irPara() {
    const alvo = location.hash.slice(1);
    vista = VISTAS[alvo] ? alvo : 'avisos';
    render();
  }
  window.addEventListener('hashchange', irPara);

  const mesa = $('previa-mesa');
  new ResizeObserver(() => {
    const escala = Math.min(1, (mesa.clientHeight - 24) / 792, (mesa.clientWidth - 24) / 360);
    $('previa').style.setProperty('--escala', Math.max(0.4, escala).toFixed(3));
  }).observe(mesa);

  $('previa-unidade').addEventListener('change', (ev) => {
    $('previa').src = '/widget' + (ev.target.value ? `?unidade=${encodeURIComponent(ev.target.value)}` : '');
  });

  let timerToast;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('visivel');
    clearTimeout(timerToast);
    timerToast = setTimeout(() => t.classList.remove('visivel'), 3000);
  }

  // Atualiza a lista a cada 30 s (PCs ligados e mudanças feitas por outro administrador),
  // sem atrapalhar quem está com um formulário aberto.
  let timerAtualizacao = null;
  function atualizarSempre() {
    if (timerAtualizacao) return;
    timerAtualizacao = setInterval(() => {
      if (document.hidden || $('dialogo').open || $('app').hidden) return;
      recarregar().catch(() => {});
    }, 30_000);
  }

  function mostrarLogin() {
    $('app').hidden = true;
    $('login').hidden = false;
    $('senha').focus();
  }

  async function entrarNoPainel() {
    $('login').hidden = true;
    $('app').hidden = false;
    irPara();
    await recarregar();
    atualizarSempre();
  }

  $('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('erro-login').hidden = true;
    try {
      await api('POST', '/api/login', { senha: $('senha').value });
      $('senha').value = '';
      await entrarNoPainel();
    } catch (erro) {
      $('erro-login').textContent = erro.message;
      $('erro-login').hidden = false;
    }
  });

  $('sair').addEventListener('click', async () => {
    await api('POST', '/api/logout').catch(() => {});
    mostrarLogin();
  });

  api('GET', '/api/sessao')
    .then((s) => (s.logado ? entrarNoPainel() : mostrarLogin()))
    .catch(() => { mostrarLogin(); $('erro-login').textContent = 'O servidor não respondeu. Tente de novo em instantes.'; $('erro-login').hidden = false; });
})();
