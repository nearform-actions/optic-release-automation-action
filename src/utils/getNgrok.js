'use strict'

async function getNgrok() {
  return await import('ngrok')
}

module.exports = getNgrok
