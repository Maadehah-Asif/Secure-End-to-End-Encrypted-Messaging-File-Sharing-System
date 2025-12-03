import { Router } from 'express'
import { postFileChunk, getFileChunks } from '../controllers/filesController.js'
import { requireAuth } from '../controllers/authController.js'

const router = Router()

router.post('/chunk', requireAuth, postFileChunk)
router.get('/:sessionId', requireAuth, getFileChunks)

export default router
