import { useNavigate } from 'react-router-dom';
import { Play, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Home = () => {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();

  return (
    <div className="relative">
      <section
        className="relative h-[80vh] min-h-[520px] bg-cover bg-center"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=2850&q=85')",
        }}
        aria-label="Cinematic movie background"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent">
          <div className="container mx-auto flex h-full flex-col justify-center px-4">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.22em] text-red-500">
              CineMate · Your personal screen library
            </p>
            <h1 className="mb-4 max-w-4xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
              Track Your Movies
            </h1>
            <p className="mb-8 max-w-2xl text-base leading-7 text-zinc-200 sm:text-xl">
              Create your personal watchlist, organize movies and TV series,
              track your progress, rate titles, and discover what to watch next.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => navigate('/trending')}
                className="inline-flex items-center rounded-md bg-red-600 px-8 py-3 font-semibold text-white transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
              >
                <Play className="mr-2 h-5 w-5" />
                Explore Movies
              </button>
              <button
                type="button"
                disabled={authLoading}
                onClick={() => navigate(user ? '/watchlist' : '/auth')}
                className="inline-flex items-center rounded-md bg-zinc-800/95 px-8 py-3 font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60"
              >
                <Plus className="mr-2 h-5 w-5" />
                {user ? 'Open My Library' : 'Create Watchlist'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;