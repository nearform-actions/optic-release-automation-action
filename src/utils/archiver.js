'use strict'

const { lstat } = require('fs/promises')
const AdmZip = require('adm-zip')

const archiveItem = async (path, out) => {
  let isDirectory = false
  try {
    const stat = await lstat(path)
    isDirectory = stat.isDirectory()
  } catch (err) {
    throw new Error(
      'An error occurred while checking if file or directory: ' + err.message
    )
  }

  const zip = new AdmZip()
  try {
    if (isDirectory) {
      await zip.addLocalFolderPromise(path)
    } else {
      zip.addLocalFile(path)
    }

    await zip.writeZipPromise(out)
  } catch (err) {
    throw new Error(
      'An error occurred while zipping the build folder: ' + err.message
    )
  }
}

module.exports = {
  archiveItem,
}
