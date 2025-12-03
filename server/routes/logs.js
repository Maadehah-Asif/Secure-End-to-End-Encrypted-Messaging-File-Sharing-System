import { Router } from 'express'
import { postLog } from '../controllers/logsController.js'
import { requireAuth } from '../controllers/authController.js'

const router = Router()
router.post('/', requireAuth, postLog)
export default router
