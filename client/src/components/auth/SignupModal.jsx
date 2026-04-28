import { useState } from 'react';
import { X, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './Auth.css';

export default function SignupModal() {
  const { showSignup, setShowSignup, setShowLogin, signup, loading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');

  if (!showSignup) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await signup(name, email, password);
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.');
    }
  };

  const switchToLogin = () => {
    setShowSignup(false);
    setShowLogin(true);
  };

  return (
    <div className="modal-overlay" onClick={() => setShowSignup(false)}>
      <div className="modal-content auth-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setShowSignup(false)}>
          <X size={20} />
        </button>

        <div className="auth-header">
          <h3>Create account</h3>
          <p className="text-secondary">Join Zapspot and start your EV journey</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="input-group">
            <User size={16} className="input-icon" />
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-glass input-with-icon"
              required
              id="signup-name"
            />
          </div>

          <div className="input-group">
            <Mail size={16} className="input-icon" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-glass input-with-icon"
              required
              id="signup-email"
            />
          </div>

          <div className="input-group">
            <Lock size={16} className="input-icon" />
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Create password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-glass input-with-icon"
              required
              minLength={6}
              id="signup-password"
            />
            <button
              type="button"
              className="pass-toggle"
              onClick={() => setShowPass(!showPass)}
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Already have an account? <button onClick={switchToLogin} className="link-btn">Sign in</button></p>
        </div>
      </div>
    </div>
  );
}
