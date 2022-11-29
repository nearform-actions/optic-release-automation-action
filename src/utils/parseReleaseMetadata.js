'use strict'

module.exports = function parseReleaseMetadata(pr) {
  try {
    return JSON.parse(
      pr.body.substring(
        pr.body.indexOf('<release-meta>') + 14,
        pr.body.lastIndexOf('</release-meta>')
      )
    )
  } catch (err) {
    throw new Error(`Error while parsing metadata: ${err.message}`)
  }
}
