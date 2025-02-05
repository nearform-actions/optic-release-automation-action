'use strict'

/* node:coverage disable */
async function getNgrok() {
  return await import('ngrok')
}

module.exports = getNgrok
/* node:coverage disable */
