# CipherLink Secure Chat — Information Security Project

## Overview
- **Purpose:** Demonstrates a secure end-to-end messaging and file-sharing system with a group-unique cryptographic protocol variant tailored to course requirements.
- **Stack:** React (Vite) client; Node.js/Express server; MongoDB for persistence.
- **Branding:** Application name "CipherLink" with a consistent header and landing experience.
- **Scope:** Client-side encryption of messages and files; server stores ciphertext and minimal metadata for routing and replay protection.

## Key Features
- **WhatsApp-like chat UX:** Optimistic sends, left/right bubbles, activity log, non-destructive refresh merging.
- **Secure sessions:** Ephemeral ECDH per conversation; handshake signed using long-term ECDSA identity keys.
- **Group-unique protocol:** Distinct HKDF info strings, deterministic HKDF salt, unique AAD formats, and standardized envelopes.
- **File transfer:** Chunked AES-GCM encryption with deterministic AAD; download reassembly with integrity checks.
- **Key management:** Local generation and storage of identity keys (ECDSA) wrapped under a user passphrase.
- **Replay protection:** Counters and nonces tracked locally and on the server; stale message rejection.

## Architecture
- **Client:**
  - `react-router-dom` for navigation.
  - `MainLayout` provides sticky header and full-width landing option.
  - `AuthLayout` for 2-column auth views with logo and tagline.
  - Session logic under `client/src/session/*` (handshake, messaging, files).
  - Protocol constants under `client/src/constants/protocol.js`.
- **Server:**
  - REST routes under `server/routes/*`.
  - Controllers under `server/controllers/*`.
  - Models: `User`, `SessionMessage`, `SessionState`, and content models for messages/files.
  - Logging via JSON lines and DB logs for audit and replay analysis.

## Security Protocol
- **Identity keys:** ECDSA P-256 (long-term). Public keys are shared with the server; private keys are wrapped locally with a passphrase.
- **Session keys:** Ephemeral ECDH P-256 per session → HKDF(SHA-256) → AES-256-GCM.
- **HKDF info strings:**
  - `HKDF_INFO_SESSION = "{GROUP_TAG}/session-key/v1"`
  - `HKDF_INFO_FILE = "{GROUP_TAG}/file-key/v1"`
  - `HKDF_INFO_HANDSHAKE = "{GROUP_TAG}/handshake/v1"`
- **HKDF salt (deterministic):** `SHA-256("nonceInit|nonceReply|canonicalInitId|GROUP_TAG")`.
- **Handshake signatures:** ECDSA over exact, canonical inputs.
  - `SESSION_INIT`: `cl-init|v2022|{GROUP_TAG}|init-pending|{from}|{to}|{ephemeralPubB64}|{nonceB64}|{timestamp}`
  - `SESSION_REPLY`: `cl-reply|v2022|{GROUP_TAG}|{inReplyTo}|{from}|{ephemeralPubB64}|{nonceB64}|{timestamp}`
- **KEY_CONFIRM:** Proves both parties derived the same session key.
  - Plaintext: `cl-key-confirm|v2022|{GROUP_TAG}|{sessionId}|{nonceInit}|{nonceReply}|{tsInit}|{tsReply}`
  - AAD: `AAD_HANDSHAKE_PREFIX|confirm|{sessionId}|{fromUsername}|{tsConfirm}`
  - Encryption: AES-256-GCM using the derived session key and handshake AAD.
- **Message AAD and envelope:**
  - AAD: `cl-msg-v2022|{GROUP_TAG}|{sessionId}|{from}|{counter}|{timestamp}`
  - Envelope fields include `proto`, `group`, `session`, `from`, `ctr`, `ts`, and `aad`.
- **File AAD and envelope:**
  - AAD: `cl-file-v2022|{GROUP_TAG}|{sessionId}|{from}|{fileCounter}|{timestamp}|{filename}` (and per-chunk fields as needed).
- **Password hashing:** Server uses Argon2id for `User.passwordHash`.

## Prerequisites
- **OS:** Windows 10 or later (PowerShell 5.1 default shell).
- **Runtime:**
  - Node.js 18 or later.
  - MongoDB (local or remote connection string).
- **Environment:**
  - Ensure `JWT_SECRET` and `MONGODB_URI` are set.

## Setup
1. **Clone repository and install dependencies:**
```powershell
cd "C:\Projects\2)Work_Projects\Info-Sec Project\Information-Security-Project"
# Server deps
cd server; npm install
# Client deps
cd ..\client; npm install
```
2. **Configure environment variables:**
   - Create `server/.env` with:
```powershell
# server/.env
JWT_SECRET=ChangeMeToAStrongSecret
MONGODB_URI=mongodb://localhost:27017/cipherlink
PORT=4000
```
3. **Start the server:**
```powershell
cd "C:\Projects\2)Work_Projects\Info-Sec Project\Information-Security-Project\server"
npm run dev
```
4. **Start the client:**
```powershell
cd "C:\Projects\2)Work_Projects\Info-Sec Project\Information-Security-Project\client"
npm run dev
```
5. **Access the app:**
   - Client: default Vite dev server (e.g., http://localhost:5173).
   - API: `http://localhost:4000`.

## Usage Guide
- **Register and login:** Create an account; login yields a JWT used by the client.
- **Unlock keys:** Provide the local passphrase to unwrap ECDSA/ECDH private keys.
- **Establish session:**
  - Initiator sends `SESSION_INIT`.
  - Responder verifies and sends `SESSION_REPLY`.
  - Initiator posts `KEY_CONFIRM`; responder verifies.
  - Session becomes ready; message send/refresh controls enable.
- **Send messages:** Compose and send; the client performs AES-GCM encryption and posts ciphertext with envelope metadata.
- **Transfer files:** Select a file; the client encrypts chunks, uploads, and emits a notification message.
- **Download files:** Refresh files list and download; decryption reconstructs AAD deterministically.

## API Summary (selected)
- `POST /api/auth/register` — Create user.
- `POST /api/auth/login` — Obtain JWT.
- `GET /api/keys/:username` — Public key retrieval.
- `POST /api/sessions/init` — Send `SESSION_INIT`.
- `POST /api/sessions/reply` — Send `SESSION_REPLY`.
- `POST /api/sessions/confirm` — Send `KEY_CONFIRM`.
- `GET /api/sessions/inbox` — Fetch incoming session messages.
- `POST /api/sessions/consume/:id` — Mark a session message consumed.
- `GET /api/messages/:sessionId` — Fetch ciphertext messages.
- `POST /api/messages` — Post ciphertext message.
- `GET /api/files/:sessionId` — List available files.
- `POST /api/files` — Upload file chunk.

## Design Decisions and Rationale
- **Deterministic AAD:** Ensures decryption uses a reproducible string tying messages/files to the protocol version, group tag, session id, and counters.
- **Canonical session id:** The server’s `SESSION_INIT` document `_id` becomes the shared `sessionId` across both parties.
- **Replay and freshness:** Timestamp windows and counter tracking reject stale or duplicate messages.
- **Minimal server knowledge:** The server stores ciphertext and minimal envelope fields; it never sees plaintext or private keys.

## Troubleshooting
- **Cannot start server (port in use):** Adjust `PORT` in `server/.env`.
- **JWT errors:** Verify `JWT_SECRET` is set and consistent across runs.
- **MongoDB connection failures:** Ensure `MONGODB_URI` points to a reachable instance; check service status.
- **Vite or esbuild errors:** Clear `node_modules` and reinstall; ensure Node.js version is supported.
```powershell
# Clean install both apps
cd "C:\Projects\2)Work_Projects\Info-Sec Project\Information-Security-Project\server"; rm -r node_modules; npm install
cd "C:\Projects\2)Work_Projects\Info-Sec Project\Information-Security-Project\client"; rm -r node_modules; npm install
```
- **Handshake not confirming:** Check system clock synchronization and ensure both clients have valid identity keys unlocked with the correct passphrase.



