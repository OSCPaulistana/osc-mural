'use strict';
// Ponte mínima entre o mural (carregado do site) e o app. O mural só pede "abra o sistema X";
// quem decide o que executar é o processo principal, a partir da lista do site.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mural', {
  abrir: (id) => ipcRenderer.invoke('mural:abrir', String(id)),
  recolher: (valor, altura) => ipcRenderer.invoke('mural:recolher', Boolean(valor), Number(altura) || 0),
  notificar: (titulo, texto) => ipcRenderer.invoke('mural:notificar', String(titulo), String(texto || '')),
  onEnergia: (aoMudar) => ipcRenderer.on('mural:energia', (_ev, ativo) => aoMudar(Boolean(ativo))),
});
