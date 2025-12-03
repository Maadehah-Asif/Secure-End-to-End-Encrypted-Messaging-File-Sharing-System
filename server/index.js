import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import keysRoutes from './routes/keys.js';
import sessionsRoutes from './routes/sessions.js';
import logsRoutes from './routes/logs.js';
import messagesRoutes from './routes/messages.js';
import filesRoutes from './routes/files.js';
import usersRoutes from './routes/users.js';
import { ensureUpdatedIndexes } from './utils/indexes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

app.use(cors({ origin: [FRONTEND_ORIGIN, 'http://localhost:5173'], credentials: true }));
// Increase JSON body size to accommodate encrypted file chunks
app.use(express.json({ limit: '5mb' }));

connectDB();
ensureUpdatedIndexes().catch(()=>{});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/users', usersRoutes);

app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});
