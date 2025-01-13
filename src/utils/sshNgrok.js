'use strict'

const { spawn } = require('child_process')
const { logInfo } = require('../log')
const fs = require('fs')
const os = require('os')
const path = require('path')

class SSHNgrok {
  constructor(sshKey) {
    if (!sshKey) {
      throw new Error('SSH key is required')
    }
    this.sshKey = sshKey
  }

  async createTunnel(port) {
    const sshPath = path.join(os.homedir(), '.ssh')
    const keyPath = path.join(sshPath, 'ngrok_key')

    return new Promise(async (resolve, reject) => {
      try {
        // Create .ssh directory with correct permissions
        await fs.promises.mkdir(sshPath, { recursive: true, mode: 0o700 })

        // Write key with correct permissions
        logInfo('Setting up SSH key...')
        await fs.promises.writeFile(keyPath, this.sshKey, { mode: 0o600 })

        logInfo('Starting SSH tunnel...')
        this.sshProcess = spawn(
          'ssh',
          [
            '-o',
            'StrictHostKeyChecking=accept-new', // Changed based on article
            '-i',
            keyPath,
            '-R',
            `0:localhost:${port}`,
            'v2@connect.ngrok-agent.com',
            'http',
          ],
          {
            stdio: 'pipe',
          }
        )

        let url = null

        this.sshProcess.stdout.on('data', data => {
          const output = data.toString()
          logInfo('SSH stdout:', output)

          if (output.includes('url=')) {
            url = output.match(/url=(.+)/)[1].trim()
            logInfo('Found tunnel URL:', url)
            resolve({
              url,
              close: async () => {
                if (this.sshProcess) {
                  this.sshProcess.kill()
                  this.sshProcess = null
                  // Cleanup key file
                  try {
                    await fs.promises.unlink(keyPath)
                  } catch (err) {
                    logInfo('Cleanup error:', err)
                  }
                }
              },
            })
          }
        })

        this.sshProcess.stderr.on('data', data => {
          const error = data.toString()
          logInfo('SSH stderr:', error)

          if (error.includes('url=')) {
            url = error.match(/url=(.+)/)[1].trim()
            logInfo('Found tunnel URL in stderr:', url)
            resolve({
              url,
              close: async () => {
                if (this.sshProcess) {
                  this.sshProcess.kill()
                  this.sshProcess = null
                  // Cleanup key file
                  try {
                    await fs.promises.unlink(keyPath)
                  } catch (err) {
                    logInfo('Cleanup error:', err)
                  }
                }
              },
            })
          }
        })

        this.sshProcess.on('error', error => {
          logInfo('SSH process error:', error)
          fs.promises.unlink(keyPath).catch(() => {})
          reject(error)
        })

        this.sshProcess.on('close', code => {
          logInfo('SSH process closed with code:', code)
          if (!url) {
            fs.promises.unlink(keyPath).catch(() => {})
            reject(new Error(`SSH process exited with code ${code}`))
          }
        })

        // Set timeout
        setTimeout(() => {
          if (!url) {
            logInfo('Tunnel creation timed out')
            fs.promises.unlink(keyPath).catch(() => {})
            if (this.sshProcess) {
              this.sshProcess.kill()
              this.sshProcess = null
            }
            reject(new Error('Timeout waiting for ngrok tunnel'))
          }
        }, 300000)
      } catch (error) {
        logInfo('Error in tunnel creation:', error)
        fs.promises.unlink(keyPath).catch(() => {})
        reject(error)
      }
    })
  }
}

module.exports = SSHNgrok
