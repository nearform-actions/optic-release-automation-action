'use strict'

const tap = require('tap')

const { getPrNumbersFromReleaseNotes } = require('../src/utils/releaseNotes')

tap.test('Should return the correct PR numbers', async () => {
  const testReleaseNotes = `
    ## Whats Changed\n +
    * chore 15 by @people in https://github.com/owner/repo/pull/13\n
    * chore 18 by @people in https://github.com/owner/repo/pull/15\n
    * chore 19 by @people in https://github.com/owner/repo/pull/16\n
    * chore 21 by @people in https://github.com/owner/repo/pull/18\n
    * fix 26 by @people in https://github.com/owner/repo/pull/42\n
    * feature 30 by @people in https://github.com/owner/repo/pull/50\n
    * fix 27 by @people in https://github.com/owner/repo/pull/52\n
    * fix 32 by @people in https://github.com/external-owner/external-repo/pull/53\n
    \n
    \n
    ## New Contributors\n
    * @people made their first contribution in https://github.com/owner/repo/pull/13\n
    * @people made their first contribution in https://github.com/owner/repo/pull/16\n
    * @people made their first contribution in https://github.com/owner/repo/pull/42\n
    * @people made their first contribution in https://github.com/owner/repo/pull/53\n
    \n
    \n
    ## New documentation\n
    * Link: https://somewhere.com/on/the/internet
    \n
    \n
    **Full Changelog**: https://github.com/owner/repo/compare/v1.0.20...v1.1.0
`

  const result = getPrNumbersFromReleaseNotes(testReleaseNotes)
  const expected = [
    {
      prNumber: '13',
      repoOwner: 'owner',
      repoName: 'repo',
    },
    {
      prNumber: '15',
      repoOwner: 'owner',
      repoName: 'repo',
    },
    {
      prNumber: '16',
      repoOwner: 'owner',
      repoName: 'repo',
    },
    {
      prNumber: '18',
      repoOwner: 'owner',
      repoName: 'repo',
    },
    {
      prNumber: '42',
      repoOwner: 'owner',
      repoName: 'repo',
    },
    {
      prNumber: '50',
      repoOwner: 'owner',
      repoName: 'repo',
    },
    {
      prNumber: '52',
      repoOwner: 'owner',
      repoName: 'repo',
    },
    {
      prNumber: '53',
      repoOwner: 'external-owner',
      repoName: 'external-repo',
    },
    {
      prNumber: '53',
      repoOwner: 'owner',
      repoName: 'repo',
    },
  ]

  tap.same(result, expected)
})
