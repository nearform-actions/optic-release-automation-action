'use strict'

const tap = require('tap')

tap.test('throws an error if path not found', async () => {
  const archiverModule = tap.mock('../src/utils/archiver.js', {
    'fs/promises': {
      lstat: () => ({
        isDirectory: () => {
          throw Error()
        },
      }),
    },
  })

  try {
    await archiverModule.archiveItem()
  } catch (err) {
    tap.type(err, Error)
  }
})
