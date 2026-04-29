import mongoose from 'mongoose';

const publicHolidaySchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: { type: String, required: true }, // Format YYYY-MM-DD
}, { timestamps: true });

export default mongoose.model('PublicHoliday', publicHolidaySchema);
