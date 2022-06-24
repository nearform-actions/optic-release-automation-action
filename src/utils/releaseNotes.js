'use strict'

const md = require('markdown-it')()

function getPrNumbersFromReleaseNotes(releaseNotes) {
  const parsedReleaseNotes = md.parse(releaseNotes)
  const prTokens = parsedReleaseNotes.filter(token => token.type === 'inline')

  const allPrNumbers = prTokens
    .map(token => {
      const urlMatch = token.content.match(/\bhttps?:\/\/\S+/gi)

      if (!urlMatch) {
        return
      }

      const lastUrlPart = urlMatch[0].split('/').pop()

      // Filter out the full change log numbers such as v1.0.1...v1.0.2
      const prNumberMatch = lastUrlPart.match(/^\d+$/)

      if (!prNumberMatch) {
        return
      }

      return prNumberMatch[0]
    })
    .filter(prNumber => Boolean(prNumber))

  return [...new Set(allPrNumbers)]
}

exports.getPrNumbersFromReleaseNotes = getPrNumbersFromReleaseNotes
