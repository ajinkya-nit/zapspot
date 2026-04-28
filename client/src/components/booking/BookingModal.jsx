import { useState, useMemo, useEffect, useRef } from 'react';
import { X, Calendar, CreditCard, Smartphone, Wallet, CheckCircle, Zap, Download, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useBooking } from '../../context/BookingContext';
import { useAuth } from '../../context/AuthContext';
import { generateTimeSlots, formatCurrency } from '../../utils/helpers';
import { generateReceipt } from '../../utils/receipt';
import { api } from '../../services/api';
import './BookingModal.css';

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

function SlotCalendar({ selectedDate, onSelectDate }) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  const isToday = (day) => {
    return day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
  };

  const isPast = (day) => {
    const date = new Date(currentYear, currentMonth, day);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return date < todayStart;
  };

  const formatDate = (day) => {
    return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button onClick={prevMonth} className="cal-nav">‹</button>
        <span className="cal-title">{monthNames[currentMonth]} {currentYear}</span>
        <button onClick={nextMonth} className="cal-nav">›</button>
      </div>
      <div className="calendar-weekdays">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <span key={d} className="cal-weekday">{d}</span>
        ))}
      </div>
      <div className="calendar-days">
        {Array.from({ length: firstDay }).map((_, i) => (
          <span key={`e-${i}`} className="cal-day empty"></span>
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = formatDate(day);
          const past = isPast(day);
          return (
            <button
              key={day}
              className={`cal-day ${isToday(day) ? 'today' : ''} ${selectedDate === dateStr ? 'selected' : ''} ${past ? 'past' : ''}`}
              onClick={() => !past && onSelectDate(dateStr)}
              disabled={past}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function BookingModal() {
  const { showBooking, selectedStation, selectedCharger, closeBooking, addBooking } = useBooking();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [booking, setBooking] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const timeSlots = useMemo(() => {
    if (!selectedStation) return [];
    return generateTimeSlots(selectedStation.openingTime, selectedStation.closingTime);
  }, [selectedStation]);

  if (!showBooking || !selectedStation) return null;

  const kwhEstimate = ((selectedCharger?.power || 22) * 0.5 * 0.9).toFixed(1);
  const baseCost = Math.max(1, Math.round(kwhEstimate * selectedStation.pricePerKwh));
  const discount = Math.min(paymentMethod === 'upi' ? 10 : 0, baseCost);
  const gst = Math.max(0, Math.round((baseCost - discount) * 0.18));
  const total = Math.max(0, baseCost - discount + gst);

  const handleConfirm = async () => {
    setIsProcessing(true);

    try {
      const res = await loadRazorpayScript();
      if (!res) {
        alert('Razorpay SDK failed to load. Are you online?');
        setIsProcessing(false);
        return;
      }

      // Create Order on Backend
      const order = await api.createRazorpayOrder(total);

      if (!order || !order.id) {
        alert('Server error. Please try again.');
        setIsProcessing(false);
        return;
      }

      // Ensure station ID is a valid MongoDB ObjectId (for mock stations)
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(selectedStation._id);
      const safeStationId = isValidObjectId ? selectedStation._id : '60d5ecb8b392d72f9c4b4f50';

      // Booking data to pass to verify step
      const bookingData = {
        stationName: selectedStation.name,
        station: safeStationId,
        chargerId: selectedCharger?._id || selectedCharger?.id || 'charger_1',
        chargerType: selectedCharger?.type || 'Type 2',
        date: selectedDate,
        timeSlot: selectedSlot?.label,
        cost: total,
        totalKwh: parseFloat(kwhEstimate),
        vehicle: user?.vehicles?.[0]?.name || 'My EV',
      };

      const options = {
        key: 'rzp_test_Sisdya7TlSzOhr',
        amount: order.amount,
        currency: order.currency,
        name: "Zapspot",
        description: `Booking at ${selectedStation.name}`,
        order_id: order.id,
        handler: async function (response) {
          try {
            console.log('Razorpay payment successful, verifying...', response);
            // Verify Payment
            const verifyRes = await api.verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              bookingData
            });

            console.log('Verification successful, backend response:', verifyRes);

            // Add confirmed booking to UI
            const newBooking = addBooking(verifyRes);
            setBooking(newBooking);
            setIsProcessing(false);
            setStep(4);

            // Generate QR code
            const qrData = JSON.stringify({
              bookingId: newBooking._id,
              station: selectedStation.name,
              charger: selectedCharger?.type,
              date: selectedDate,
              time: selectedSlot?.label,
              cost: total,
            });
            QRCode.toDataURL(qrData, {
              width: 200,
              margin: 2,
              color: { dark: '#1D1D1F', light: '#FFFFFF' }
            }).then(url => setQrDataUrl(url)).catch(() => setQrDataUrl(''));
          } catch (verifyError) {
            alert('Payment verification failed: ' + verifyError.message);
            setIsProcessing(false);
          }
        },
        prefill: {
          name: user?.name || "Test User",
          email: user?.email || "test@example.com",
        },
        theme: {
          color: "#0f766e",
        },
        modal: {
          ondismiss: function() {
            setIsProcessing(false);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        alert('Payment failed: ' + response.error.description);
        setIsProcessing(false);
      });

      rzp.open();
    } catch (err) {
      alert('Error initiating payment: ' + err.message);
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedDate('');
    setSelectedSlot(null);
    setBooking(null);
    closeBooking();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content booking-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose}>
          <X size={20} />
        </button>

        {/* Progress */}
        <div className="booking-progress">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`progress-step ${step >= s ? 'active' : ''} ${step === s ? 'current' : ''}`}>
              <div className="step-dot">{step > s ? '✓' : s}</div>
              <span className="step-label">{['Date & Time', 'Review', 'Payment', 'Confirmed'][s - 1]}</span>
            </div>
          ))}
        </div>

        {/* Step 1: Date & Time */}
        {step === 1 && (
          <div className="booking-step">
            <h3>Select Date & Time</h3>
            <p className="text-secondary">Choose when you'd like to charge at {selectedStation.name}</p>

            <SlotCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />

            {selectedDate && (
              <>
                <label className="filter-label" style={{ marginTop: '16px' }}>Available Time Slots</label>
                <div className="booking-slots">
                  {timeSlots.map((slot, i) => (
                    <button
                      key={i}
                      className={`booking-slot ${!slot.available ? 'unavailable' : ''} ${selectedSlot?.label === slot.label ? 'selected' : ''}`}
                      onClick={() => slot.available && setSelectedSlot(slot)}
                      disabled={!slot.available}
                    >
                      {slot.label}
                      <span>{slot.available ? '✅' : '❌'}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <button
              className="btn btn-primary btn-lg booking-next"
              disabled={!selectedDate || !selectedSlot}
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div className="booking-step">
            <h3>Review Booking</h3>

            <div className="review-summary glass-card-dark">
              <div className="summary-row">
                <span>Station</span>
                <strong>{selectedStation.name}</strong>
              </div>
              <div className="summary-row">
                <span>Charger</span>
                <strong>{selectedCharger?.type} • {selectedCharger?.power}kW</strong>
              </div>
              <div className="summary-row">
                <span>Date</span>
                <strong>{selectedDate}</strong>
              </div>
              <div className="summary-row">
                <span>Time</span>
                <strong>{selectedSlot?.label}</strong>
              </div>
              <div className="summary-row">
                <span>Est. Energy</span>
                <strong>{kwhEstimate} kWh</strong>
              </div>
              {selectedCharger?.status !== 'available' && (
                <div className="compatibility-warning">
                  ⚠️ This charger is currently {selectedCharger?.status}. You'll be added to the waitlist.
                </div>
              )}
            </div>

            <div className="step-actions">
              <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>Continue to Payment</button>
            </div>
          </div>
        )}

        {/* Step 3: Payment */}
        {step === 3 && (
          <div className="booking-step">
            <h3>Payment</h3>

            <div className="payment-methods">
              <label className="filter-label">Payment Method</label>
              <div className="method-options">
                {[
                  { id: 'upi', icon: Smartphone, label: 'UPI', desc: '₹10 discount' },
                  { id: 'card', icon: CreditCard, label: 'Credit/Debit Card', desc: 'Visa, Mastercard' },
                  { id: 'wallet', icon: Wallet, label: 'Wallet', desc: 'Paytm, PhonePe' },
                ].map(m => (
                  <button
                    key={m.id}
                    className={`method-card ${paymentMethod === m.id ? 'selected' : ''}`}
                    onClick={() => setPaymentMethod(m.id)}
                  >
                    <m.icon size={20} />
                    <div>
                      <span className="method-name">{m.label}</span>
                      <span className="method-desc">{m.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="cost-breakdown glass-card-dark">
              <h4>Cost Breakdown</h4>
              <div className="cost-row">
                <span>{kwhEstimate} kWh × ₹{selectedStation.pricePerKwh}</span>
                <span>{formatCurrency(baseCost)}</span>
              </div>
              {discount > 0 && (
                <div className="cost-row discount">
                  <span>UPI Discount</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="cost-row">
                <span>GST (18%)</span>
                <span>{formatCurrency(gst)}</span>
              </div>
              <div className="cost-row total">
                <span>Total</span>
                <strong>{formatCurrency(total)}</strong>
              </div>
            </div>

            <div className="step-actions">
              <button className="btn btn-secondary" disabled={isProcessing} onClick={() => setStep(2)}>Back</button>
              <button className="btn btn-success btn-lg" disabled={isProcessing} onClick={handleConfirm} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {isProcessing ? (
                  <>
                    <Loader2 className="spinner" size={20} />
                    Processing...
                  </>
                ) : (
                  `Pay ${formatCurrency(total)}`
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && booking && (
          <div className="booking-step confirmation">
            <div className="confirm-icon">
              <CheckCircle size={56} color="#30D158" />
            </div>
            <h3>Booking Confirmed!</h3>
            <p className="text-secondary">Your charging slot has been reserved</p>

            <div className="qr-section glass-card-dark">
              <div className="qr-placeholder">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Booking QR Code" className="qr-image" />
                ) : (
                  <div className="qr-loading">Generating QR...</div>
                )}
              </div>
              <p className="qr-hint">Show this QR at the station to start charging</p>
            </div>

            <div className="confirm-details glass-card-dark">
              <div className="summary-row">
                <span>Booking ID</span>
                <strong>{booking._id}</strong>
              </div>
              <div className="summary-row">
                <span>Station</span>
                <strong>{booking.stationName}</strong>
              </div>
              <div className="summary-row">
                <span>Date & Time</span>
                <strong>{booking.date} • {booking.timeSlot}</strong>
              </div>
              <div className="summary-row">
                <span>Amount Paid</span>
                <strong>{formatCurrency(booking.cost)}</strong>
              </div>
            </div>

            <div className="confirm-actions">
              <button className="btn btn-primary btn-lg" onClick={() => generateReceipt(booking)} id="download-receipt-btn">
                <Download size={16} />
                Download Receipt
              </button>
              <button className="btn btn-secondary" onClick={handleClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
