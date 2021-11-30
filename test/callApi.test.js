'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const actionLog = require('../log')

const setup = status => {
  const logStub = sinon.stub(actionLog)
  const fetchStub = sinon.stub()
  const callApiProxy = proxyquire('../utils/callApi', {
    '../log': logStub,
    'node-fetch': fetchStub.resolves({
      status,
      get json() {
        return () => {}
      },
    }),
  })
  return { logStub, callApiProxy }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('Call api warns if code is not 200', async t => {
  const { logStub, callApiProxy } = setup(401)
  await callApiProxy.callApi(
    {
      endpoint: 'release',
      method: 'PATCH',
      body: {},
    },
    {}
  )
  t.ok(logStub.logWarning.calledOnce)
})

tap.test('Call api does not warn if code is  200', async t => {
  const { logStub, callApiProxy } = setup(200)
  await callApiProxy.callApi(
    {
      endpoint: 'release',
      method: 'PATCH',
      body: {},
    },
    {}
  )
  t.ok(logStub.logWarning.notCalled)
})
