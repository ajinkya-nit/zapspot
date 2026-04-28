import { createContext, useContext, useState } from 'react';
import { mockBookings } from '../data/mockStations';

const BookingContext = createContext(null);

export function BookingProvider({ children }) {
  const [bookings, setBookings] = useState(mockBookings);
  const [enquiries, setEnquiries] = useState([]);
  const [showBooking, setShowBooking] = useState(false);
  const [selectedStation, setSelectedStation] = useState(null);
  const [selectedCharger, setSelectedCharger] = useState(null);

  const addBooking = (booking) => {
    const newBooking = {
      ...booking,
      _id: booking._id || 'b' + Date.now(),
      status: booking.status || 'upcoming',
      kwhDelivered: booking.kwhDelivered || 0,
      progress: 0,
    };
    setBookings(prev => [newBooking, ...prev]);
    return newBooking;
  };

  const cancelBooking = (bookingId) => {
    setBookings(prev => prev.map(b =>
      b._id === bookingId ? { ...b, status: 'cancelled' } : b
    ));
  };

  const updateBooking = (bookingId, updates) => {
    setBookings(prev => prev.map(b =>
      b._id === bookingId ? { ...b, ...updates } : b
    ));
  };

  const startBooking = (station, charger) => {
    setSelectedStation(station);
    setSelectedCharger(charger);
    setShowBooking(true);
  };

  const closeBooking = () => {
    setShowBooking(false);
    setSelectedStation(null);
    setSelectedCharger(null);
  };

  const addEnquiry = (enquiry) => {
    setEnquiries(prev => [{
      ...enquiry,
      _id: 'enq-' + Date.now(),
      timestamp: new Date().toISOString(),
    }, ...prev]);
  };

  const updateEnquiry = (enquiryId, updates) => {
    setEnquiries(prev => prev.map(e =>
      e._id === enquiryId ? { ...e, ...updates } : e
    ));
  };

  return (
    <BookingContext.Provider value={{
      bookings, enquiries, showBooking, selectedStation, selectedCharger,
      addBooking, cancelBooking, updateBooking, startBooking, closeBooking,
      setShowBooking, addEnquiry, updateEnquiry
    }}>
      {children}
    </BookingContext.Provider>
  );
}

export const useBooking = () => useContext(BookingContext);
