import cron from 'node-cron';
import Station from '../models/Station.js';
import Booking from '../models/Booking.js';

export const initCronJobs = () => {
  // Run nightly at 00:00
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running nightly demand score recalculation...');
    try {
      const stations = await Station.find({});
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const pastDateStr = sevenDaysAgo.toISOString().split('T')[0];
      
      for (const station of stations) {
        // Count bookings in the last 7 days
        // This is a simplified demand score out of 100 based on arbitrary target of 20 bookings/week
        const bookingsCount = await Booking.countDocuments({
          station: station._id,
          createdAt: { $gte: sevenDaysAgo }
        });
        
        let newScore = Math.min(100, Math.floor((bookingsCount / 20) * 100));
        
        await Station.findByIdAndUpdate(station._id, { demandScore: newScore });
      }
      
      console.log('[Cron] Demand scores updated successfully.');
    } catch (err) {
      console.error('[Cron] Error updating demand scores:', err);
    }
  });
};
