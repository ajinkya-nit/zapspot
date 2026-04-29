import { useState, useEffect, useMemo } from 'react';
import { X, Clock, Ban, RefreshCw, AlertCircle, MessageSquare, Send, ShieldAlert, MapPin, Navigation, Loader } from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, generateTimeSlots } from '../../utils/helpers';
import { getBothRoutes } from '../../services/tomtomRouting';
import { mockStations } from '../../data/mockStations';
import './BookingCountdown.css';

// Parse a time slot string like "10:00 - 10:30" or "10:00 – 10:30" into start and end Date objects
function parseSlotTimes(timeSlot, dateStr) {
  if (!timeSlot) return null;

  // Handle all dash types: regular dash (-), en dash (–), em dash (—)
  const parts = timeSlot.split(/\s*[-–—]\s*/);
  if (parts.length < 2) return null;

  const startMatch = parts[0].trim().match(/(\d{1,2}):(\d{2})/);
  const endMatch = parts[1].trim().match(/(\d{1,2}):(\d{2})/);
  if (!startMatch || !endMatch) return null;

  const [startH, startM] = [parseInt(startMatch[1]), parseInt(startMatch[2])];
  const [endH, endM] = [parseInt(endMatch[1]), parseInt(endMatch[2])];

  let baseDate;
  if (dateStr) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    baseDate = new Date(y, mo - 1, d);
  } else {
    const now = new Date();
    baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const startTime = new Date(baseDate);
  startTime.setHours(startH, startM, 0, 0);

  const endTime = new Date(baseDate);
  endTime.setHours(endH, endM, 0, 0);

  if (endTime <= startTime) {
    endTime.setDate(endTime.getDate() + 1);
  }

  if (!dateStr) {
    const now = new Date();
    if (endTime < now) {
      startTime.setDate(startTime.getDate() + 1);
      endTime.setDate(endTime.getDate() + 1);
    }
  }

  return { startTime, endTime };
}

export default function BookingCountdown({ stations, userLocation, onRoutesReady }) {
  const { bookings, cancelBooking, addEnquiry, updateBooking } = useBooking();
  const { toast } = useToast();

  const activeBooking = useMemo(() => {
    if (!Array.isArray(bookings)) return null;
    const now = new Date();
    const active = bookings.find(b => {
      if (!b) return false;
      if (b.status !== 'active' && b.status !== 'upcoming') return false;
      const times = parseSlotTimes(b.timeSlot, b.date);
      if (!times) return false;
      return times.endTime > now || times.startTime > now;
    });
    if (active) return active;
    return bookings.find(b => b && (b.status === 'active' || b.status === 'upcoming')) || null;
  }, [bookings]);

  const [timeRemaining, setTimeRemaining] = useState(null);
  const [phase, setPhase] = useState('before');
  const [showChangeSlot, setShowChangeSlot] = useState(false);
  const [showEnquiry, setShowEnquiry] = useState(false);
  const [showReportCharger, setShowReportCharger] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [enquiryText, setEnquiryText] = useState('');
  const [reportText, setReportText] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(null);

  const availableSlots = useMemo(() => {
    if (!showChangeSlot) return [];
    return generateTimeSlots('06:00', '23:00', 30);
  }, [showChangeSlot]);

  const handleGetDirections = async () => {
    const targetId = activeBooking.stationId || activeBooking.station;
    const targetName = activeBooking.stationName;

    const station = stations?.find(s => s._id === targetId || s.name === targetName) || 
                    mockStations?.find(s => s._id === targetId || s.name === targetName);
                    
    if (!station || !userLocation) {
      toast.warning("Cannot calculate route. Missing station or user location.");
      return;
    }

    setRouteLoading(true);
    setRouteError(null);
    try {
      const routes = await getBothRoutes(userLocation, [station.lat, station.lng]);
      if (onRoutesReady) {
        onRoutesReady(station, routes);
      }
    } catch (err) {
      console.error('[Directions]', err);
      setRouteError(err.message || 'Could not calculate route');
      toast.error(err.message || 'Could not calculate route');
    } finally {
      setRouteLoading(false);
    }
  };

  useEffect(() => {
    if (activeBooking) {
      setDismissed(false);
    }
  }, [activeBooking?._id]);

  useEffect(() => {
    if (!activeBooking) return;

    const times = parseSlotTimes(activeBooking.timeSlot, activeBooking.date);
    if (!times) return;

    const tick = () => {
      const now = new Date();

      if (now < times.startTime) {
        const diff = times.startTime.getTime() - now.getTime();
        const totalSeconds = Math.floor(diff / 1000);
        setTimeRemaining({
          hours: Math.floor(totalSeconds / 3600),
          minutes: Math.floor((totalSeconds % 3600) / 60),
          seconds: totalSeconds % 60,
          totalMinutes: Math.floor(diff / 60000),
          expired: false,
        });
        setPhase('before');
      } else if (now >= times.startTime && now < times.endTime) {
        const diff = times.endTime.getTime() - now.getTime();
        const totalSeconds = Math.floor(diff / 1000);
        setTimeRemaining({
          hours: Math.floor(totalSeconds / 3600),
          minutes: Math.floor((totalSeconds % 3600) / 60),
          seconds: totalSeconds % 60,
          totalMinutes: Math.floor(diff / 60000),
          expired: false,
        });
        setPhase('during');
      } else {
        setTimeRemaining({ hours: 0, minutes: 0, seconds: 0, totalMinutes: 0, expired: true });
        setPhase('expired');
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeBooking]);

  if (!activeBooking) return <></>;

  const totalMinutesRemaining = timeRemaining?.totalMinutes ?? 0;
  const isExpired = phase === 'expired';
  const canCancel = !isExpired && activeBooking.status !== 'cancelled';
  const canChangeSlot = !isExpired && activeBooking.status !== 'cancelled';
  const canNoReport = isExpired;
  const canReportCharger = phase === 'during' || phase === 'expired';

  const cancellationPercent = totalMinutesRemaining > 30 ? 15 : 50;
  const deductionAmount = Math.round(activeBooking.cost * cancellationPercent / 100);
  const refundAmount = activeBooking.cost - deductionAmount;

  const handleCancel = () => {
    if (!canCancel) {
      toast.warning('Cancellation is not available — your slot has already expired.');
      return;
    }
    setShowConfirmCancel(true);
  };

  const confirmCancel = () => {
    cancelBooking(activeBooking._id);
    setShowConfirmCancel(false);
    setDismissed(true);
    toast.success(`Booking cancelled! ₹${refundAmount} will be refunded to your account.`);
  };

  const handleChangeSlot = () => {
    if (!canChangeSlot) {
      toast.warning('Slot change is not available after your slot has expired.');
      return;
    }
    setShowChangeSlot(true);
  };

  const handleSelectNewSlot = (slot) => {
    if (!slot.available) return;
    updateBooking(activeBooking._id, {
      timeSlot: `${slot.from} - ${slot.to}`,
      status: 'upcoming',
    });
    setShowChangeSlot(false);
    toast.success(`Slot changed to ${slot.from} – ${slot.to} successfully!`);
  };

  const handleNoReport = () => {
    if (!canNoReport) {
      toast.warning('No-report action is only available after your slot time has passed.');
      return;
    }
    toast.error(`Since you didn't attend, 100% of ₹${activeBooking.cost} has been deducted.\nSubmit an enquiry for compensation.`);
    cancelBooking(activeBooking._id);
    setDismissed(true);
  };

  const handleReportCharger = () => {
    if (!canReportCharger) {
      toast.warning('Charger reporting is available only when you are at the station (during or after your session).');
      return;
    }
    setShowReportCharger(true);
  };

  const handleSubmitReport = () => {
    if (!reportText.trim()) {
      toast.warning('Please describe the charger issue before submitting.');
      return;
    }

    let alternativeStation = null;
    if (stations && stations.length > 0) {
      const targetId = activeBooking.stationId || activeBooking.station;
      const targetName = activeBooking.stationName;
      alternativeStation = stations.find(s =>
        s._id !== targetId && s.name !== targetName &&
        s.availableSlots > 0 &&
        s.status === 'available'
      );
    }

    addEnquiry({
      bookingId: activeBooking._id,
      stationName: activeBooking.stationName,
      stationId: activeBooking.stationId || activeBooking.station,
      userName: 'Current User',
      message: `[CHARGER REPORT] ${reportText}`,
      date: new Date().toISOString().split('T')[0],
      status: 'pending',
      cost: activeBooking.cost,
      type: 'charger_report',
    });

    cancelBooking(activeBooking._id);
    setReportText('');
    setShowReportCharger(false);

    if (alternativeStation) {
      toast.success(
        `⚡ Charger reported! Full refund of ₹${activeBooking.cost} will be processed.\n` +
        `🔄 Try: ${alternativeStation.name} (${alternativeStation.availableSlots} slots, ₹${alternativeStation.pricePerKwh}/kWh)`
      , 6000);
    } else {
      toast.success(
        `⚡ Charger reported! Full refund of ₹${activeBooking.cost} will be processed.\n` +
        `No alternative stations nearby. The owner has been notified.`
      , 6000);
    }
    setDismissed(true);
  };

  const handleSubmitEnquiry = () => {
    if (!enquiryText.trim()) {
      toast.warning('Please describe your issue before submitting.');
      return;
    }
    addEnquiry({
      bookingId: activeBooking._id,
      stationName: activeBooking.stationName,
      stationId: activeBooking.stationId || activeBooking.station,
      userName: 'Current User',
      message: enquiryText,
      date: new Date().toISOString().split('T')[0],
      status: 'pending',
      cost: activeBooking.cost,
    });
    setEnquiryText('');
    setShowEnquiry(false);
    toast.success('Enquiry submitted! The station owner will review and compensate accordingly.');
  };

  const formatTime = (val) => String(val).padStart(2, '0');

  const phaseLabel = phase === 'before' ? 'Time to Reach Station'
    : phase === 'during' ? 'Session Time Left'
    : 'Slot Expired';

  const statusBadge = phase === 'expired' ? 'Expired'
    : activeBooking.status === 'active' ? 'Active Session'
    : 'Upcoming';

  return (
    <>
      {/* Reopen Button */}
      {dismissed && activeBooking && (
        <button 
          className="reopen-countdown-btn"
          onClick={() => setDismissed(false)}
        >
          <Clock size={16} />
          Active Session
        </button>
      )}

      {/* Main countdown widget */}
      <div
        className="booking-countdown"
        id="booking-countdown"
        style={{ display: dismissed ? 'none' : 'block' }}
      >
        {/* Header */}
        <div className="countdown-header">
          <div className={`countdown-badge ${phase === 'expired' ? 'expired-badge' : phase === 'during' ? 'active-badge' : ''}`}>
            <Clock size={14} />
            <span>{statusBadge}</span>
          </div>
          <button className="countdown-close" onClick={() => setDismissed(true)} title="Dismiss">
            <X size={14} />
          </button>
        </div>

        {/* Station Info */}
        <div className="countdown-station">
          <span className="countdown-station-name">{activeBooking.stationName}</span>
          <span className="countdown-slot">{activeBooking.timeSlot} • {activeBooking.date || 'Today'}</span>
        </div>

        {/* Phase Label */}
        <div className="countdown-phase-label">{phaseLabel}</div>

        {/* Timer */}
        <div className={`countdown-timer ${phase === 'expired' ? 'timer-expired' : phase === 'during' ? 'timer-active' : ''}`}>
          {isExpired ? (
            <span className="countdown-expired">Slot Expired</span>
          ) : (
            <>
              <div className="timer-block">
                <span className="timer-value">{formatTime(timeRemaining?.hours || 0)}</span>
                <span className="timer-label">hrs</span>
              </div>
              <span className="timer-colon">:</span>
              <div className="timer-block">
                <span className="timer-value">{formatTime(timeRemaining?.minutes || 0)}</span>
                <span className="timer-label">min</span>
              </div>
              <span className="timer-colon">:</span>
              <div className="timer-block">
                <span className="timer-value">{formatTime(timeRemaining?.seconds || 0)}</span>
                <span className="timer-label">sec</span>
              </div>
            </>
          )}
        </div>

        {/* Cost Info */}
        <div className="countdown-cost">
          <span>Booking Cost:</span>
          <strong>{formatCurrency(activeBooking.cost)}</strong>
        </div>

        {/* Get Directions Button */}
        <button
          className={`countdown-directions-btn ${routeLoading ? 'loading' : ''}`}
          onClick={handleGetDirections}
          disabled={routeLoading}
          id="countdown-get-directions-btn"
        >
          {routeLoading ? <Loader size={14} className="btn-spinner" /> : <Navigation size={14} />}
          <span>Get Directions</span>
        </button>

        {/* Action Buttons */}
        <div className="countdown-actions">
          <button
            className={`countdown-btn cancel-btn ${!canCancel ? 'disabled-btn' : ''}`}
            onClick={handleCancel}
            id="cancel-booking-btn"
          >
            <Ban size={14} />
            <span>Cancel</span>
            <span className="btn-deduction">{canCancel ? `${cancellationPercent}% deducted` : 'N/A'}</span>
          </button>

          <button
            className={`countdown-btn change-btn ${!canChangeSlot ? 'disabled-btn' : ''}`}
            onClick={handleChangeSlot}
            id="change-slot-btn"
          >
            <RefreshCw size={14} />
            <span>Change Slot</span>
          </button>

          <button
            className={`countdown-btn report-charger-btn ${!canReportCharger ? 'disabled-btn' : ''}`}
            onClick={handleReportCharger}
            id="report-charger-btn"
          >
            <ShieldAlert size={14} />
            <span>Report Charger</span>
            <span className="btn-deduction">100% refund</span>
          </button>

          <button
            className={`countdown-btn noreport-btn ${!canNoReport ? 'disabled-btn' : ''}`}
            onClick={handleNoReport}
            id="no-report-btn"
          >
            <AlertCircle size={14} />
            <span>No Report</span>
            <span className="btn-deduction">100% deducted</span>
          </button>

          <button
            className="countdown-btn enquiry-btn"
            onClick={() => setShowEnquiry(true)}
            id="set-enquiry-btn"
          >
            <MessageSquare size={14} />
            <span>Set Enquiry</span>
          </button>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showConfirmCancel && (
        <div className="modal-overlay" onClick={() => setShowConfirmCancel(false)}>
          <div className="modal-content countdown-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="countdown-modal-header">
              <h3>Confirm Cancellation</h3>
              <button className="detail-close" onClick={() => setShowConfirmCancel(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="enquiry-body">
              <div className="cancel-confirm-info">
                <div className="cancel-deduction-row">
                  <span>Deduction ({cancellationPercent}%)</span>
                  <strong className="cancel-amount-red">-{formatCurrency(deductionAmount)}</strong>
                </div>
                <div className="cancel-deduction-row">
                  <span>Refund Amount</span>
                  <strong className="cancel-amount-green">{formatCurrency(refundAmount)}</strong>
                </div>
                <p className="cancel-info-text">
                  {totalMinutesRemaining > 30
                    ? '15% is deducted since you are cancelling more than 30 minutes before your slot.'
                    : '50% is deducted since you are cancelling in the last 30 minutes.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowConfirmCancel(false)}>
                  Keep Booking
                </button>
                <button className="btn btn-primary" style={{ flex: 1, background: '#FF453A', borderColor: '#FF453A' }} onClick={confirmCancel}>
                  Confirm Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Slot Modal */}
      {showChangeSlot && (
        <div className="modal-overlay" onClick={() => setShowChangeSlot(false)}>
          <div className="modal-content countdown-modal" onClick={e => e.stopPropagation()}>
            <div className="countdown-modal-header">
              <h3>Change Slot</h3>
              <button className="detail-close" onClick={() => setShowChangeSlot(false)}>
                <X size={18} />
              </button>
            </div>
            <p className="text-secondary" style={{ padding: '0 24px', marginBottom: '16px' }}>
              Select a new slot for today. Your current slot ({activeBooking.timeSlot}) will be released.
            </p>
            <div className="change-slot-grid">
              {availableSlots.map((slot, i) => (
                <button
                  key={i}
                  className={`change-slot-item ${slot.available ? 'available' : 'booked'}`}
                  onClick={() => slot.available && handleSelectNewSlot(slot)}
                  disabled={!slot.available}
                >
                  <span>{slot.from} – {slot.to}</span>
                  <span className="slot-badge">{slot.available ? '✅ Open' : '❌ Booked'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Report Charger Modal */}
      {showReportCharger && (
        <div className="modal-overlay" onClick={() => setShowReportCharger(false)}>
          <div className="modal-content countdown-modal" onClick={e => e.stopPropagation()}>
            <div className="countdown-modal-header">
              <h3>⚡ Report Faulty Charger</h3>
              <button className="detail-close" onClick={() => setShowReportCharger(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="enquiry-body">
              <div className="report-refund-badge">
                <ShieldAlert size={18} />
                <div>
                  <strong>Full Refund Guaranteed</strong>
                  <span>You'll receive 100% refund of {formatCurrency(activeBooking.cost)}</span>
                </div>
              </div>
              <p className="text-secondary" style={{ marginBottom: '12px' }}>
                Describe the issue with the charger. The station owner will be notified and we'll suggest an alternative station.
              </p>
              <div className="enquiry-booking-info">
                <span><strong>Station:</strong> {activeBooking.stationName}</span>
                <span><strong>Charger:</strong> {activeBooking.chargerType || 'N/A'} • {activeBooking.chargerId || 'N/A'}</span>
                <span><strong>Slot:</strong> {activeBooking.timeSlot}</span>
              </div>
              <textarea
                className="input-glass enquiry-textarea"
                placeholder="Describe the charger issue (e.g., not turning on, error on display, cable damaged...)"
                value={reportText}
                onChange={e => setReportText(e.target.value)}
                rows={4}
              />
              <button className="btn btn-primary enquiry-submit report-submit-btn" onClick={handleSubmitReport}>
                <ShieldAlert size={16} />
                Report & Get Full Refund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enquiry Modal */}
      {showEnquiry && (
        <div className="modal-overlay" onClick={() => setShowEnquiry(false)}>
          <div className="modal-content countdown-modal" onClick={e => e.stopPropagation()}>
            <div className="countdown-modal-header">
              <h3>Submit Enquiry</h3>
              <button className="detail-close" onClick={() => setShowEnquiry(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="enquiry-body">
              <p className="text-secondary" style={{ marginBottom: '12px' }}>
                Explain why you were unable to attend your charging session. The station owner will review your enquiry and compensate accordingly.
              </p>
              <div className="enquiry-booking-info">
                <span><strong>Station:</strong> {activeBooking.stationName}</span>
                <span><strong>Slot:</strong> {activeBooking.timeSlot}</span>
                <span><strong>Amount:</strong> {formatCurrency(activeBooking.cost)}</span>
              </div>
              <textarea
                className="input-glass enquiry-textarea"
                placeholder="Describe your issue (e.g., vehicle breakdown, emergency, road closure...)"
                value={enquiryText}
                onChange={e => setEnquiryText(e.target.value)}
                rows={4}
              />
              <button className="btn btn-primary enquiry-submit" onClick={handleSubmitEnquiry}>
                <Send size={16} />
                Submit Enquiry
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
