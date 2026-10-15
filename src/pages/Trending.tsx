import { FormEvent, useCallback, useEffect, useState } from 'react';
import { BookmarkPlus, Check, Film, Search, Star, Tv2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { ApiError, apiRequest } from '../lib/api';
import { Link } from 'react-router-dom';

interface DiscoverItem {
  movieId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string;
  backdropPath: string;
  voteAverage: number;
  releaseDate: string;
  overview: string;
  genres: string[];
  source: 'tmdb';
}
interface DiscoverResponse { results: DiscoverItem[] }

function posterUrl(posterPath: string) {
  if (!posterPath) return '';
  if (/^https?:\/\//i.test(posterPath)) return posterPath;
  return `https://image.tmdb.org/t/p/w500${posterPath.startsWith('/') ? '' : '/'}${posterPath}`;
}

const Trending = () => {
  const [titles, setTitles] = useState<DiscoverItem[]>([]);
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [addingId, setAddingId] = useState<number | null>(null);
  const { user } = useAuth();

  const loadTitles = useCallback(async (type: 'movie' | 'tv', search: string) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const params = new URLSearchParams({ type, mode: search ? 'search' : 'trending' });
      if (search) params.set('query', search);
      const data = await apiRequest<DiscoverResponse>(`/api/discover?${params.toString()}`, { authenticated: false });
      setTitles(Array.isArray(data.results) ? data.results : []);
    } catch (error) {
      setTitles([]);
      const message = error instanceof Error ? error.message : 'Unable to load titles right now.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTitles(mediaType, submittedQuery);
  }, [loadTitles, mediaType, submittedQuery]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedQuery(query.trim());
  };

  const addToLibrary = async (title: DiscoverItem) => {
    if (!user) {
      toast.error('Sign in to save titles to your personal library.');
      return;
    }
    setAddingId(title.movieId);
    try {
      await apiRequest('/api/watchlist', {
        method: 'POST',
        body: JSON.stringify(title),
      });
      toast.success(`Added “${title.title}” to your library.`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) toast('That title is already in your library.');
      else toast.error(error instanceof Error ? error.message : 'Could not add this title.');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-400">Find your next watch</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{submittedQuery ? "Search Results" : mediaType === "movie" ? "Trending Movies" : "Trending TV Series"}</h1><p className="mt-2 max-w-xl text-zinc-400">Explore popular titles or search for a movie or show to add to your collection.</p></div>
        <div className="flex rounded-xl border border-zinc-800 bg-zinc-900 p-1" role="group" aria-label="Media type">
          <button type="button" onClick={() => setMediaType('movie')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${mediaType === 'movie' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}><Film className="h-4 w-4"/> Movies</button>
          <button type="button" onClick={() => setMediaType('tv')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${mediaType === 'tv' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}><Tv2 className="h-4 w-4"/> Series</button>
        </div>
      </section>

      <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500"/><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={150} placeholder={`Search ${mediaType === 'movie' ? 'movies' : 'TV series'}…`} className="form-input pl-12" aria-label="Search titles"/></div>
        <button type="submit" className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-3"><Search className="h-4 w-4"/> Search</button>
        {submittedQuery && <button type="button" onClick={() => { setQuery(''); setSubmittedQuery(''); }} className="rounded-lg border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-900">Clear</button>}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">{submittedQuery ? `Results for “${submittedQuery}”` : `Popular ${mediaType === 'movie' ? 'movies' : 'series'}`}</h2><span className="text-sm text-zinc-500">{titles.length} titles</span></div>

      {loading ? <div className="flex min-h-64 items-center justify-center"><div className="spinner" aria-label="Loading titles"/></div> : errorMessage ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-6 py-10 text-center"><Film className="mx-auto h-9 w-9 text-zinc-500"/><h3 className="mt-4 text-lg font-semibold">Discovery needs a little setup</h3><p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{errorMessage}</p><p className="mt-3 text-sm text-zinc-500">You can still create your library and enter your own movie or series details.</p><Link to="/watchlist" className="btn-primary mt-5 inline-flex items-center gap-2 px-5 py-2.5"><BookmarkPlus className="h-4 w-4"/> Open my library</Link></div>
      ) : titles.length === 0 ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-6 py-12 text-center"><Search className="mx-auto h-8 w-8 text-zinc-600"/><p className="mt-3 font-semibold">No titles found</p><p className="mt-1 text-sm text-zinc-500">Try another search or clear the search field.</p></div> : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {titles.map((title) => {
            const image = posterUrl(title.posterPath);
            return <article key={`${title.mediaType}-${title.movieId}`} className="movie-card overflow-hidden rounded-lg bg-zinc-900">
              <div className="relative h-[400px] overflow-hidden bg-zinc-800">{image ? <img src={image} alt={`${title.title} poster`} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-105" onError={(event) => { event.currentTarget.style.display = 'none'; }}/> : <div className="flex h-full items-center justify-center"><Film className="h-12 w-12 text-zinc-600"/></div>}
                <span className="absolute left-3 top-3 rounded-md border border-white/10 bg-black/75 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-200">{title.mediaType === 'tv' ? 'Series' : 'Movie'}</span>
                <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-xs"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400"/>{title.voteAverage.toFixed(1)}</div>
              </div>
              <div className="p-4"><h3 className="mb-2 line-clamp-1 text-lg font-bold" title={title.title}>{title.title}</h3><div className="mt-1 flex items-center justify-between text-xs text-zinc-500"><span>{title.releaseDate ? title.releaseDate.slice(0, 4) : 'Release date unavailable'}</span><span>TMDB</span></div><p className="mt-3 line-clamp-3 min-h-[60px] text-sm leading-5 text-zinc-400">{title.overview || 'No synopsis available.'}</p>
                <button type="button" onClick={() => addToLibrary(title)} disabled={addingId === title.movieId} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-red-600 px-3 py-2 text-sm font-semibold transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-60">{addingId === title.movieId ? <><span className="spinner spinner-small"/> Adding…</> : <><Check className="h-4 w-4"/> Add to List</>}</button>
              </div>
            </article>;
          })}
        </div>
      )}
      <p className="text-center text-xs text-zinc-600">Movie metadata provided by TMDB. CineMate is not affiliated with or endorsed by TMDB.</p>
    </div>
  );
};

export default Trending;