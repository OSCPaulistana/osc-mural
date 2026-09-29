'use strict';
// Função única da Vercel: o vercel.json manda todo /api/* para cá.
const { handler } = require('../lib/app');

module.exports = handler;
