'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const transformCommitMessage = require('../src/utils/commitMessage')

test('Handles normal commit messages', async () => {
  assert.equal(
    'Release v5.1.0',
    transformCommitMessage('Release {version}', 'v5.1.0')
  )
})

test('Handles customized messages', async () => {
  assert.equal(
    '[v5.1.0] Released! Some long text goes here!',
    transformCommitMessage(
      '[{version}] Released! Some long text goes here!',
      'v5.1.0'
    )
  )
})

test('Handles messages with quotes', async () => {
  assert.equal(
    '[v5.1.0] \\"Quotes\\"',
    transformCommitMessage('[{version}] "Quotes"', 'v5.1.0')
  )
})
