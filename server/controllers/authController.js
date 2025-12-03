import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { writeLog } from '../utils/logger.js'

function log(event, details) {
  console.log(`[auth] ${event}`, details);
}

export async function register(req, res) {
  try {
    const { fullName, email, username, password, confirmPassword } = req.body;
    if (!fullName || !email || !username || !password || !confirmPassword) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // username rules: min length 3, lowercase only, no spaces
    if (typeof username !== 'string' || username.length < 3 || /\s/.test(username) || username !== username.toLowerCase()) {
      return res.status(400).json({ error: 'Invalid username: must be at least 3 chars, lowercase, no spaces' });
    }

    // email basic format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email format' })

    // password rules
    const pw = password
    if (pw.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
    if (!/[A-Z]/.test(pw)) return res.status(400).json({ error: 'Password must include at least one uppercase letter' })
    if (!/[a-z]/.test(pw)) return res.status(400).json({ error: 'Password must include at least one lowercase letter' })
    if (!/[0-9]/.test(pw)) return res.status(400).json({ error: 'Password must include at least one number' })
    if (!/[!@#$%^&*(),.?":{}|<>\[\]\\/;:'`~_+=-]/.test(pw)) return res.status(400).json({ error: 'Password must include at least one special character' })

    if (password !== confirmPassword) return res.status(400).json({ error: 'Password and confirmPassword must match' })

    // uniqueness checks
    const existingEmail = await User.findOne({ email })
    if (existingEmail) return res.status(409).json({ error: 'Email already taken' })
    const existingUsername = await User.findOne({ username: username.toLowerCase() })
    if (existingUsername) return res.status(409).json({ error: 'Username already taken' })

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await User.create({ fullName, email, username: username.toLowerCase(), passwordHash });
    log('register_success', { userId: user._id.toString(), email, username });
    return res.status(201).json({ user: { id: user._id, fullName: user.fullName, email: user.email, username: user.username } });
  } catch (err) {
    log('register_error', { message: err.message });
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function login(req, res) {
  try {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const user = await User.findOne({
      $or: [{ email: emailOrUsername }, { username: emailOrUsername }]
    });
    if (!user) {
      log('login_fail_no_user', { principal: emailOrUsername });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      log('login_fail_bad_password', { userId: user._id.toString() });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { uid: user._id.toString(), username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30m' }
    );
    log('login_success', { userId: user._id.toString() });
    return res.json({
      token,
      user: { id: user._id, fullName: user.fullName, email: user.email, username: user.username }
    });
  } catch (err) {
    log('login_error', { message: err.message });
    return res.status(500).json({ error: 'Server error' });
  }
}

export function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { uid: payload.uid, username: payload.username };
    writeLog('authentication_attempt', { ok: true, username: payload.username, ip: req.ip });
    next();
  } catch (err) {
    writeLog('authentication_attempt', { ok: false, reason: err.message, ip: req.ip });
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export async function me(req, res) {
  try {
    const user = await User.findById(req.user.uid).select('fullName email username');
    if (!user) return res.status(404).json({ error: 'Not found' });
    console.log('[auth] me_access', { userId: req.user.uid });
    res.json({ user: { id: req.user.uid, fullName: user.fullName, email: user.email, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}
