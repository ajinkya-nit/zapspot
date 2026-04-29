import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';

import authRoutes from './routes/auth.js';
import stationRoutes from './routes/stations.js';
import bookingRoutes from './routes/bookings.js';
import reviewRoutes from './routes/reviews.js';
import ownerRoutes from './routes/owner.js';
import routeRoutes from './routes/route.js';
import billingRoutes from './routes/billing.js';
import { initCronJobs } from './services/cronService.js';

dotenv.config();

// Use Google Public DNS to resolve MongoDB SRV records
// This bypasses ISP/router DNS blocks on SRV lookups
dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      process.env.CLIENT_URL
    ].map(url => url ? url.replace(/\/$/, '') : null).filter(Boolean);

    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(null, false); // Return false instead of an Error to avoid crashing or generic 500s
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/route', routeRoutes);
app.use('/api/billing', billingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Connect to MongoDB and start server
const mongoUri = process.env.MONGODB_URI;
console.log('🔗 MongoDB URI loaded:', mongoUri ? `${mongoUri.substring(0, 20)}...` : '❌ UNDEFINED');

mongoose.connect(mongoUri, {
  retryWrites: true,
  w: 'majority',
})
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas');
    initCronJobs();
    app.listen(PORT, () => {
      console.log(`🚀 Zapspot server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('⚠️  Starting server without database...');
    app.listen(PORT, () => {
      console.log(`🚀 Zapspot server running on port ${PORT} (no database)`);
    });
  });

export default app;
