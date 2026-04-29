import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  radius_km: { type: Number, required: true, default: 5 },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  surgeMultiplier: { type: Number, required: true, min: 1.0, max: 1.5 }
}, { timestamps: true });

eventSchema.index({ location: '2dsphere' });

export default mongoose.model('Event', eventSchema);
