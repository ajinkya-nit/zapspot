const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('zapspot_token');
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, config);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request('/auth/me'),

  // Stations
  getStations: (params = '') => request(`/stations${params}`),
  getStation: (id) => request(`/stations/${id}`),

  // Bookings
  createBooking: (data) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
  createRazorpayOrder: (amount) => request('/bookings/razorpay/order', { method: 'POST', body: JSON.stringify({ amount }) }),
  verifyRazorpayPayment: (data) => request('/bookings/razorpay/verify', { method: 'POST', body: JSON.stringify(data) }),
  getMyBookings: () => request('/bookings/my'),
  cancelBooking: (id) => request(`/bookings/${id}/cancel`, { method: 'PATCH' }),

  // Reviews
  getReviews: (stationId) => request(`/reviews/station/${stationId}`),
  addReview: (data) => request('/reviews', { method: 'POST', body: JSON.stringify(data) }),

  // Owner
  getOwnerDashboard: () => request('/owner/dashboard'),
  getOwnerAnalytics: () => request('/owner/analytics'),
  toggleCharger: (stationId, chargerId, data) =>
    request(`/owner/station/${stationId}/charger/${chargerId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Billing
  getDepositQuote: (data) => request('/billing/quote', { method: 'POST', body: JSON.stringify(data) }),
  endSession: (data) => request('/billing/session/end', { method: 'POST', body: JSON.stringify(data) }),
};
