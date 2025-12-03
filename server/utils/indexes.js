import FileChunk from '../models/FileChunk.js'
import crypto from 'crypto'

export async function ensureUpdatedIndexes() {
  try {
    const indexes = await FileChunk.collection.indexes()
    // Drop legacy index that used plaintext filename
    for (const idx of indexes) {
      const key = idx.key || {}
      if (key.sessionId && key.filename && key.chunkIndex) {
        try {
          await FileChunk.collection.dropIndex(idx.name)
          console.log('[indexes] dropped legacy index', idx.name)
        } catch (e) {
          console.warn('[indexes] drop legacy index failed', idx.name, e.message)
        }
      }
    }
    // Backfill filenameHash for legacy documents (null/missing)
    try {
      const cursor = FileChunk.find({ $or: [{ filenameHash: { $exists: false } }, { filenameHash: null }] }).cursor()
      for await (const doc of cursor) {
        try {
          // Use a stable surrogate: hash of filenameCiphertext
          const b = Buffer.from(doc.filenameCiphertext || '', 'base64')
          const h = crypto.createHash('sha256').update(b).digest('base64')
          doc.filenameHash = h
          await doc.save()
        } catch (e) {
          console.warn('[indexes] backfill filenameHash failed for', doc._id.toString(), e.message)
        }
      }
    } catch (e) {
      console.warn('[indexes] error during filenameHash backfill', e.message)
    }

    // De-duplicate legacy documents by making filenameHash unique per duplicate tuple
    try {
      const cursor2 = FileChunk.find({}).sort({ sessionId: 1, filenameHash: 1, chunkIndex: 1, createdAt: 1 }).cursor()
      const seen = new Set()
      for await (const doc of cursor2) {
        const key = `${doc.sessionId}::${doc.filenameHash || 'null'}::${doc.chunkIndex}`
        if (seen.has(key)) {
          // Mutate filenameHash to a unique variant to avoid unique index conflicts
          try {
            doc.filenameHash = `${doc.filenameHash || 'null'}:${doc._id.toString()}`
            await doc.save()
          } catch (e) {
            console.warn('[indexes] dedupe adjust failed for', doc._id.toString(), e.message)
          }
        } else {
          seen.add(key)
        }
      }
    } catch (e) {
      console.warn('[indexes] error during duplicate adjustment', e.message)
    }

    // Ensure new unique index exists on sessionId + filenameHash + chunkIndex
    try {
      await FileChunk.collection.createIndex({ sessionId: 1, filenameHash: 1, chunkIndex: 1 }, { unique: true })
      console.log('[indexes] ensured unique index on sessionId+filenameHash+chunkIndex')
    } catch (e) {
      console.warn('[indexes] ensure new index failed', e.message)
    }
  } catch (e) {
    console.warn('[indexes] error inspecting indexes', e.message)
  }
}