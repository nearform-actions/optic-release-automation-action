'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const actionLog = require('../src/log')

const setup = status => {
  const logStub = sinon.stub(actionLog)
  const fetchStub = sinon.stub()
  const callApiProxy = proxyquire('../src/utils/callApi', {
    '../log': logStub,
    'node-fetch': fetchStub.resolves({
      status,
      get json() {
        return () => {}
      },
    }),
  })
  return { logStub, callApiProxy, fetchStub }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('Call api warns if code is not 200', async () => {
  const { logStub, callApiProxy } = setup(401)
  await callApiProxy.callApi(
    {
      endpoint: 'release',
      method: 'PATCH',
      body: {},
    },
    {
      'api-url': 'whatever',
    }
  )
  sinon.assert.calledOnce(logStub.logWarning)
})

tap.test('Call api does not warn if code is  200', async () => {
  const { logStub, callApiProxy } = setup(200)
  await callApiProxy.callApi(
    {
      endpoint: 'release',
      method: 'PATCH',
      body: {},
    },
    { 'api-url': 'whatever' }
  )
  sinon.assert.notCalled(logStub.logWarning)
})

tap.test('Call api does not append slash to api url if present', async () => {
  const { fetchStub, callApiProxy } = setup(200)
  await callApiProxy.callApi(
    {
      endpoint: 'release',
      method: 'PATCH',
      body: {},
    },
    { 'api-url': 'whatever/' }
  )
  sinon.assert.calledWith(fetchStub, 'whatever/release')
})

tap.test('Call api appends slash to api url if not present', async () => {
  const { fetchStub, callApiProxy } = setup(200)
  await callApiProxy.callApi(
    {
      endpoint: 'release',
      method: 'PATCH',
      body: {},
    },
    { 'api-url': 'whatever' }
  )
  sinon.assert.calledWith(fetchStub, 'whatever/release')
})
