import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Film, Lock, Mail, User, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { apiRequest } from '../lib/api';
import { AuthUser, useAuth } from '../context/AuthContext';

interface AuthResponse {
  user: AuthUser;
}

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const destination =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (!isLogin && username.trim().length < 3) {
      toast.error('Username must contain at least 3 characters.');
      return;
    }
    if (password.length < (isLogin ? 1 : 8)) {
      toast.error(isLogin ? 'Enter your password.' : 'Password must contain at least 8 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const response = await apiRequest<AuthResponse>(endpoint, {
        method: 'POST',
        authenticated: false,
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          ...(!isLogin ? { username: username.trim() } : {}),
        }),
      });
      if (!response?.user) throw new Error('The server did not return a valid sign-in session.');
      login(response.user);
      toast.success(isLogin ? `Welcome back, ${response.user.username}!` : 'Your account is ready. Welcome to CineMate!');
      navigate(destination, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign in right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setIsLogin((current) => !current);
    setPassword('');
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-10">
      <section className="w-full max-w-md rounded-lg border border-zinc-800 border-t-2 border-t-red-600 bg-zinc-900 p-6 shadow-2xl sm:p-8">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <Film className="h-8 w-8 text-red-600" />
          <span className="text-2xl font-black">Cine<span className="text-red-600">Mate</span></span>
        </Link>

        <h1 className="mb-2 text-center text-2xl font-bold">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-400">
          {isLogin ? 'Sign in to continue to your personal library.' : 'Create an account to organize your movies and series.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label htmlFor="username" className="mb-1 block text-sm font-medium text-zinc-300">Username</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  minLength={3}
                  maxLength={40}
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="form-input pl-10"
                  placeholder="Enter your username"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-300">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="form-input pl-10"
                placeholder="Enter your email"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-300">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={isLogin ? 1 : 8}
                maxLength={72}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="form-input pl-10 pr-11"
                placeholder={isLogin ? 'Enter your password' : 'At least 8 characters'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full rounded-md bg-red-600 py-2.5 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? 'Please wait…' : isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-zinc-400">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" onClick={switchMode} className="font-semibold text-red-500 hover:text-red-400 hover:underline">
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </section>
    </div>
  );
};

export default Auth;