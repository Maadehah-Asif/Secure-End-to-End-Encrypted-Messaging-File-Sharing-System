import fs from 'fs'
import path from 'path'

const logsDir = path.join(process.cwd(), 'logs')
const securityLog = path.join(logsDir, 'security.log')

function ensureDir() {
  try { fs.mkdirSync(logsDir, { recursive: true }) } catch {}
}

export function writeLog(event, details = {}) {
  ensureDir()
  const line = JSON.stringify({ ts: new Date().toISOString(), event, details }) + '\n'
  try { fs.appendFileSync(securityLog, line) } catch {}
}

export function getLogFilePath() { return securityLog }
