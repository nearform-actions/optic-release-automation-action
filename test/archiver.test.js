'use strict'

const tap = require('tap')

const setup = ({ isDirectory }) => {
  const archiverModule = tap.mock('../src/utils/archiver.js', {
    'fs/promises': {
      lstat: async () => ({
        isDirectory: () => isDirectory,
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

  return { archiverModule }
}

tap.test('throws an error if path not found', async t => {
  const archiverModule = tap.mock('../src/utils/archiver.js', {
    'fs/promises': {
      lstat: async () => ({
        isDirectory: () => {
          throw Error()
        },
      }),
    },
  })

  t.rejects(archiverModule.archiveItem('path', 'out.zip'))
})

tap.test('does not throw any errors if directory', async t => {
  const { archiverModule } = setup({ isDirectory: true })

  t.resolves(archiverModule.archiveItem('path', 'out.zip'))
})

tap.test('does not throw any errors if file', async t => {
  const { archiverModule } = setup({ isDirectory: false })

  t.resolves(archiverModule.archiveItem('file.js', 'out.zip'))
})
