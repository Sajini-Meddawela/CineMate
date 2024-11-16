import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Film, TrendingUp, List, LogOut, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="bg-zinc-900 border-b border-zinc-800">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2">
            <Film className="w-8 h-8 text-red-600" />
            <span className="text-xl font-bold">MovieWatch</span>
          </Link>

          <div className="flex items-center space-x-8">
            <Link to="/trending" className="flex items-center space-x-1 hover:text-red-600">
              <TrendingUp className="w-5 h-5" />
              <span>Trending</span>
            </Link>
            
            {user ? (
              <>
                <Link to="/watchlist" className="flex items-center space-x-1 hover:text-red-600">
                  <List className="w-5 h-5" />
                  <span>My List</span>
                </Link>
                <button
                  onClick={() => {
                    logout();
                    navigate('/auth');
                  }}
                  className="flex items-center space-x-1 hover:text-red-600"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <Link to="/auth" className="flex items-center space-x-1 hover:text-red-600">
                <LogIn className="w-5 h-5" />
                <span>Login</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;