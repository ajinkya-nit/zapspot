import Booking from '../models/Booking.js';
import Station from '../models/Station.js';
import Event from '../models/Event.js';
import PublicHoliday from '../models/PublicHoliday.js';

const getToDAdjustment = (date) => {
  const hour = date.getHours();
  // Solar Hours (9 AM – 4 PM)
  if (hour >= 9 && hour < 16) return -2.00;
  // Peak Hours (6 PM – 10 PM)
  if (hour >= 18 && hour < 22) return 1.50;
  // Normal Hours
  return 0.00;
};

const fetchWeatherMultiplier = async (lat, lng) => {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) return { multiplier: 1.0, reason: 'Weather (No API Key)' };

  try {
    const url = `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${lat},${lng}`;
    const response = await fetch(url);
    if (!response.ok) return { multiplier: 1.0, reason: 'Weather (API Error)' };
    
    const data = await response.json();
    const temp = data.current.temp_c;
    const condition = data.current.condition.text.toLowerCase();
    
    if (temp > 40) {
      return { multiplier: 1.15, reason: `Extreme Heat (${temp}°C)` };
    }
    if (condition.includes('rain') || condition.includes('storm')) {
      return { multiplier: 1.2, reason: `Adverse Weather (${condition})` };
    }
    return { multiplier: 1.0, reason: `Weather (${condition})` };
  } catch (err) {
    return { multiplier: 1.0, reason: 'Weather (Error)' };
  }
};

export const calculateSurgeMultiplier = async (stationId, slotDateObj) => {
  const breakdown = [];
  const station = await Station.findById(stationId);
  if (!station) throw new Error('Station not found');

  const hour = slotDateObj.getHours();
  const day = slotDateObj.getDay(); // 0 is Sunday, 6 is Saturday
  const dateStr = slotDateObj.toISOString().split('T')[0];

  // Factor 1 — Station Occupancy
  // Count active bookings for this station around this time (simplified as using station.availableSlots vs totalSlots)
  // Or query bookings for the exact time slot. Let's use live availableSlots for simplicity or active bookings.
  const activeBookingsCount = await Booking.countDocuments({
    station: stationId,
    date: dateStr,
    status: { $in: ['active', 'upcoming'] } // Simplified logic
  });
  
  // Real occupancy is based on station total slots
  let occupancyRate = 0;
  if (station.totalSlots > 0) {
    // Current available slots vs total.
    // E.g., if totalSlots = 4, available = 1, occupied = 3 -> 75%
    occupancyRate = (station.totalSlots - station.availableSlots) / station.totalSlots;
  }
  
  let occupancyMult = 1.0;
  if (occupancyRate > 0.85) occupancyMult = 1.8;
  else if (occupancyRate > 0.70) occupancyMult = 1.5;
  else if (occupancyRate >= 0.50) occupancyMult = 1.2;
  breakdown.push({ factor: 'Occupancy', contribution: occupancyMult });

  // Factor 2 — Time-of-Day Surge Band
  let todSurge = 1.0;
  if (hour >= 23 || hour < 7) todSurge = 0.85; // Off-peak (11 PM - 7 AM)
  else if (hour >= 18 && hour < 22) todSurge = 1.4; // Evening peak (6 PM - 10 PM)
  breakdown.push({ factor: 'Time-of-Day Surge', contribution: todSurge });

  // Factor 3 — Day of Week / Holiday
  let daySurge = 1.0;
  const isWeekend = (day === 0 || day === 6);
  const isHoliday = await PublicHoliday.findOne({ date: dateStr });
  if (isHoliday) daySurge = 1.3;
  else if (isWeekend) daySurge = 1.25;
  breakdown.push({ factor: isHoliday ? 'Public Holiday' : (isWeekend ? 'Weekend' : 'Weekday'), contribution: daySurge });

  // Factor 4 — Weather
  const [lng, lat] = station.location.coordinates;
  const weatherResult = await fetchWeatherMultiplier(lat, lng);
  breakdown.push({ factor: weatherResult.reason, contribution: weatherResult.multiplier });

  // Factor 5 — Local Events
  let eventSurge = 1.0;
  const activeEvents = await Event.find({
    location: {
      $geoWithin: {
        $centerSphere: [[lng, lat], 5 / 6378.1] // Assuming default max 5km radius, simplify for now
      }
    },
    startTime: { $lte: slotDateObj },
    endTime: { $gte: slotDateObj }
  });
  if (activeEvents.length > 0) {
    // Take the max event multiplier, capped at 1.5
    eventSurge = Math.min(1.5, Math.max(...activeEvents.map(e => e.surgeMultiplier)));
    breakdown.push({ factor: `Local Event (${activeEvents[0].name})`, contribution: eventSurge });
  } else {
    breakdown.push({ factor: 'Local Events', contribution: 1.0 });
  }

  // Factor 6 — Rolling Demand Score
  const score = station.demandScore || 0;
  let demandSurge = 1.0;
  if (score > 80) demandSurge = 1.35;
  else if (score >= 65) demandSurge = 1.2;
  else if (score >= 40) demandSurge = 1.1;
  breakdown.push({ factor: 'Demand Score', contribution: demandSurge });

  // Calculate total multiplier
  let finalMultiplier = breakdown.reduce((acc, curr) => acc * curr.contribution, 1.0);
  
  // Cap and Floor
  finalMultiplier = Math.max(0.75, Math.min(3.0, finalMultiplier));

  // Generate reason string
  const activeFactors = breakdown.filter(b => b.contribution !== 1.0);
  let reason = activeFactors.map(b => b.factor).join(' + ');
  if (!reason) reason = 'Normal Pricing';
  
  return {
    multiplier: Number(finalMultiplier.toFixed(2)),
    reason: `${reason} -> ${finalMultiplier.toFixed(2)}x`,
    breakdown
  };
};

export const calculateDepositQuote = async (stationId, chargerId, slotTime, vehicleCapacityStr) => {
  const station = await Station.findById(stationId);
  if (!station) throw new Error('Station not found');

  const vehicleCapacity = parseFloat(vehicleCapacityStr) || 30.0; // Default 30 kWh
  let basePortRate = station.pricePerKwh;
  
  if (chargerId && station.chargers && station.chargers.length > 0) {
    const charger = station.chargers.id ? station.chargers.id(chargerId) : station.chargers.find(c => c._id?.toString() === chargerId || c.id === chargerId);
    if (charger && charger.power > 22) {
      // Premium for faster chargers: 1% increase per kW above 22kW
      const premiumMultiplier = 1 + ((charger.power - 22) * 0.01);
      basePortRate = Number((basePortRate * premiumMultiplier).toFixed(2));
    }
  }
  
  // Create a proper date object for the slot
  // slotTime is usually just "HH:MM", we need a full date for ToD/Weather
  // We'll assume the booking is for today.
  const [hours, minutes] = slotTime.split(':').map(Number);
  const slotDateObj = new Date();
  slotDateObj.setHours(hours, minutes, 0, 0);

  const todAdjustment = getToDAdjustment(slotDateObj);
  const surgeData = await calculateSurgeMultiplier(stationId, slotDateObj);

  // Step 1: Effective Rate Pipeline
  const effectiveRate = (basePortRate + todAdjustment) * surgeData.multiplier;

  // Step 2: Dynamic Base Fare
  let baseFare = (0.20 * vehicleCapacity) * effectiveRate;
  
  // Ensure baseFare is at least a minimal amount so we can process payment
  if (baseFare < 1) baseFare = 1;

  return {
    basePortRate,
    todAdjustment,
    effectiveRate: Number(effectiveRate.toFixed(2)),
    surgeMultiplier: surgeData.multiplier,
    surgeReason: surgeData.reason,
    surgeBreakdown: surgeData.breakdown,
    depositAmount: Math.round(baseFare) // INR
  };
};

export const calculateFinalBill = async (bookingId, unitsConsumed, idleFees = 0) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new Error('Booking not found');

  // We should have saved these fields at booking creation
  const effectiveRate = booking.effectiveRate || booking.cost; // fallback to cost if old booking
  const depositPaid = booking.baseFarePaid || booking.cost;

  // Step 5: Final Billing
  const subtotal = unitsConsumed * effectiveRate;
  const gst = subtotal * 0.18;
  const totalGross = subtotal + gst + idleFees;
  const amountDue = totalGross - depositPaid;

  // Return the computed values
  return {
    subtotal: Number(subtotal.toFixed(2)),
    gst: Number(gst.toFixed(2)),
    idleFees: Number(idleFees.toFixed(2)),
    totalGross: Number(totalGross.toFixed(2)),
    depositPaid: Number(depositPaid.toFixed(2)),
    amountDue: Number(amountDue.toFixed(2))
  };
};
