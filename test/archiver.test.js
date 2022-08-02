'use strict'

const tap = require('tap')

tap.test('throws an error if path not found', async () => {
  const archiverModule = tap.mock('../src/utils/archiver.js', {
    'fs/promises': {
      lstat: async () => ({
        isDirectory: () => {
          throw Error()
        },
      }),
    },
  })

  tap.rejects(archiverModule.archiveItem('path', 'out.zip'))
})

tap.test('does not throw any errors', async () => {
  const archiverModule = tap.mock('../src/utils/archiver.js', {
    'fs/promises': {
      lstat: async () => ({
        isDirectory: () => true,
      }),
    },
    'adm-zip': function Mocked() {
      this.addLocalFolderPromise = async function () {
        return null
      }
      this.addLocalFile = function () {
        return null
      }
      this.writeZipPromise = async function () {
        return null
      }
    },
  })

  tap.resolves(archiverModule.archiveItem('path', 'out.zip'))
})
