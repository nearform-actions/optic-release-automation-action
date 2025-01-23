'use strict'

const { test } = require('node:test')
const sinon = require('sinon')
const actionLog = require('../src/log.js')

const setup = ({ t, status }) => {
  const logStub = sinon.stub(actionLog)
  const fetchStub = sinon.stub()

  const fetchMock = t.mock.module('node-fetch', {
    defaultExport: fetchStub.resolves({
      status,
      get json() {
        return () => {}
      },
    }),
  })

  const logMock = t.mock.module('../src/log.js', {
    defaultExport: logStub,
  })

  const callApiModule = require('../src/utils/callApi.js')
  return { logStub, callApiModule, fetchMock, logMock, fetchStub }
}

test('callApi tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/utils/callApi')]
  })

  t.afterEach(() => {
    sinon.restore()
  })

  // done
  await t.test('Call api warns if code is not 200', async t => {
    const { logStub, callApiModule, fetchMock, logMock } = setup({
      t,
      status: 401,
    })
    await callApiModule.callApi(
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
    fetchMock.restore()
    logMock.restore()
  })

  await t.test('Call api does not warn if code is 200', async t => {
    const { logStub, callApiModule, fetchMock, logMock } = setup({
      t,
      status: 200,
    })
    await callApiModule.callApi(
      {
        endpoint: 'release',
        method: 'PATCH',
        body: {},
      },
      { 'api-url': 'whatever' }
    )
    sinon.assert.notCalled(logStub.logWarning)
    fetchMock.restore()
    logMock.restore()
  })

  await t.test(
    'Call api does not append slash to api url if present',
    async t => {
      const { fetchStub, callApiModule, fetchMock, logMock } = setup({
        t,
        status: 200,
      })
      await callApiModule.callApi(
        {
          endpoint: 'release',
          method: 'PATCH',
          body: {},
        },
        { 'api-url': 'whatever/' }
      )
      sinon.assert.calledWith(fetchStub, 'whatever/release')
      fetchMock.restore()
      logMock.restore()
    }
  )

  await t.test('Call api appends slash to api url if not present', async t => {
    const { fetchStub, callApiModule, fetchMock, logMock } = setup({
      t,
      status: 200,
    })
    await callApiModule.callApi(
      {
        endpoint: 'release',
        method: 'PATCH',
        body: {},
      },
      { 'api-url': 'whatever' }
    )
    sinon.assert.calledWith(fetchStub, 'whatever/release')
    fetchMock.restore()
    logMock.restore()
  })
})
