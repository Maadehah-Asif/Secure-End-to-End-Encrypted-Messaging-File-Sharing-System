import { Router } from 'express'
import { postSessionInit, postSessionReply, fetchMessages, consumeMessage } from '../controllers/sessionsController.js'
import { requireAuth } from '../controllers/authController.js'

const router = Router()

router.post('/init', requireAuth, postSessionInit)
router.post('/reply', requireAuth, postSessionReply)
router.get('/inbox', requireAuth, fetchMessages)
router.post('/consume/:id', requireAuth, consumeMessage)

export default router
