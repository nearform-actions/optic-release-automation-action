'use strict'

const tap = require('tap')
const transformCommitMessage = require('../src/utils/commitMessage')

tap.test('Handles normal commit messages', async t => {
  t.equal(
    'Release v5.1.0',
    transformCommitMessage('Release {version}', 'v5.1.0')
  )
})

tap.test('Handles customized messages', async t => {
  t.equal(
    '[v5.1.0] Released! Some long text goes here!',
    transformCommitMessage(
      '[{version}] Released! Some long text goes here!',
      'v5.1.0'
    )
  )
})

tap.test('Handles messages with quotes', async t => {
  t.equal(
    '[v5.1.0] \\"Quotes\\"',
    transformCommitMessage('[{version}] "Quotes"', 'v5.1.0')
  )
})
