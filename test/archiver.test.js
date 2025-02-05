'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { mockModule } = require('./mockModule.js')

const setup = ({ isDirectory }) => {
  const archiverModule = mockModule('../src/utils/archiver.js', {
    'fs/promises': {
      namedExports: {
        lstat: async () => ({
          isDirectory: () => isDirectory,
        }),
      },
    },
    'adm-zip': {
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
    },
  })

  return { archiverModule }
}
describe('archiver tests', async () => {
  it('throws an error if path not found', async () => {
    const archiverModule = mockModule('../src/utils/archiver.js', {
      'fs/promises': {
        namedExports: {
          lstat: async () => ({
            isDirectory: () => {
              throw Error()
            },
          }),
        },
      },
    })
    await assert.rejects(archiverModule.archiveItem('path', 'out.zip'))
  })

  it('does not throw any errors if directory', async () => {
    const { archiverModule } = setup({ isDirectory: true })
    await assert.doesNotReject(archiverModule.archiveItem('path', 'out.zip'))
  })

  it('throws if writing to zip file fails', async () => {
    const archiverModule = mockModule('../src/utils/archiver.js', {
      'fs/promises': {
        namedExports: {
          lstat: async () => ({
            isDirectory: () => true,
          }),
        },
      },
      'adm-zip': {
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
      },
    })

    await assert.rejects(archiverModule.archiveItem('path', 'out.zip'))
  })

  it('resolves if a path is not a directory', async () => {
    const archiverModule = mockModule('../src/utils/archiver.js', {
      'fs/promises': {
        namedExports: {
          lstat: async () => ({
            isDirectory: () => false,
          }),
        },
      },
      'adm-zip': {
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
      },
    })

    await assert.doesNotReject(archiverModule.archiveItem('path', 'out.zip'))
  })

  it('does not throw any errors if file', async () => {
    const { archiverModule } = setup({ isDirectory: false })
    await assert.doesNotReject(archiverModule.archiveItem('file.js', 'out.zip'))
  })
})
