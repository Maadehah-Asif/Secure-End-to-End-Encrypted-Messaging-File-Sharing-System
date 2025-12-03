import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[db] MONGODB_URI not set');
    process.exit(1);
  }
  try {
    await mongoose.connect(uri, { 
      serverSelectionTimeoutMS: 5000
    });
    console.log('[db] connected');
  } catch (err) {
    console.error('[db] connection error', err.message);
    process.exit(1);
  }
}
