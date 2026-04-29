import mongoose from 'mongoose';

const chargerSchema = new mongoose.Schema({
  type: { type: String, enum: ['CCS2', 'Type 2', 'CHAdeMO', 'GB/T'], required: true },
  power: { type: Number, required: true },
  status: { type: String, enum: ['available', 'occupied', 'faulty'], default: 'available' },
  currentUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

const stationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  rating: { type: Number, default: 0 },
  totalSlots: { type: Number, required: true },
  availableSlots: { type: Number, required: true },
  chargerTypes: [String],
  vehicleTypes: [String],
  speed: { type: String, enum: ['Fast', 'Slow'], default: 'Fast' },
  pricePerKwh: { type: Number, required: true },
  amenities: [String],
  status: { type: String, enum: ['available', 'limited', 'full'], default: 'available' },
  image: { type: String, default: '' },
  chargers: [chargerSchema],
  openingTime: { type: String, default: '06:00' },
  closingTime: { type: String, default: '23:00' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  demandScore: { type: Number, default: 0, min: 0, max: 100 },
}, { timestamps: true });

stationSchema.index({ location: '2dsphere' });

export default mongoose.model('Station', stationSchema);
