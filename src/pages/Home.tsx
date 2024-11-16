import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Plus } from 'lucide-react';

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="relative">
      <div 
        className="h-[80vh] bg-cover bg-center relative"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1536440136628-849c177e76a1?ixlib=rb-1.2.1&auto=format&fit=crop&w=2850&q=80')`
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent">
          <div className="container mx-auto px-4 h-full flex flex-col justify-center">
            <h1 className="text-6xl font-bold mb-4">Track Your Movies</h1>
            <p className="text-xl mb-8 max-w-2xl">
              Create your personal watchlist, rate movies, and discover trending films. 
              Join our community of movie enthusiasts today.
            </p>
            <div className="flex space-x-4">
              <button
                onClick={() => navigate('/trending')}
                className="flex items-center px-8 py-3 bg-red-600 rounded-md hover:bg-red-700 transition"
              >
                <Play className="w-5 h-5 mr-2" />
                Explore Movies
              </button>
              <button
                onClick={() => navigate('/watchlist')}
                className="flex items-center px-8 py-3 bg-zinc-800 rounded-md hover:bg-zinc-700 transition"
              >
                <Plus className="w-5 h-5 mr-2" />
                Create Watchlist
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;