import { Router } from 'express'
import { postMessage, getMessages } from '../controllers/messagesController.js'
import { requireAuth } from '../controllers/authController.js'

const router = Router()

router.post('/', requireAuth, postMessage)
router.get('/:sessionId', requireAuth, getMessages)

export default router
