'use strict'

const { spawn } = require('child_process')
const { logInfo } = require('../log')

class SSHNgrok {
  constructor(sshKey) {
    if (!sshKey) {
      throw new Error('SSH key is required')
    }
    this.sshKey = sshKey
  }

  async createTunnel(port) {
    return new Promise((resolve, reject) => {
      logInfo('Starting SSH tunnel...')

      this.sshProcess = spawn(
        'ssh',
        [
          '-v',
          '-i',
          '/dev/stdin', // Read key from stdin
          '-R',
          `0:localhost:${port}`,
          'v2@connect.ngrok-agent.com',
          'http',
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'], // Changed to 'pipe' to write to stdin
        }
      )

      // Write the SSH key to stdin
      this.sshProcess.stdin.write(this.sshKey)
      this.sshProcess.stdin.end()

      let url = null

      this.sshProcess.stdout.on('data', data => {
        const output = data.toString()
        logInfo('Ngrok output:', output)

        if (output.includes('url=')) {
          url = output.match(/url=(.+)/)[1].trim()
          logInfo('Tunnel URL:', url)
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
        console.error('Ngrok error:', error)

        if (error.includes('url=')) {
          url = error.match(/url=(.+)/)[1].trim()
          logInfo('Tunnel URL:', url)
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
        console.error('SSH process error:', error)
        reject(error)
      })

      this.sshProcess.on('close', code => {
        if (!url) {
          reject(new Error(`SSH process exited with code ${code}`))
        }
      })

      setTimeout(() => {
        if (!url) {
          if (this.sshProcess) {
            this.sshProcess.kill()
            this.sshProcess = null
          }
          reject(new Error('Timeout waiting for ngrok tunnel'))
        }
      }, 300000) // 5 minutes timeout
    })
  }
}

module.exports = SSHNgrok
