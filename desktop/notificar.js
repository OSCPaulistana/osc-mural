'use strict';
// Notificações do Windows com o nome "OSC Paulistana" no topo e som.
//
// O Windows mostra no cabeçalho da notificação o nome registrado para o AppUserModelId do app.
// Sem esse registro aparece "Electron". O registro fica no perfil do usuário (HKCU), sem precisar
// de administrador.
const { app, Notification } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const AUMID = 'br.com.oscpaulistana.mural';
const NOME = 'OSC Paulistana';
let icone = '';

function registrarNome(aoFalhar = () => {}) {
  app.setAppUserModelId(AUMID);
  if (process.platform !== 'win32') return;
  try {
    // O Windows não lê arquivos de dentro do pacote do app: o ícone vai para a pasta do usuário.
    icone = path.join(app.getPath('userData'), 'icone-notificacao.png');
    fs.writeFileSync(icone, fs.readFileSync(path.join(__dirname, 'recursos', 'icone.png')));
    const chave = `HKCU\\Software\\Classes\\AppUserModelId\\${AUMID}`;
    const opcoes = { windowsHide: true, stdio: 'ignore' };
    execFileSync('reg', ['add', chave, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', NOME, '/f'], opcoes);
    execFileSync('reg', ['add', chave, '/v', 'IconUri', '/t', 'REG_SZ', '/d', icone, '/f'], opcoes);
  } catch (erro) {
    aoFalhar(erro);
  }
}

const xml = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

/** Aviso urgente: toca o som de lembrete e fica na tela até a pessoa clicar em "Entendi". */
function notificarUrgente(titulo, texto) {
  if (!Notification.isSupported()) return;
  const logo = icone && fs.existsSync(icone) ? `<image placement="appLogoOverride" hint-crop="circle" src="${xml(icone)}"/>` : '';
  new Notification({
    toastXml: `<toast scenario="reminder">
      <visual><binding template="ToastGeneric">
        <text>${xml(`Aviso urgente: ${titulo}`)}</text>
        ${texto ? `<text>${xml(texto)}</text>` : ''}
        ${logo}
      </binding></visual>
      <audio src="ms-winsoundevent:Notification.Reminder"/>
      <actions><action content="Entendi" arguments="dismiss" activationType="system"/></actions>
    </toast>`,
  }).show();
}

module.exports = { registrarNome, notificarUrgente, AUMID };
