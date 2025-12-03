import { Router } from 'express'
import { upsertPublicKeys, getPublicKeys } from '../controllers/keysController.js'
import { requireAuth } from '../controllers/authController.js'

const router = Router()

// Authenticated upload
router.post('/', requireAuth, upsertPublicKeys)
// Public fetch
router.get('/:username', getPublicKeys)

export default router
