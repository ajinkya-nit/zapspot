import { Router } from 'express';
import auth from '../middleware/auth.js';
import { calculateDepositQuote, calculateFinalBill } from '../services/billingService.js';

const router = Router();

// Get deposit quote and surge details before booking
router.post('/quote', auth, async (req, res) => {
  try {
    const { stationId, chargerId, slotTime, vehicleCapacity } = req.body;
    
    if (!stationId || !slotTime) {
      return res.status(400).json({ message: 'Station ID and Slot Time are required' });
    }

    const quote = await calculateDepositQuote(stationId, chargerId, slotTime, vehicleCapacity);
    res.json(quote);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Finalize session and calculate bill
router.post('/session/end', auth, async (req, res) => {
  try {
    const { bookingId, unitsConsumed, idleFees } = req.body;
    
    if (!bookingId || unitsConsumed === undefined) {
      return res.status(400).json({ message: 'Booking ID and units consumed are required' });
    }

    const bill = await calculateFinalBill(bookingId, unitsConsumed, idleFees);
    res.json(bill);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
