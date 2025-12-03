import { Router } from 'express'
import { listUsers } from '../controllers/usersController.js'
import { requireAuth } from '../controllers/authController.js'

const router = Router()

router.get('/', requireAuth, listUsers)

export default router
