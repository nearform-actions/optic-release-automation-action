'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const core = require('@actions/core')

const setup = () => {
  const coreStub = sinon.stub(core)
  const logger = proxyquire('../log', {
    '@actions/core': coreStub,
  })

  return { coreStub, logger }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('calling log with an array will stringify it', async () => {
  const { logger, coreStub } = setup()
  logger.logDebug([1, 2, 3])
  sinon.assert.calledWithExactly(coreStub.debug, '1,2,3')
})

tap.test('logDebug calls @actions/core/debug', async () => {
  const { logger, coreStub } = setup()
  logger.logDebug('Debug')
  sinon.assert.calledOnce(coreStub.debug)
  sinon.assert.notCalled(coreStub.error)
})

tap.test('logError calls @actions/core/error', async () => {
  const { logger, coreStub } = setup()
  logger.logError(new Error('not a string'))
  sinon.assert.calledOnce(coreStub.error)
  sinon.assert.notCalled(coreStub.debug)
})

tap.test('logInfo calls @actions/core/info', async () => {
  const { logger, coreStub } = setup()
  logger.logInfo('Debug')

  sinon.assert.calledOnce(coreStub.info)
  sinon.assert.notCalled(coreStub.debug)
})

tap.test('logWarning calls @actions/core/warning', async () => {
  const { logger, coreStub } = setup()
  logger.logWarning('warning')

  sinon.assert.calledOnce(coreStub.warning)
  sinon.assert.notCalled(coreStub.debug)
})
