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
  const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
  const LIMITE_FOTO_MB = 20;
  const TIPOS_ANEXO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
  const LIMITE_ANEXO_MB = 10;

  const VISTAS = {
    avisos: {
      titulo: 'Avisos',
      subtitulo: 'O que está no mural agora e o histórico de tudo que já foi publicado.',
      novo: 'Novo aviso',
      singular: 'aviso',
      campos: [
        { nome: 'titulo', rotulo: 'Título', tipo: 'texto', max: 90, obrig: true, placeholder: 'Manutenção do servidor no sábado' },
        { nome: 'texto', rotulo: 'Mensagem', tipo: 'area', max: 600 },
        { nome: 'anexo', rotulo: 'Anexo', tipo: 'anexo', ajuda: 'Opcional. Foto, PDF, Word ou Excel de até 10 MB. Aparece nos PCs como link para abrir.' },
        { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'prioridade', padrao: 'info', ajuda: 'Urgente aparece no topo e também como notificação do Windows.' },
        { nome: 'unidade', rotulo: 'Quem vê', tipo: 'select', opcoes: UNIDADES, padrao: 'todas', metade: true },
        { nome: 'expiraEm', rotulo: 'Mostrar até', tipo: 'data', metade: true, ajuda: 'Em branco, fica até alguém retirar.' },
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
    elogios: {
      titulo: 'Elogios',
      subtitulo: 'Reconhecimentos que aparecem no mural quando a seção “Elogios” está ativa.',
      novo: 'Novo elogio',
      singular: 'elogio',
      campos: [
        { nome: 'titulo', rotulo: 'Para quem', tipo: 'texto', max: 90, obrig: true, placeholder: 'Equipe do fiscal' },
        { nome: 'texto', rotulo: 'Mensagem', tipo: 'area', max: 300, obrig: true, placeholder: 'Parabéns pelo fechamento do mês sem pendências!' },
        { nome: 'unidade', rotulo: 'Quem vê', tipo: 'select', opcoes: UNIDADES, padrao: 'todas', metade: true },
      ],
    },
    galeria: {
      titulo: 'Galeria',
      subtitulo: 'Álbuns de fotos dos eventos. As fotos passam no rodapé do mural e o clique abre a galeria completa.',
      novo: 'Novo álbum',
      singular: 'álbum',
      campos: [
        { nome: 'titulo', rotulo: 'Nome do álbum', tipo: 'texto', max: 90, obrig: true, placeholder: 'Confraternização de fim de ano' },
        { nome: 'data', rotulo: 'Data do evento', tipo: 'data', obrig: true, metade: true },
        { nome: 'unidade', rotulo: 'Quem vê', tipo: 'select', opcoes: UNIDADES, padrao: 'todas', metade: true },
      ],
    },
    sistemas: {
      titulo: 'Sistemas',
      subtitulo: 'Atalhos do mural, de 8 em 8 por aba. Esta é a ordem padrão; cada colaborador pode reordenar e esconder no próprio PC.',
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
    pcs: {
      titulo: 'Computadores',
      subtitulo: 'PCs com o mural instalado. A conexão é atualizada a cada minuto; o painel atualiza a cada 30 segundos.',
      novo: 'Baixar instalador',
      singular: 'computador',
      campos: [],
    },
    admins: {
      titulo: 'Administradores',
      subtitulo: 'Quem pode entrar neste painel. Cada pessoa tem o próprio e-mail e senha.',
      novo: 'Novo administrador',
      singular: 'administrador',
      campos: [
        { nome: 'nome', rotulo: 'Nome', tipo: 'texto', max: 80, obrig: true, metade: true },
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', max: 120, obrig: true, metade: true },
        { nome: 'senha', rotulo: 'Senha inicial', tipo: 'senha', ajuda: 'Pelo menos 10 caracteres. Passe para a pessoa; ela pode trocar depois em "Minha senha".' },
      ],
      camposEdicao: [
        { nome: 'nome', rotulo: 'Nome', tipo: 'texto', max: 80, obrig: true, metade: true },
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', max: 120, obrig: true, metade: true },
        { nome: 'senha', rotulo: 'Nova senha', tipo: 'senha', ajuda: 'Deixe em branco para manter a senha atual.' },
        { nome: 'ativo', rotulo: 'Acesso ativo', tipo: 'check' },
      ],
    },
  };

  const FORMULARIOS_EXTRAS = {
    foto: [{ nome: 'legenda', rotulo: 'Legenda da foto', tipo: 'texto', max: 140, placeholder: 'Opcional' }],
    minhaSenha: [
      { nome: 'atual', rotulo: 'Senha atual', tipo: 'senha' },
      { nome: 'nova', rotulo: 'Nova senha', tipo: 'senha', ajuda: 'Pelo menos 10 caracteres.' },
      { nome: 'confirmar', rotulo: 'Repita a nova senha', tipo: 'senha' },
    ],
  };

  const AJUDA_ENDERECO = {
    site: { placeholder: 'https://', ajuda: 'Abre no navegador padrão do colaborador.' },
    programa: { placeholder: 'C:\\Pasta\\programa.exe', ajuda: 'Caminho completo do .exe ou .lnk. Se o programa não existir no PC, o mural avisa o colaborador.' },
  };

  let dados = { sistemas: [], avisos: [], eventos: [], elogios: [], albuns: [], pcs: [], admins: [], eu: null, secao: 'agenda' };
  let vista = 'avisos';
  let albumAberto = null; // id do álbum na tela de fotos
  let filtroAvisos = 'mural'; // 'mural' | 'historico'
  let formulario = null; // { tipo, id, campos }
  let enviando = false;

  // ---------- API ----------

  async function api(metodo, url, corpo) {
    const r = await fetch(url, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const json = await r.json().catch(() => null);
    if (r.status === 401 && !['/api/login', '/api/primeiro-admin'].includes(url)) { mostrarLogin(); throw new Error('Sessão expirada. Entre de novo.'); }
    if (!r.ok) throw new Error(json?.erro || 'Não deu certo. Tente de novo.');
    return json;
  }

  // ---------- Formatação ----------

  const hojeIso = () => new Date().toLocaleDateString('sv-SE');
  function dataDe(iso) { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); }
  const dataCurta = (iso) => dataDe(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
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

  // ---------- Avisos (no mural e histórico) ----------

  const naoNoMural = (a) => a.arquivadoEm || (a.expiraEm && a.expiraEm < hojeIso());

  function situacaoAviso(a) {
    if (a.arquivadoEm) return `Retirado em ${dataHora(a.arquivadoEm)}${a.arquivadoPor ? ` por ${esc(a.arquivadoPor)}` : ''}`;
    if (a.expiraEm && a.expiraEm < hojeIso()) return `Saiu do mural em ${dataCurta(a.expiraEm)} (prazo)`;
    return '<b class="online">No mural</b>';
  }

  function linhaAviso(a) {
    const fora = naoNoMural(a);
    const meta = [];
    if (a.prioridade !== 'info') meta.push(`<b class="${esc(a.prioridade)}">${a.prioridade === 'urgente' ? 'Urgente' : 'Importante'}</b>`);
    if (a.fixado && !fora) meta.push('Fixado');
    meta.push(esc(NOME_UNIDADE[a.unidade]));
    if (a.expiraEm && !fora) meta.push(`até ${dataCurta(a.expiraEm)}`);
    meta.push(`publicado em ${dataHora(a.criadoEm)}${a.criadoPor ? ` por ${esc(a.criadoPor)}` : ''}`);
    if (filtroAvisos === 'historico') meta.push(situacaoAviso(a));
    const botoes = fora
      ? `<button class="btn-ico" data-acao="republicar" data-id="${esc(a.id)}" title="Publicar de novo">${icone('rotate-ccw')}</button>`
      : `<button class="btn-ico" data-acao="editar" data-id="${esc(a.id)}" title="Editar">${icone('pencil')}</button>
         <button class="btn-ico perigo" data-acao="retirar" data-id="${esc(a.id)}" title="Retirar do mural (fica no histórico)">${icone('archive')}</button>`;
    const anexo = a.anexoUrl
      ? `<a class="anexo-chip" href="${esc(a.anexoUrl)}" target="_blank" rel="noopener">${icone('paperclip')}<span>${esc(a.anexoNome || 'Anexo')}</span></a>`
      : '';
    return `<div class="linha${fora ? ' passado' : ''}">
      <span class="marca-p ${fora ? '' : esc(a.prioridade)}"></span>
      <div class="linha-info"><strong>${esc(a.titulo)}</strong>${a.texto ? `<p>${esc(a.texto)}</p>` : ''}${anexo}<div class="meta">${meta.join(' · ')}</div></div>
      <div class="acoes">${botoes}</div>
    </div>`;
  }

  function avisosDaVez() {
    const peso = { urgente: 0, importante: 1, info: 2 };
    if (filtroAvisos === 'historico') return [...dados.avisos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    return dados.avisos.filter((a) => !naoNoMural(a)).sort((a, b) =>
      ((a.prioridade !== 'urgente') - (b.prioridade !== 'urgente')) || (b.fixado - a.fixado)
      || (peso[a.prioridade] - peso[b.prioridade]) || b.criadoEm.localeCompare(a.criadoEm));
  }

  function renderAvisos() {
    const noMural = dados.avisos.filter((a) => !naoNoMural(a)).length;
    const abas = `<div class="filtros">
      <button class="filtro${filtroAvisos === 'mural' ? ' ativo' : ''}" data-filtro="mural">No mural <span>${noMural}</span></button>
      <button class="filtro${filtroAvisos === 'historico' ? ' ativo' : ''}" data-filtro="historico">Histórico <span>${dados.avisos.length}</span></button>
    </div>`;
    const itens = avisosDaVez();
    const corpo = itens.length
      ? `<div class="tabela">${itens.map(linhaAviso).join('')}</div>`
      : `<div class="vazio"><strong>${filtroAvisos === 'mural' ? 'Nenhum aviso no mural agora' : 'Nenhum aviso publicado ainda'}</strong>Use “Novo aviso” para publicar.</div>`;
    return abas + corpo;
  }

  // ---------- Agenda, sistemas, computadores, administradores ----------

  const acoesPadrao = (id, extras = '') => `<div class="acoes">${extras}
      <button class="btn-ico" data-acao="editar" data-id="${esc(id)}" title="Editar">${icone('pencil')}</button>
      <button class="btn-ico perigo" data-acao="excluir" data-id="${esc(id)}" title="Excluir">${icone('trash-2')}</button>
    </div>`;

  function linhaEvento(e) {
    const passou = e.data < hojeIso();
    const hoje = e.data === hojeIso();
    const dia = dataDe(e.data);
    const meta = [dia.toLocaleDateString('pt-BR', { weekday: 'long' }), e.hora, e.local && esc(e.local), esc(NOME_UNIDADE[e.unidade])].filter(Boolean);
    return `<div class="linha${passou ? ' passado' : ''}">
      <div class="dia${hoje ? ' hoje' : ''}"><strong>${dia.getDate()}</strong><span>${mes(dia)}</span></div>
      <div class="linha-info"><strong>${esc(e.titulo)}</strong><div class="meta">${meta.join(' · ')}${passou ? ' · já passou' : ''}</div></div>
      ${acoesPadrao(e.id)}
    </div>`;
  }

  function linhaElogio(e) {
    const meta = [esc(NOME_UNIDADE[e.unidade]), `publicado ${relativo(e.criadoEm)}`];
    return `<div class="linha">
      <span class="marca-p online"></span>
      <div class="linha-info"><strong>${esc(e.titulo)}</strong><p>${esc(e.texto)}</p><div class="meta">${meta.join(' · ')}</div></div>
      ${acoesPadrao(e.id)}
    </div>`;
  }

  // Chave que define qual seção aparece no mural abaixo dos avisos.
  function chaveSecao() {
    const atual = dados.secao === 'elogios' ? 'elogios' : 'agenda';
    return `<div class="chave-secao"><span>Mostrar no mural:</span>
      <button class="filtro${atual === 'agenda' ? ' ativo' : ''}" data-secao="agenda" type="button">Agenda</button>
      <button class="filtro${atual === 'elogios' ? ' ativo' : ''}" data-secao="elogios" type="button">Elogios</button>
    </div>`;
  }
  function linhaSistema(s, i, total) {
    const mover = `<button class="btn-ico" data-acao="subir" data-id="${esc(s.id)}" title="Mover para cima"${i === 0 ? ' disabled' : ''}>${icone('arrow-up')}</button>
      <button class="btn-ico" data-acao="descer" data-id="${esc(s.id)}" title="Mover para baixo"${i === total - 1 ? ' disabled' : ''}>${icone('arrow-down')}</button>`;
    const marca = s.logo ? `<img src="${esc(s.logo)}" alt="">` : icone(s.icone);
    const aba = Math.floor(i / 8) + 1;
    return `<div class="linha">
      <span class="tile" style="--cor:var(--cor-${esc(s.cor)})">${marca}</span>
      <div class="linha-info">
        <strong>${esc(s.nome)}</strong>${s.descricao ? ` <span class="meta">· ${esc(s.descricao)}</span>` : ''}
        <div class="meta">${s.tipo === 'site' ? 'Site' : 'Programa'} · <code>${esc(s.endereco)}</code>${total > 8 ? ` · aba ${aba}` : ''}</div>
      </div>
      ${acoesPadrao(s.id, mover)}
    </div>`;
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

  function linhaAdmin(a) {
    const voce = a.id === dados.eu?.id;
    const meta = [esc(a.email), a.ativo ? '' : '<b class="urgente">Acesso desativado</b>',
      a.ultimoAcesso ? `último acesso ${relativo(a.ultimoAcesso)}` : 'nunca entrou'].filter(Boolean);
    return `<div class="linha${a.ativo ? '' : ' passado'}">
      <span class="marca-p${a.ativo ? ' online' : ''}"></span>
      <div class="linha-info"><strong>${esc(a.nome)}${voce ? ' <span class="meta">(você)</span>' : ''}</strong><div class="meta">${meta.join(' · ')}</div></div>
      <div class="acoes"><button class="btn-ico" data-acao="editar" data-id="${esc(a.id)}" title="Editar">${icone('pencil')}</button></div>
    </div>`;
  }

  // ---------- Galeria ----------

  function renderAlbuns() {
    if (!dados.albuns.length) return '<div class="vazio"><strong>Nenhum álbum ainda</strong>Crie um álbum para cada evento e envie as fotos dentro dele.</div>';
    return `<div class="grade-albuns">${dados.albuns.map((a) => `
      <button class="album" data-album="${esc(a.id)}" type="button">
        <span class="capa">${a.capa ? `<img src="${esc(a.capa)}" alt="" loading="lazy">` : icone('images')}</span>
        <strong>${esc(a.titulo)}</strong>
        <span>${dataCurta(a.data)} · ${a.fotos.length} ${a.fotos.length === 1 ? 'foto' : 'fotos'} · ${esc(NOME_UNIDADE[a.unidade])}</span>
      </button>`).join('')}</div>`;
  }

  function renderAlbum(a) {
    const zona = `<label class="soltar" id="soltar">${icone('image-plus')}<div><strong id="soltar-titulo">Arraste as fotos do evento para cá</strong>
      <span id="soltar-texto">ou clique para escolher. Dá para mandar várias de uma vez. JPG, PNG ou WEBP até ${LIMITE_FOTO_MB} MB cada.</span></div></label>`;
    const fotos = a.fotos.length ? `<div class="grade-fotos">${a.fotos.map((f) => `
      <figure class="foto-admin">
        <div class="thumb"><img src="${esc(f.url)}" alt="" loading="lazy">
          ${f.url === a.capa ? '<span class="selo-capa">Capa</span>' : ''}
          <div class="acoes sobre">
            <button class="btn-ico" data-acao="capa" data-id="${esc(f.id)}" title="Usar como capa">${icone('star')}</button>
            <button class="btn-ico" data-acao="legenda" data-id="${esc(f.id)}" title="Legenda">${icone('pencil')}</button>
            <button class="btn-ico perigo" data-acao="apagar-foto" data-id="${esc(f.id)}" title="Apagar foto">${icone('trash-2')}</button>
          </div>
        </div>
        ${f.legenda ? `<figcaption>${esc(f.legenda)}</figcaption>` : ''}
      </figure>`).join('')}</div>` : '';
    return `<div class="cab-album">
        <button class="btn" data-acao="voltar-albuns" type="button">${icone('arrow-left')}Álbuns</button>
        <div><strong>${esc(a.titulo)}</strong><span>${dataCurta(a.data)} · ${a.fotos.length} ${a.fotos.length === 1 ? 'foto' : 'fotos'} · ${esc(NOME_UNIDADE[a.unidade])}</span></div>
        <button class="btn" data-acao="editar-album" type="button">${icone('pencil')}Editar</button>
        <button class="btn perigo" data-acao="apagar-album" type="button">${icone('trash-2')}Apagar álbum</button>
      </div>${zona}${fotos}`;
  }

  // ---------- Renderização geral ----------

  function render() {
    const v = VISTAS[vista];
    const album = vista === 'galeria' && albumAberto ? dados.albuns.find((a) => a.id === albumAberto) : null;
    if (vista === 'galeria' && albumAberto && !album) albumAberto = null;
    $('titulo').textContent = v.titulo;
    $('subtitulo').textContent = v.subtitulo;
    $('novo-rotulo').textContent = album ? 'Enviar fotos' : v.novo;
    for (const a of document.querySelectorAll('.menu a')) a.classList.toggle('ativo', a.dataset.vista === vista);

    const h = hojeIso();
    $('c-avisos').textContent = dados.avisos.filter((a) => !naoNoMural(a)).length || '';
    $('c-eventos').textContent = dados.eventos.filter((e) => e.data >= h).length || '';
    $('c-elogios').textContent = dados.elogios.length || '';
    $('c-galeria').textContent = dados.albuns.length || '';
    $('c-sistemas').textContent = dados.sistemas.length || '';
    $('c-pcs').textContent = dados.pcs.length || '';
    $('c-admins').textContent = dados.admins.filter((a) => a.ativo).length || '';
    $('eu').textContent = dados.eu ? `${dados.eu.nome} · ${dados.eu.email}` : '';

    let html;
    if (vista === 'avisos') html = renderAvisos();
    else if (vista === 'galeria') html = album ? renderAlbum(album) : renderAlbuns();
    else {
      const itens = { eventos: [...dados.eventos].sort((a, b) => ((a.data < h) - (b.data < h)) || a.data.localeCompare(b.data)), elogios: [...dados.elogios].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)), sistemas: dados.sistemas, pcs: dados.pcs, admins: dados.admins }[vista];
      const linha = { eventos: linhaEvento, elogios: linhaElogio, sistemas: linhaSistema, pcs: linhaPc, admins: linhaAdmin }[vista];
      const corpo = itens.length
        ? `<div class="tabela">${itens.map((item, i) => linha(item, i, itens.length)).join('')}</div>`
        : vista === 'pcs'
          ? '<div class="vazio"><strong>Nenhum computador ainda</strong>Instale o mural pela página de instalação e o PC aparece aqui em alguns segundos.</div>'
          : `<div class="vazio"><strong>Nenhum ${v.singular} ainda</strong>Use “${v.novo}” para cadastrar o primeiro.</div>`;
      html = (vista === 'eventos' || vista === 'elogios' ? chaveSecao() : '') + corpo;
    }
    if (!enviando) $('conteudo').innerHTML = html;
  }

  async function recarregar() {
    dados = await api('GET', '/api/admin/dados');
    mostrarConectados(dados.conectados);
    render();
  }

  function mostrarConectados(total) {
    $('n-conectados').textContent = total === 0 ? 'Nenhum PC conectado' : total === 1 ? '1 PC conectado agora' : `${total} PCs conectados agora`;
  }

  // ---------- Formulários ----------

  function campoHtml(c, valor, valores = {}) {
    const id = `f-${c.nome}`;
    const metade = c.metade ? ' metade' : '';
    const ajuda = `<div class="ajuda" id="${id}-ajuda">${esc(c.ajuda || '')}</div>`;
    const v = valor ?? c.padrao ?? '';
    switch (c.tipo) {
      case 'texto':
      case 'email':
      case 'area': {
        const contador = c.max ? `<span class="contador" id="${id}-n">${String(v).length}/${c.max}</span>` : '';
        const entrada = c.tipo === 'area'
          ? `<textarea id="${id}" name="${c.nome}" maxlength="${c.max}">${esc(v)}</textarea>`
          : `<input class="input" id="${id}" name="${c.nome}" type="${c.tipo === 'email' ? 'email' : 'text'}" maxlength="${c.max}" value="${esc(v)}" placeholder="${esc(c.placeholder || '')}">`;
        return `<div class="campo${metade}"><label class="rotulo" for="${id}">${esc(c.rotulo)}${contador}</label>${entrada}${c.ajuda || c.nome === 'endereco' ? ajuda : ''}</div>`;
      }
      case 'senha':
        return `<div class="campo${metade}"><label class="rotulo" for="${id}">${esc(c.rotulo)}</label>
          <input class="input" type="password" id="${id}" name="${c.nome}" autocomplete="new-password">${c.ajuda ? ajuda : ''}</div>`;
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
      case 'anexo': {
        const url = valores.anexoUrl || '';
        const nome = valores.anexoNome || '';
        return `<div class="campo"><span class="rotulo">${esc(c.rotulo)}</span><div class="anexo-campo">
          <input type="hidden" name="anexoUrl" value="${esc(url)}">
          <input type="hidden" name="anexoNome" value="${esc(nome)}">
          <span class="anexo-previa" id="anexo-previa">${url ? `${icone('paperclip')}<span>${esc(nome || 'Anexo')}</span>` : icone('paperclip')}</span>
          <button class="btn" type="button" id="anexo-enviar">${url ? 'Trocar' : 'Anexar foto ou documento'}</button>
          <button class="btn" type="button" id="anexo-remover"${url ? '' : ' hidden'}>Remover</button>
          ${c.ajuda ? `<span class="ajuda">Foto, PDF, Word ou Excel de até ${LIMITE_ANEXO_MB} MB.</span>` : ''}
        </div></div>`;
      }
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

  /** Abre o diálogo. tipo: coleção da API ('avisos', 'albuns'...) ou 'foto' / 'minhaSenha'. */
  function abrirDialogo({ tipo, id = null, titulo, campos, valores = {}, rotulo }) {
    formulario = { tipo, id, campos };
    $('dialogo-titulo').textContent = titulo;
    $('campos').innerHTML = campos.map((c) => campoHtml(c, valores[c.nome], valores)).join('');
    $('erro-form').hidden = true;
    $('salvar').disabled = false;
    $('salvar').textContent = rotulo;
    ajustarEndereco();
    $('dialogo').showModal();
    $('campos').querySelector('input.input, textarea')?.focus();
  }

  const COLECAO_DA_VISTA = { avisos: 'avisos', eventos: 'eventos', elogios: 'elogios', galeria: 'albuns', sistemas: 'sistemas', admins: 'admins' };

  function abrirFormulario(id) {
    const v = VISTAS[vista];
    const colecao = COLECAO_DA_VISTA[vista];
    const item = id ? (vista === 'galeria' ? dados.albuns : dados[vista]).find((x) => x.id === id) : null;
    const campos = item && v.camposEdicao ? v.camposEdicao : v.campos;
    const valores = item ? { ...item, senha: '' } : (vista === 'galeria' ? { data: hojeIso() } : {});
    abrirDialogo({ tipo: colecao, id, titulo: item ? `Editar ${v.singular}` : v.novo, campos, valores, rotulo: item ? 'Salvar' : (vista === 'admins' || vista === 'galeria' ? 'Criar' : 'Publicar') });
  }

  function lerFormulario(campos) {
    const form = $('form-item');
    const corpo = {};
    for (const c of campos) {
      if (c.tipo === 'check') corpo[c.nome] = form.elements[c.nome].checked;
      else if (c.tipo === 'senha') corpo[c.nome] = form.elements[c.nome]?.value ?? '';
      else if (c.tipo === 'anexo') {
        corpo.anexoUrl = (form.elements.anexoUrl?.value ?? '').trim();
        corpo.anexoNome = (form.elements.anexoNome?.value ?? '').trim();
      }
      else corpo[c.nome] = (form.elements[c.nome]?.value ?? '').trim();
    }
    return corpo;
  }

  $('form-item').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { tipo, id, campos } = formulario;
    const corpo = lerFormulario(campos);
    $('salvar').disabled = true;
    try {
      let mensagem = id ? 'Alteração salva.' : 'Publicado. Já aparece nos PCs.';
      if (tipo === 'minhaSenha') {
        if (corpo.nova !== corpo.confirmar) throw new Error('As duas senhas novas não são iguais.');
        await api('POST', '/api/minha-senha', { atual: corpo.atual, nova: corpo.nova });
        mensagem = 'Senha trocada.';
      } else if (tipo === 'foto') {
        await api('PUT', `/api/fotos/${id}`, corpo);
        mensagem = 'Legenda salva.';
      } else if (id) {
        await api('PUT', `/api/${tipo}/${id}`, corpo);
      } else {
        const criado = await api('POST', `/api/${tipo}`, corpo);
        if (tipo === 'albuns') { albumAberto = criado.id; mensagem = 'Álbum criado. Agora envie as fotos.'; }
        if (tipo === 'admins') mensagem = 'Administrador criado. Passe o e-mail e a senha para a pessoa.';
      }
      $('dialogo').close();
      toast(mensagem);
      await recarregar();
    } catch (erro) {
      $('erro-form').textContent = erro.message;
      $('erro-form').hidden = false;
      $('salvar').disabled = false;
    }
  });

  $('form-item').addEventListener('input', (ev) => {
    const alvo = ev.target;
    if (alvo.name === 'tipo') ajustarEndereco();
    const contador = alvo.id && $(`${alvo.id}-n`);
    if (contador) contador.textContent = `${alvo.value.length}/${alvo.maxLength}`;
  });

  // ---------- Envio de arquivos (direto do navegador para o Vercel Blob) ----------

  async function enviarParaBlob(pasta, arquivo) {
    if (typeof window.muralUpload !== 'function') throw new Error('O envio de arquivos não carregou. Recarregue a página.');
    const base = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'foto';
    try {
      return await window.muralUpload(`${pasta}/${base}`, arquivo, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        contentType: arquivo.type,
        multipart: arquivo.size > 10 * 1024 * 1024,
      });
    } catch (erro) {
      if (/login|token/i.test(erro.message)) throw new Error('Sua sessão expirou. Entre de novo.');
      if (/content type|contentType/i.test(erro.message)) throw new Error('Formato não aceito.');
      if (/too large|size/i.test(erro.message)) throw new Error('Arquivo grande demais.');
      throw new Error('Não foi possível enviar o arquivo.');
    }
  }

  async function enviarFotos(arquivos) {
    if (!albumAberto) return toast('Abra um álbum antes de enviar fotos.');
    const aceitas = arquivos.filter((f) => TIPOS_FOTO.includes(f.type) && f.size <= LIMITE_FOTO_MB * 1024 * 1024);
    const recusadas = arquivos.length - aceitas.length;
    if (!aceitas.length) return toast(`Nenhuma foto aceita. Envie JPG, PNG ou WEBP de até ${LIMITE_FOTO_MB} MB.`);
    const album = albumAberto;
    enviando = true;
    let falhas = 0;
    for (let i = 0; i < aceitas.length; i++) {
      if ($('soltar-titulo')) {
        $('soltar-titulo').textContent = `Enviando ${i + 1} de ${aceitas.length}…`;
        $('soltar-texto').textContent = 'Pode continuar usando o painel. Não feche esta página até terminar.';
      }
      try {
        const blob = await enviarParaBlob('fotos', aceitas[i]);
        await api('POST', `/api/albuns/${album}/fotos`, { url: blob.url });
      } catch {
        falhas++;
      }
    }
    enviando = false;
    const partes = [`${aceitas.length - falhas} ${aceitas.length - falhas === 1 ? 'foto enviada' : 'fotos enviadas'}`];
    if (falhas) partes.push(`${falhas} falharam`);
    if (recusadas) partes.push(`${recusadas} fora do formato ou grandes demais`);
    toast(partes.join(' · '));
    await recarregar();
  }

  // Logo do sistema: sobe na hora e o formulário guarda só o endereço.
  $('form-item').addEventListener('click', (ev) => {
    if (ev.target.closest('#logo-enviar')) $('arquivo-logo').click();
    if (ev.target.closest('#logo-remover')) definirLogo('');
    if (ev.target.closest('#anexo-enviar')) $('arquivo-anexo').click();
    if (ev.target.closest('#anexo-remover')) definirAnexo('', '');
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
      if (!TIPOS_FOTO.includes(f.type)) throw new Error('Use PNG, JPG ou WEBP.');
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

  function definirAnexo(url, nome) {
    const form = $('form-item');
    if (!form.elements.anexoUrl) return;
    form.elements.anexoUrl.value = url;
    form.elements.anexoNome.value = nome;
    $('anexo-previa').innerHTML = url ? `${icone('paperclip')}<span>${esc(nome || 'Anexo')}</span>` : icone('paperclip');
    $('anexo-enviar').textContent = url ? 'Trocar' : 'Anexar foto ou documento';
    $('anexo-remover').hidden = !url;
  }
  $('arquivo-anexo').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const tipo = f.type || ({ pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }[/\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase()] || '');
      if (!TIPOS_ANEXO.includes(tipo)) throw new Error('Formato não aceito. Use foto, PDF, Word ou Excel.');
      if (f.size > LIMITE_ANEXO_MB * 1024 * 1024) throw new Error(`O anexo pode ter no máximo ${LIMITE_ANEXO_MB} MB.`);
      $('anexo-enviar').textContent = 'Enviando…';
      const { url } = await enviarParaBlob('anexos', f);
      definirAnexo(url, f.name.slice(0, 120));
    } catch (erro) {
      if ($('anexo-enviar')) $('anexo-enviar').textContent = $('form-item').elements.anexoUrl?.value ? 'Trocar' : 'Anexar foto ou documento';
      $('erro-form').textContent = erro.message;
      $('erro-form').hidden = false;
    }
  });

  $('arquivos').addEventListener('change', (ev) => {
    const arquivos = [...ev.target.files];
    ev.target.value = '';
    if (arquivos.length) enviarFotos(arquivos);
  });

  for (const tipo of ['dragenter', 'dragover']) {
    $('conteudo').addEventListener(tipo, (ev) => {
      if (!albumAberto || !ev.dataTransfer?.types.includes('Files')) return;
      ev.preventDefault();
      $('soltar')?.classList.add('arrastando');
    });
  }
  $('conteudo').addEventListener('dragleave', (ev) => {
    if (!ev.relatedTarget || !$('conteudo').contains(ev.relatedTarget)) $('soltar')?.classList.remove('arrastando');
  });
  $('conteudo').addEventListener('drop', (ev) => {
    if (!albumAberto) return;
    ev.preventDefault();
    $('soltar')?.classList.remove('arrastando');
    enviarFotos([...ev.dataTransfer.files]);
  });

  // ---------- Ações das listas ----------

  $('fechar').addEventListener('click', () => $('dialogo').close());
  $('cancelar').addEventListener('click', () => $('dialogo').close());
  $('novo').addEventListener('click', () => {
    if (vista === 'pcs') return window.open('/', '_blank', 'noopener');
    if (vista === 'galeria' && albumAberto) return $('arquivos').click();
    abrirFormulario(null);
  });
  $('minha-senha').addEventListener('click', () => abrirDialogo({ tipo: 'minhaSenha', titulo: 'Trocar minha senha', campos: FORMULARIOS_EXTRAS.minhaSenha, rotulo: 'Trocar senha' }));

  $('conteudo').addEventListener('click', async (ev) => {
    if (ev.target.closest('#soltar')) { ev.preventDefault(); if (!enviando) $('arquivos').click(); return; }
    const filtro = ev.target.closest('[data-filtro]');
    if (filtro) { filtroAvisos = filtro.dataset.filtro; return render(); }
    const chave = ev.target.closest('[data-secao]');
    if (chave) {
      try {
        const r = await api('POST', '/api/secao', { secao: chave.dataset.secao });
        dados.secao = r.secao;
        toast(r.secao === 'elogios' ? 'O mural agora mostra Elogios.' : 'O mural agora mostra a Agenda.');
        render();
      } catch (erro) { toast(erro.message); }
      return;
    }
    const album = ev.target.closest('[data-album]');
    if (album) { location.hash = `#galeria/${album.dataset.album}`; return; }
    const botao = ev.target.closest('button[data-acao]');
    if (!botao) return;
    const { acao, id } = botao.dataset;
    const albumAtual = dados.albuns.find((a) => a.id === albumAberto);
    try {
      if (acao === 'editar') return abrirFormulario(id);
      if (acao === 'voltar-albuns') { location.hash = '#galeria'; return; }
      if (acao === 'editar-album') return abrirFormulario(albumAberto);
      if (acao === 'legenda') {
        const foto = albumAtual?.fotos.find((f) => f.id === id);
        return abrirDialogo({ tipo: 'foto', id, titulo: 'Legenda da foto', campos: FORMULARIOS_EXTRAS.foto, valores: foto, rotulo: 'Salvar' });
      }
      if (acao === 'retirar') {
        const aviso = dados.avisos.find((a) => a.id === id);
        if (!confirm(`Retirar “${aviso?.titulo}” do mural? Ele sai de todos os PCs e fica guardado no histórico.`)) return;
        await api('DELETE', `/api/avisos/${id}`);
        toast('Aviso retirado do mural. Ele continua no histórico.');
      }
      if (acao === 'republicar') {
        await api('POST', `/api/avisos/${id}/republicar`, {});
        toast('Aviso publicado de novo.');
      }
      if (acao === 'capa') {
        await api('POST', `/api/albuns/${albumAberto}/capa`, { fotoId: id });
        toast('Capa do álbum trocada.');
      }
      if (acao === 'apagar-foto') {
        if (!confirm('Apagar esta foto? Ela sai do mural e da galeria.')) return;
        await api('DELETE', `/api/fotos/${id}`);
        toast('Foto apagada.');
      }
      if (acao === 'apagar-album') {
        if (!confirm(`Apagar o álbum “${albumAtual?.titulo}” e as ${albumAtual?.fotos.length || 0} fotos dele? Não dá para desfazer.`)) return;
        await api('DELETE', `/api/albuns/${albumAberto}`);
        location.hash = '#galeria';
        toast('Álbum apagado.');
      }
      if (acao === 'excluir') {
        const item = dados[vista].find((x) => x.id === id);
        const nome = item?.titulo || item?.nome || item?.computador;
        const pergunta = vista === 'pcs'
          ? `Tirar “${nome}” da lista? Se o mural continuar instalado nele, o PC volta a aparecer quando ligar.`
          : `Excluir “${nome}”? Some do mural de todos os PCs.`;
        if (!confirm(pergunta)) return;
        await api('DELETE', `/api/${vista}/${id}`);
        toast('Removido.');
      }
      if (acao === 'subir' || acao === 'descer') {
        await api('POST', `/api/sistemas/${id}/mover`, { direcao: acao === 'subir' ? -1 : 1 });
      }
      await recarregar();
    } catch (erro) {
      toast(erro.message);
    }
  });

  // ---------- Navegação, prévia, login ----------

  function irPara() {
    const [alvo, sub] = location.hash.slice(1).split('/');
    vista = VISTAS[alvo] ? alvo : 'avisos';
    albumAberto = vista === 'galeria' && sub ? sub : null;
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
    timerToast = setTimeout(() => t.classList.remove('visivel'), 3500);
  }

  // Atualiza a lista a cada 30 s (PCs ligados e mudanças de outros administradores),
  // sem atrapalhar quem está com um formulário aberto ou enviando fotos.
  let timerAtualizacao = null;
  function atualizarSempre() {
    if (timerAtualizacao) return;
    timerAtualizacao = setInterval(() => {
      if (document.hidden || $('dialogo').open || $('app').hidden || enviando) return;
      recarregar().catch(() => {});
    }, 30_000);
  }

  function mostrarLogin(precisaPrimeiro = false) {
    $('app').hidden = true;
    $('login').hidden = false;
    $('form-login').hidden = precisaPrimeiro;
    $('form-primeiro').hidden = !precisaPrimeiro;
    (precisaPrimeiro ? $('p-nome') : $('email')).focus();
  }

  async function entrarNoPainel() {
    $('login').hidden = true;
    $('app').hidden = false;
    irPara();
    await recarregar();
    $('previa').src = $('previa').src; // a prévia carregou antes do login
    atualizarSempre();
  }

  $('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('erro-login').hidden = true;
    try {
      await api('POST', '/api/login', { email: $('email').value, senha: $('senha').value });
      $('senha').value = '';
      await entrarNoPainel();
    } catch (erro) {
      $('erro-login').textContent = erro.message;
      $('erro-login').hidden = false;
    }
  });

  $('form-primeiro').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('erro-primeiro').hidden = true;
    try {
      await api('POST', '/api/primeiro-admin', {
        nome: $('p-nome').value, email: $('p-email').value, senha: $('p-senha').value, senhaMestra: $('p-mestra').value,
      });
      $('p-senha').value = '';
      $('p-mestra').value = '';
      await entrarNoPainel();
    } catch (erro) {
      $('erro-primeiro').textContent = erro.message;
      $('erro-primeiro').hidden = false;
    }
  });

  $('sair').addEventListener('click', async () => {
    await api('POST', '/api/logout').catch(() => {});
    mostrarLogin();
  });

  api('GET', '/api/sessao')
    .then((s) => (s.logado ? entrarNoPainel() : mostrarLogin(s.precisaPrimeiro)))
    .catch(() => { mostrarLogin(); $('erro-login').textContent = 'O servidor não respondeu. Tente de novo em instantes.'; $('erro-login').hidden = false; });
})();
