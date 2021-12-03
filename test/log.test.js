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

tap.test('calling log with an array will stringify it', async t => {
  const { logger, coreStub } = setup()
  logger.logDebug([1, 2, 3])
  t.ok(coreStub.debug.calledWith('1,2,3'))
})

tap.test('logDebug calls @actions/core/debug', async t => {
  const { logger, coreStub } = setup()
  logger.logDebug('Debug')
  t.ok(coreStub.debug.calledOnce)
  t.ok(coreStub.error.notCalled)
})

tap.test('logError calls @actions/core/error', async t => {
  const { logger, coreStub } = setup()
  logger.logError('Debug')
  t.ok(coreStub.error.calledOnce)
  t.ok(coreStub.debug.notCalled)
})

tap.test('logInfo calls @actions/core/info', async t => {
  const { logger, coreStub } = setup()
  logger.logInfo('Debug')
  t.ok(coreStub.info.calledOnce)
  t.ok(coreStub.debug.notCalled)
})

tap.test('logWarning calls @actions/core/warning', async t => {
  const { logger, coreStub } = setup()
  logger.logWarning('warning')
  t.ok(coreStub.warning.calledOnce)
  t.ok(coreStub.debug.notCalled)
})
