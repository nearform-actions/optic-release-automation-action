'use strict'

const { test } = require('node:test')
const sinon = require('sinon')
const core = require('@actions/core')

const setup = ({ t }) => {
  const coreStub = sinon.stub(core)
  const coreMock = t.mock.module('@actions/core', {
    namedExports: coreStub,
  })

  const logger = require('../src/log')
  return { coreStub, logger, coreMock }
}

test('logger tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/log')]
  })

  t.afterEach(() => {
    sinon.restore()
  })

  await t.test('calling log with an array will stringify it', async t => {
    const { logger, coreStub, coreMock } = setup({ t })
    logger.logDebug([1, 2, 3])
    sinon.assert.calledWithExactly(coreStub.debug, '1,2,3')
    coreMock.restore()
  })

  await t.test('logDebug calls @actions/core/debug', async t => {
    const { logger, coreStub, coreMock } = setup({ t })
    logger.logDebug('Debug')
    sinon.assert.calledOnce(coreStub.debug)
    sinon.assert.notCalled(coreStub.error)
    coreMock.restore()
  })

  await t.test('logError calls @actions/core/error', async t => {
    const { logger, coreStub, coreMock } = setup({ t })
    logger.logError(new Error('not a string'))
    sinon.assert.calledOnce(coreStub.error)
    sinon.assert.notCalled(coreStub.debug)
    coreMock.restore()
  })

  await t.test('logInfo calls @actions/core/info', async t => {
    const { logger, coreStub, coreMock } = setup({ t })
    logger.logInfo('Debug')
    sinon.assert.calledOnce(coreStub.info)
    sinon.assert.notCalled(coreStub.debug)
    coreMock.restore()
  })

  await t.test('logWarning calls @actions/core/warning', async t => {
    const { logger, coreStub, coreMock } = setup({ t })
    logger.logWarning('warning')
    sinon.assert.calledOnce(coreStub.warning)
    sinon.assert.notCalled(coreStub.debug)
    coreMock.restore()
  })
})
