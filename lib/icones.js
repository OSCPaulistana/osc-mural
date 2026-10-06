'use strict';
// Ícones Lucide usados no site. O build copia só estes para public/icones.

const ICONES_SISTEMA = [
  'building-2', 'cloud', 'briefcase', 'layout-dashboard', 'landmark', 'users', 'mail', 'calculator', 'file-text', 'folder',
  'chart-column', 'message-circle', 'shield-check', 'scale', 'receipt', 'monitor', 'headset', 'book-open', 'database', 'globe',
];

const ICONES_INTERFACE = [
  'panel-right-close', 'panel-right-open', 'bell', 'megaphone', 'calendar', 'images', 'layout-grid', 'external-link', 'log-out',
  'plus', 'x', 'pencil', 'trash-2', 'arrow-up', 'arrow-down', 'image-plus', 'play', 'image', 'monitor-smartphone', 'download',
  'sliders-horizontal', 'eye', 'eye-off', 'chevron-up', 'chevron-down', 'chevron-left', 'chevron-right', 'arrow-left',
  'archive', 'rotate-ccw', 'shield-user', 'key-round', 'folder-plus', 'star', 'user-plus',
];

module.exports = { ICONES_SISTEMA, ICONES_INTERFACE, TODOS: [...new Set([...ICONES_SISTEMA, ...ICONES_INTERFACE])] };
