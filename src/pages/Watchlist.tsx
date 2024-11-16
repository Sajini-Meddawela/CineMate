import React, { useState, useEffect } from 'react';
import { Star, Heart, Check, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

interface Movie {
  id: number;
  title: string;
  poster_path: string;
  vote_average: number;
  release_date: string;
  watched: boolean;
  favorite: boolean;
  user_rating: number | null;
}

const Watchlist = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchWatchlist();
    }
  }, [user]);

  const fetchWatchlist = async () => {
    try {
      const response = await fetch('/api/watchlist', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      setMovies(data);
    } catch (error) {
      toast.error('Failed to fetch watchlist');
    }
  };

  const toggleWatched = async (movieId: number) => {
    try {
      const response = await fetch(`/api/watchlist/${movieId}/watched`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (response.ok) {
        fetchWatchlist();
        toast.success('Updated watch status');
      }
    } catch (error) {
      toast.error('Failed to update watch status');
    }
  };

  const toggleFavorite = async (movieId: number) => {
    try {
      const response = await fetch(`/api/watchlist/${movieId}/favorite`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (response.ok) {
        fetchWatchlist();
        toast.success('Updated favorite status');
      }
    } catch (error) {
      toast.error('Failed to update favorite status');
    }
  };

  const rateMovie = async (movieId: number, rating: number) => {
    try {
      const response = await fetch(`/api/watchlist/${movieId}/rate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ rating }),
      });
      if (response.ok) {
        fetchWatchlist();
        toast.success('Rating updated');
      }
    } catch (error) {
      toast.error('Failed to update rating');
    }
  };

  const removeFromWatchlist = async (movieId: number) => {
    try {
      const response = await fetch(`/api/watchlist/${movieId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (response.ok) {
        fetchWatchlist();
        toast.success('Removed from watchlist');
      }
    } catch (error) {
      toast.error('Failed to remove from watchlist');
    }
  };

  if (!user) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Please login to view your watchlist</h2>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">My Watchlist</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {movies.map((movie) => (
          <div key={movie.id} className="bg-zinc-900 rounded-lg overflow-hidden">
            <img
              src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
              alt={movie.title}
              className="w-full h-[400px] object-cover"
            />
            <div className="p-4">
              <h3 className="font-bold text-lg mb-2">{movie.title}</h3>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => rateMovie(movie.id, star)}
                      className={`${
                        movie.user_rating && star <= movie.user_rating
                          ? 'text-yellow-400'
                          : 'text-gray-400'
                      }`}
                    >
                      <Star className="w-5 h-5" />
                    </button>
                  ))}
                </div>
                <span className="text-sm text-gray-400">
                  {new Date(movie.release_date).getFullYear()}
                </span>
              </div>
              <div className="flex justify-between space-x-2">
                <button
                  onClick={() => toggleWatched(movie.id)}
                  className={`flex items-center justify-center px-4 py-2 rounded ${
                    movie.watched
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-zinc-700 hover:bg-zinc-600'
                  }`}
                >
                  <Check className="w-4 h-4 mr-1" />
                  {movie.watched ? 'Watched' : 'Mark Watched'}
                </button>
                <button
                  onClick={() => toggleFavorite(movie.id)}
                  className={`px-4 py-2 rounded ${
                    movie.favorite
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-zinc-700 hover:bg-zinc-600'
                  }`}
                >
                  <Heart className="w-4 h-4" fill={movie.favorite ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={() => removeFromWatchlist(movie.id)}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Watchlist;