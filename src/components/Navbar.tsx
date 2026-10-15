import { Link, useNavigate } from 'react-router-dom';
import { Film, TrendingUp, List, LogOut, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/auth', { replace: true });
  };

  return (
    <nav className="relative z-40 border-b border-zinc-800 bg-zinc-900">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link to="/" className="flex shrink-0 items-center space-x-2" aria-label="CineMate home">
            <Film className="h-8 w-8 text-red-600" />
            <span className="text-xl font-bold">
              Cine<span className="text-red-600">Mate</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 sm:gap-6">
            <Link
              to="/trending"
              className="flex items-center gap-1.5 text-zinc-200 transition hover:text-red-500"
            >
              <TrendingUp className="h-5 w-5" />
              <span className="hidden sm:inline">Trending</span>
            </Link>

            {user ? (
              <>
                <Link
                  to="/watchlist"
                  className="flex items-center gap-1.5 text-zinc-200 transition hover:text-red-500"
                >
                  <List className="h-5 w-5" />
                  <span className="hidden sm:inline">My List</span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-zinc-200 transition hover:text-red-500"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="flex items-center gap-1.5 text-zinc-200 transition hover:text-red-500"
              >
                <LogIn className="h-5 w-5" />
                <span>Sign in</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;