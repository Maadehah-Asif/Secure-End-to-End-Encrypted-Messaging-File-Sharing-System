import Log from '../models/Log.js'

export async function postLog(req, res) {
  try {
    const { level, event, details } = req.body
    await Log.create({ level: level || 'info', event, details })
    console.log(`[log] ${event}`, details)
    res.json({ ok: true })
  } catch (err) {
    console.error('[log_error]', err.message)
    res.status(500).json({ error: 'Server error' })
  }
}
