import { Router } from 'express';
import https from 'node:https';
import crypto from 'node:crypto';
import Booking from '../models/Booking.js';
import auth from '../middleware/auth.js';

const router = Router();

// Create booking
router.post('/', auth, async (req, res) => {
  try {
    const booking = await Booking.create({ ...req.body, user: req.user.id });
    res.status(201).json(booking);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get my bookings
router.get('/my', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cancel booking
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, status: { $in: ['upcoming'] } },
      { status: 'cancelled' },
      { new: true }
    );
    if (!booking) return res.status(404).json({ message: 'Booking not found or cannot be cancelled' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get bookings for a station (owner)
router.get('/station/:stationId', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ station: req.params.stationId }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Razorpay Create Order
router.post('/razorpay/order', auth, async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt = `rcpt_${Date.now()}` } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const keyId = process.env.RZP_KEY_ID;
    const keySecret = process.env.RZP_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(500).json({ message: 'Razorpay keys not configured' });
    }

    const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const orderPayload = JSON.stringify({
      amount: Math.round(amount * 100), // convert to smallest currency unit (paise)
      currency,
      receipt,
      payment_capture: 1
    });

    const options = {
      hostname: 'api.razorpay.com',
      port: 443,
      path: '/v1/orders',
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(orderPayload)
      }
    };

    const razorpayRes = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => data += chunk);
        response.on('end', () => resolve({ statusCode: response.statusCode, data }));
      });
      request.on('error', reject);
      request.write(orderPayload);
      request.end();
    });

    const parsedData = JSON.parse(razorpayRes.data);

    if (razorpayRes.statusCode >= 200 && razorpayRes.statusCode < 300) {
      res.json(parsedData);
    } else {
      res.status(razorpayRes.statusCode).json({ message: 'Failed to create Razorpay order', error: parsedData });
    }

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Razorpay Verify Payment
router.post('/razorpay/verify', auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingData } = req.body;
    const keySecret = process.env.RZP_KEY_SECRET;

    if (!keySecret) {
      return res.status(500).json({ message: 'Razorpay keys not configured' });
    }

    // Verify signature
    const hmac = crypto.createHmac('sha256', keySecret);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed: Invalid signature' });
    }

    // Payment is valid, save booking to DB
    const booking = await Booking.create({
      ...bookingData,
      user: req.user.id,
      status: 'upcoming' // explicit status set
    });

    res.status(201).json(booking);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
