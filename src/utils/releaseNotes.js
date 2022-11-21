'use strict'

const md = require('markdown-it')()
const uniqWith = require('lodash.uniqwith')
const isEqual = require('lodash.isequal')

function getPrNumbersFromReleaseNotes(releaseNotes) {
  const parsedReleaseNotes = md.parse(releaseNotes)
  const prTokens = parsedReleaseNotes.filter(token => token.type === 'inline')

  const allPrNumbers = prTokens.map(token => {
    const urlMatch = token.content.match(/\bhttps?:\/\/\S+/gi)

    if (!urlMatch?.length) {
      return
    }

    const urlParts = urlMatch[0].split('/')

    const lastUrlPart = urlParts[lastUrlPart.length - 1]
    const repoOwner = urlParts[3]
    const repoName = urlParts[4]

    // Filter out the full change log numbers such as v1.0.1...v1.0.2
    const prNumberMatch = lastUrlPart.match(/^\d+$/)

    if (
      !prNumberMatch?.length ||
      !prNumberMatch[0] ||
      !repoOwner ||
      !repoName
    ) {
      return
    }

    return { prNumber: prNumberMatch[0], repoOwner, repoName }
  })

  return uniqWith(allPrNumbers, isEqual)
}

exports.getPrNumbersFromReleaseNotes = getPrNumbersFromReleaseNotes
