import React, { useState, useEffect } from 'react';
import { Star, Heart, Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

interface Movie {
  id: number;
  title: string;
  poster_path: string;
  vote_average: number;
  release_date: string;
  overview: string;
}

const Trending = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;

  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const response = await fetch(
          `https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}`
        );
        const data = await response.json();
        setMovies(data.results);
      } catch (error) {
        toast.error('Failed to fetch trending movies');
      } finally {
        setLoading(false);
      }
    };

    fetchTrending();
  }, []);

  const addToWatchlist = async (movieId: number) => {
    if (!user) {
      toast.error('Please login to add movies to your watchlist');
      return;
    }

    try {
      const response = await fetch('/api/watchlist/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ movieId }),
      });

      if (response.ok) {
        toast.success('Added to watchlist');
      } else {
        toast.error('Failed to add to watchlist');
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Trending Movies</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {movies.map((movie) => (
          <div key={movie.id} className="bg-zinc-900 rounded-lg overflow-hidden movie-card">
            <img
              src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
              alt={movie.title}
              className="w-full h-[400px] object-cover"
            />
            <div className="p-4">
              <h3 className="font-bold text-lg mb-2">{movie.title}</h3>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Star className="w-4 h-4 text-yellow-400 mr-1" />
                  <span>{movie.vote_average.toFixed(1)}</span>
                </div>
                <span className="text-sm text-gray-400">
                  {new Date(movie.release_date).getFullYear()}
                </span>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => addToWatchlist(movie.id)}
                  className="flex-1 flex items-center justify-center py-2 bg-red-600 rounded hover:bg-red-700 transition"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add to List
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Trending;