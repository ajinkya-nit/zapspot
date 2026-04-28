import { useState } from 'react';
import { X, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './Auth.css';

export default function LoginModal() {
  const { showLogin, setShowLogin, setShowSignup, login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');

  if (!showLogin) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    }
  };

  const switchToSignup = () => {
    setShowLogin(false);
    setShowSignup(true);
  };

  return (
    <div className="modal-overlay" onClick={() => setShowLogin(false)}>
      <div className="modal-content auth-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setShowLogin(false)}>
          <X size={20} />
        </button>

        <div className="auth-header">
          <h3>Welcome back</h3>
          <p className="text-secondary">Sign in to your Zapspot account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="input-group">
            <Mail size={16} className="input-icon" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-glass input-with-icon"
              required
              id="login-email"
            />
          </div>

          <div className="input-group">
            <Lock size={16} className="input-icon" />
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-glass input-with-icon"
              required
              id="login-password"
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
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Don't have an account? <button onClick={switchToSignup} className="link-btn">Sign up</button></p>
        </div>
      </div>
    </div>
  );
}
