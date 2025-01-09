'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')
const { logInfo, logError } = require('../log')

const execAsync = promisify(exec)

async function logPublicIP() {
  try {
    const { stdout } = await execAsync('curl -s ipv4.icanhazip.com')
    logInfo(`Public IP Address: ${stdout.trim()}`)
  } catch (error) {
    logError(`Error fetching public IP: ${error.message}`)
  }
}

module.exports = logPublicIP
