import { Router } from 'express'
import { postSessionInit, postSessionReply, fetchMessages, consumeMessage, getSessionState, postSessionConfirm } from '../controllers/sessionsController.js'
import { requireAuth } from '../controllers/authController.js'

const router = Router()

router.post('/init', requireAuth, postSessionInit)
router.post('/reply', requireAuth, postSessionReply)
router.post('/confirm', requireAuth, postSessionConfirm)
router.get('/inbox', requireAuth, fetchMessages)
router.post('/consume/:id', requireAuth, consumeMessage)
router.get('/state/:sessionId', requireAuth, getSessionState)

export default router
