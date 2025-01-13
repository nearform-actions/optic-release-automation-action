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
    const keyPath = path.join(os.tmpdir(), `ngrok-key-${Date.now()}`)

    return new Promise(async (resolve, reject) => {
      try {
        // Write key to temporary file
        logInfo('Setting up SSH key...')
        await fs.promises.writeFile(keyPath, this.sshKey, { mode: 0o600 })

        logInfo('Starting SSH tunnel...')
        this.sshProcess = spawn(
          'ssh',
          [
            '-v',
            '-o',
            'StrictHostKeyChecking=no',
            '-o',
            'UserKnownHostsFile=/dev/null',
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

        // Log the command being run (without the key)
        logInfo('Running SSH command:', this.sshProcess.spawnargs.join(' '))

        let url = null

        this.sshProcess.stdout.on('data', data => {
          const output = data.toString()
          logInfo('SSH stdout:', output)

          if (output.includes('url=')) {
            url = output.match(/url=(.+)/)[1].trim()
            logInfo('Found tunnel URL:', url)
            cleanup()
            resolve({
              url,
              close: () => {
                if (this.sshProcess) {
                  this.sshProcess.kill()
                  this.sshProcess = null
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
            cleanup()
            resolve({
              url,
              close: () => {
                if (this.sshProcess) {
                  this.sshProcess.kill()
                  this.sshProcess = null
                }
              },
            })
          }
        })

        this.sshProcess.on('error', error => {
          logInfo('SSH process error:', error)
          cleanup()
          reject(error)
        })

        this.sshProcess.on('close', code => {
          logInfo('SSH process closed with code:', code)
          if (!url) {
            cleanup()
            reject(new Error(`SSH process exited with code ${code}`))
          }
        })

        // Cleanup function
        const cleanup = () => {
          try {
            fs.unlinkSync(keyPath)
          } catch (err) {
            logInfo('Cleanup error:', err)
          }
        }

        // Set timeout
        setTimeout(() => {
          if (!url) {
            logInfo('Tunnel creation timed out')
            cleanup()
            if (this.sshProcess) {
              this.sshProcess.kill()
              this.sshProcess = null
            }
            reject(new Error('Timeout waiting for ngrok tunnel'))
          }
        }, 300000)
      } catch (error) {
        logInfo('Error in tunnel creation:', error)
        try {
          fs.unlinkSync(keyPath)
        } catch (err) {
          logInfo('Cleanup error:', err)
        }
        reject(error)
      }
    })
  }
}

module.exports = SSHNgrok
