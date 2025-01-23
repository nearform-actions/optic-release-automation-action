'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const setup = ({ t, isDirectory }) => {
  const fsMock = t.mock.module('fs/promises', {
    namedExports: {
      lstat: async () => ({
        isDirectory: () => isDirectory,
      }),
    },
  })

  const zipMock = t.mock.module('adm-zip', {
    defaultExport: function MockedZip() {
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

  const archiverModule = require('../src/utils/archiver.js')
  return { archiverModule, fsMock, zipMock }
}
test('archiver tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/utils/archiver.js')]
  })

  await t.test('throws an error if path not found', async t => {
    const fsMock = t.mock.module('fs/promises', {
      namedExports: {
        lstat: async () => ({
          isDirectory: () => {
            throw Error()
          },
        }),
      },
    })
    const archiverModule = require('../src/utils/archiver.js')
    await assert.rejects(archiverModule.archiveItem('path', 'out.zip'))
    fsMock.restore()
  })

  await t.test('does not throw any errors if directory', async t => {
    const { archiverModule, zipMock, fsMock } = setup({ t, isDirectory: true })
    await assert.doesNotReject(archiverModule.archiveItem('path', 'out.zip'))
    fsMock.restore()
    zipMock.restore()
  })

  await t.test('throws if writing to zip file fails', async t => {
    const fsMock = t.mock.module('fs/promises', {
      namedExports: {
        lstat: async () => ({
          isDirectory: () => true,
        }),
      },
    })

    const zipMock = t.mock.module('adm-zip', {
      defaultExport: function MockedZip() {
        this.addLocalFolderPromise = async function () {
          return null
        }
        this.addLocalFile = function () {
          return null
        }
        this.writeZipPromise = async function () {
          return Promise.reject()
        }
      },
    })

    const archiverModule = require('../src/utils/archiver.js')
    await assert.rejects(archiverModule.archiveItem('path', 'out.zip'))
    fsMock.restore()
    zipMock.restore()
  })

  await t.test('resolves if a path is not a directory', async t => {
    const fsMock = t.mock.module('fs/promises', {
      namedExports: {
        lstat: async () => ({
          isDirectory: () => false,
        }),
      },
    })
    const zipMock = t.mock.module('adm-zip', {
      defaultExport: function MockedZip() {
        this.addLocalFolderPromise = async function () {
          return Promise.reject()
        }
        this.addLocalFile = function () {
          return undefined
        }
        this.writeZipPromise = async function () {
          return null
        }
      },
    })
    const archiverModule = require('../src/utils/archiver.js')
    await assert.doesNotReject(archiverModule.archiveItem('path', 'out.zip'))
    fsMock.restore()
    zipMock.restore()
  })

  await t.test('does not throw any errors if file', async t => {
    const { archiverModule, fsMock, zipMock } = setup({ t, isDirectory: false })

    await assert.doesNotReject(archiverModule.archiveItem('file.js', 'out.zip'))
    fsMock.restore()
    zipMock.restore()
  })
})
