import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Check, ChevronDown, PlayCircle, Clock3, Download, Edit3, Film, Heart, LibraryBig, Loader2, MonitorPlay, Play, Plus, Search, Star, Trash2, Tv2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';

export type WatchStatus = 'planned' | 'watching' | 'watched' | 'on_hold' | 'dropped';
export type MediaType = 'movie' | 'tv';

export interface LibraryItem {
  id: number;
  movieId: number | null;
  mediaType: MediaType;
  title: string;
  overview: string;
  posterPath: string;
  backdropPath: string;
  releaseDate: string;
  voteAverage: number;
  status: WatchStatus;
  watched: boolean;
  favorite: boolean;
  rating: number | null;
  notes: string;
  genres: string[];
  source: 'tmdb' | 'manual' | 'local' | 'streaming';
  filePath: string;
  mediaUrl: string;
  currentSeason: number;
  currentEpisode: number;
  createdAt: string;
  updatedAt: string;
}

interface AddFormState {
  title: string;
  mediaType: MediaType;
  releaseDate: string;
  overview: string;
  posterPath: string;
  genres: string;
  notes: string;
  source: 'manual' | 'local' | 'streaming';
  filePath: string;
  mediaUrl: string;
  currentSeason: string;
  currentEpisode: string;
}

interface EditFormState {
  title: string;
  releaseDate: string;
  overview: string;
  posterPath: string;
  genres: string;
  notes: string;
  filePath: string;
  mediaUrl: string;
  currentSeason: string;
  currentEpisode: string;
}

const emptyAddForm: AddFormState = {
  title: '', mediaType: 'movie', releaseDate: '', overview: '', posterPath: '', genres: '', notes: '',
  source: 'manual', filePath: '', mediaUrl: '', currentSeason: '0', currentEpisode: '0',
};

const statusLabels: Record<WatchStatus, string> = {
  planned: 'Want to watch', watching: 'Watching', watched: 'Watched', on_hold: 'On hold', dropped: 'Dropped',
};

function posterUrl(posterPath: string) {
  if (!posterPath) return '';
  if (/^https?:\/\//i.test(posterPath)) return posterPath;
  return `https://image.tmdb.org/t/p/w500${posterPath.startsWith('/') ? '' : '/'}${posterPath}`;
}

function getYear(value: string) {
  return value ? value.slice(0, 4) : '';
}

function isDirectVideoUrl(value: string) {
  try {
    const extension = new URL(value).pathname.toLowerCase().split('.').pop();
    return ['mp4', 'webm', 'ogg', 'm4v', 'mov'].includes(extension || '');
  } catch {
    return false;
  }
}

interface PlayerState { title: string; src: string; poster: string; isLocalFile: boolean; revokeOnClose?: boolean; }

const Watchlist = () => {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [mediaFilter, setMediaFilter] = useState<'all' | MediaType>('all');
  const [genreFilter, setGenreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | WatchStatus>('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'title' | 'rating'>('recent');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(emptyAddForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const filePickerRef = useRef<HTMLInputElement>(null);
  const pendingLocalItemRef = useRef<LibraryItem | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const requestedStatus = searchParams.get('status');
    if (requestedStatus && ['planned', 'watching', 'watched', 'on_hold', 'dropped'].includes(requestedStatus)) {
      setStatusFilter(requestedStatus as WatchStatus);
    }
    if (searchParams.get('favorite') === 'true') setFavoriteOnly(true);
  }, [searchParams]);

  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await apiRequest<LibraryItem[]>('/api/watchlist');
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load your library.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchLibrary(); }, [fetchLibrary]);

  useEffect(() => {
    if (!player?.revokeOnClose) return;
    const objectUrl = player.src;
    return () => URL.revokeObjectURL(objectUrl);
  }, [player]);

  useEffect(() => {
    if (!player) return;
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPlayer(null); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [player]);

  const availableGenres = useMemo(() => Array.from(new Set<string>(items.flatMap((item) => item.genres))).sort((a, b) => a.localeCompare(b)), [items]);

  const filteredItems = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (search && !`${item.title} ${item.overview} ${item.notes} ${item.genres.join(' ')}`.toLocaleLowerCase().includes(search)) return false;
      if (mediaFilter !== 'all' && item.mediaType !== mediaFilter) return false;
      if (genreFilter !== 'all' && !item.genres.includes(genreFilter)) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (favoriteOnly && !item.favorite) return false;
      return true;
    }).sort((first, second) => {
      if (sortBy === 'title') return first.title.localeCompare(second.title);
      if (sortBy === 'rating') return (second.rating || 0) - (first.rating || 0) || first.title.localeCompare(second.title);
      return second.updatedAt.localeCompare(first.updatedAt);
    });
  }, [items, query, mediaFilter, genreFilter, statusFilter, favoriteOnly, sortBy]);

  const stats = useMemo(() => ({
    total: items.length,
    watching: items.filter((item) => item.status === 'watching').length,
    watched: items.filter((item) => item.status === 'watched').length,
    favorites: items.filter((item) => item.favorite).length,
  }), [items]);

  const addItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const releaseDate = addForm.releaseDate.trim();
      const payload = {
        title: addForm.title.trim(),
        mediaType: addForm.mediaType,
        releaseDate: releaseDate && /^\d{4}$/.test(releaseDate) ? `${releaseDate}-01-01` : releaseDate,
        overview: addForm.overview.trim(),
        posterPath: addForm.posterPath.trim(),
        genres: addForm.genres.split(',').map((genre) => genre.trim()).filter(Boolean),
        notes: addForm.notes.trim(),
        source: addForm.source,
        filePath: addForm.filePath.trim(),
        mediaUrl: addForm.mediaUrl.trim(),
        currentSeason: Number(addForm.currentSeason) || 0,
        currentEpisode: Number(addForm.currentEpisode) || 0,
        status: 'planned' as WatchStatus,
      };
      const created = await apiRequest<LibraryItem>('/api/watchlist', { method: 'POST', body: JSON.stringify(payload) });
      setItems((current) => [created, ...current]);
      setAddForm(emptyAddForm);
      setShowAddForm(false);
      toast.success('Added to your library.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) toast('This title is already in your library.');
      else toast.error(error instanceof Error ? error.message : 'Could not add this title.');
    } finally {
      setSaving(false);
    }
  };

  const saveStatus = async (item: LibraryItem, status: WatchStatus) => {
    setBusyItemId(item.id);
    try {
      const updated = await apiRequest<LibraryItem>(`/api/watchlist/${item.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      toast.success(`Status changed to ${statusLabels[status].toLowerCase()}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update status.');
    } finally {
      setBusyItemId(null);
    }
  };

  const toggleFavorite = async (item: LibraryItem) => {
    setBusyItemId(item.id);
    try {
      const updated = await apiRequest<LibraryItem>(`/api/watchlist/${item.id}/favorite`, { method: 'PUT' });
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update favorite.');
    } finally { setBusyItemId(null); }
  };

  const setRating = async (item: LibraryItem, value: string) => {
    const rating = value ? Number(value) : null;
    setBusyItemId(item.id);
    try {
      const updated = await apiRequest<LibraryItem>(`/api/watchlist/${item.id}/rate`, { method: 'PUT', body: JSON.stringify({ rating }) });
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      toast.success(rating === null ? 'Your rating was cleared.' : 'Your rating was saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save rating.');
    } finally { setBusyItemId(null); }
  };

  const changeProgress = async (item: LibraryItem, delta: number) => {
    const currentEpisode = Math.max(0, item.currentEpisode + delta);
    const nextStatus = item.status === 'planned' && currentEpisode > 0 ? 'watching' : item.status;
    setBusyItemId(item.id);
    try {
      const updated = await apiRequest<LibraryItem>(`/api/watchlist/${item.id}/progress`, {
        method: 'PUT', body: JSON.stringify({ currentSeason: item.currentSeason, currentEpisode }),
      });
      setItems((current) => current.map((entry) => entry.id === updated.id ? { ...updated, status: updated.status || nextStatus } : entry));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update episode progress.');
    } finally { setBusyItemId(null); }
  };

  const removeItem = async (item: LibraryItem) => {
    if (!window.confirm(`Remove “${item.title}” from your library?`)) return;
    setBusyItemId(item.id);
    try {
      await apiRequest<void>(`/api/watchlist/${item.id}`, { method: 'DELETE' });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (editingId === item.id) { setEditingId(null); setEditForm(null); }
      toast.success('Removed from your library.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove this title.');
    } finally { setBusyItemId(null); }
  };

  const startEdit = (item: LibraryItem) => {
    setEditingId(item.id);
    setEditForm({
      title: item.title,
      releaseDate: item.releaseDate,
      overview: item.overview,
      posterPath: item.posterPath,
      genres: item.genres.join(', '),
      notes: item.notes,
      filePath: item.filePath,
      mediaUrl: item.mediaUrl,
      currentSeason: String(item.currentSeason),
      currentEpisode: String(item.currentEpisode),
    });
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>, item: LibraryItem) => {
    event.preventDefault();
    if (!editForm) return;
    setBusyItemId(item.id);
    try {
      const payload = {
        title: editForm.title.trim(),
        releaseDate: editForm.releaseDate.trim(),
        overview: editForm.overview.trim(),
        posterPath: editForm.posterPath.trim(),
        genres: editForm.genres.split(',').map((genre) => genre.trim()).filter(Boolean),
        notes: editForm.notes.trim(),
        filePath: editForm.filePath.trim(),
        mediaUrl: editForm.mediaUrl.trim(),
        currentSeason: Number(editForm.currentSeason) || 0,
        currentEpisode: Number(editForm.currentEpisode) || 0,
      };
      const updated = await apiRequest<LibraryItem>(`/api/watchlist/${item.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setEditingId(null);
      setEditForm(null);
      toast.success('Library details updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update this title.');
    } finally { setBusyItemId(null); }
  };

  const updateAddForm = <K extends keyof AddFormState>(key: K, value: AddFormState[K]) => setAddForm((current) => ({ ...current, [key]: value }));
  const updateEditForm = <K extends keyof EditFormState>(key: K, value: EditFormState[K]) => setEditForm((current) => current ? { ...current, [key]: value } : current);

  const playLinkedVideo = (item: LibraryItem) => {
    if (!item.mediaUrl) return;
    setPlayer({ title: item.title, src: item.mediaUrl, poster: posterUrl(item.posterPath), isLocalFile: false });
  };

  const exportLibrary = () => {
    const backup = { app: 'CineMate', schemaVersion: 1, exportedAt: new Date().toISOString(), items };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `cinemate-library-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    toast.success('Library backup exported. Keep the file somewhere private.');
  };

  const chooseLocalFile = (item: LibraryItem) => {
    pendingLocalItemRef.current = item;
    if (filePickerRef.current) {
      filePickerRef.current.value = '';
      filePickerRef.current.click();
    }
  };

  const handleLocalFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const item = pendingLocalItemRef.current;
    pendingLocalItemRef.current = null;
    if (!file || !item) return;
    const objectUrl = URL.createObjectURL(file);
    setPlayer({ title: item.title, src: objectUrl, poster: posterUrl(item.posterPath), isLocalFile: true, revokeOnClose: true });
  };

  return (
    <div className="space-y-7">
      <input ref={filePickerRef} className="hidden" type="file" accept="video/*,.mkv,.avi" onChange={handleLocalFile} aria-label="Choose a local video file" />
      {player && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true" aria-label={`Playing ${player.title}`}>
        <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-6"><div className="min-w-0"><h2 className="truncate font-bold">{player.title}</h2><p className="mt-0.5 text-xs text-zinc-500">{player.isLocalFile ? 'Playing a file from this device. The video is not uploaded.' : 'Playing from your linked media URL.'}</p></div><button type="button" onClick={() => setPlayer(null)} aria-label="Close video player" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="h-5 w-5"/></button></div>
          <div className="bg-black"><video key={player.src} src={player.src} poster={player.poster || undefined} controls autoPlay playsInline className="mx-auto max-h-[72vh] w-full bg-black" onError={() => toast.error('This video format or source could not be played by your browser.')}/></div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-zinc-500 sm:px-6"><span>For best compatibility, use MP4 (H.264/AAC) or WebM files.</span><button type="button" onClick={() => setPlayer(null)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800">Close player</button></div>
        </div>
      </div>}

      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-400">Your collection</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">My Watchlist</h1><p className="mt-2 max-w-xl text-zinc-400">Keep every title organized, remember your episode progress, and save notes or the location of your own media files.</p></div>
        <div className="flex flex-wrap gap-2">{items.length > 0 && <button type="button" onClick={exportLibrary} className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-900"><Download className="h-4 w-4"/> Export backup</button>}<button type="button" onClick={() => setShowAddForm((value) => !value)} className="btn-primary inline-flex shrink-0 items-center justify-center gap-2 px-5 py-3">{showAddForm ? <X className="h-5 w-5"/> : <Plus className="h-5 w-5"/>}{showAddForm ? 'Close form' : 'Add a title'}</button></div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[{ label: 'Total titles', value: stats.total, icon: LibraryBig }, { label: 'Watching now', value: stats.watching, icon: PlayCircle }, { label: 'Finished', value: stats.watched, icon: Check }, { label: 'Favorites', value: stats.favorites, icon: Heart }].map((stat) => {
          const Icon = stat.icon;
          return <div key={stat.label} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4"><div className="flex items-center justify-between gap-2 text-sm text-zinc-400"><span>{stat.label}</span><Icon className="h-4 w-4 text-red-400"/></div><p className="mt-2 text-2xl font-bold tabular-nums">{stat.value}</p></div>;
        })}
      </section>

      {showAddForm && <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 sm:p-7"><div className="mb-5"><h2 className="text-xl font-bold">Add to your collection</h2><p className="mt-1 text-sm text-zinc-400">Enter a film or series. Local file paths are private notes for your own device; a browser cannot play a path directly.</p></div>
        <form onSubmit={addItem} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><label className="form-label" htmlFor="add-title">Title *</label><input id="add-title" className="form-input" required maxLength={200} value={addForm.title} onChange={(event) => updateAddForm('title', event.target.value)} placeholder="e.g. Interstellar or Stranger Things"/></div>
          <div><label className="form-label" htmlFor="add-type">Type *</label><select id="add-type" className="form-input" value={addForm.mediaType} onChange={(event) => updateAddForm('mediaType', event.target.value as MediaType)}><option value="movie">Movie</option><option value="tv">TV series</option></select></div>
          <div><label className="form-label" htmlFor="add-year">Release year or date</label><input id="add-year" className="form-input" maxLength={20} value={addForm.releaseDate} onChange={(event) => updateAddForm('releaseDate', event.target.value)} placeholder="2026 or 2026-05-18"/></div>
          <div className="md:col-span-2"><label className="form-label" htmlFor="add-overview">Short description</label><textarea id="add-overview" className="form-input min-h-20 resize-y" maxLength={5000} value={addForm.overview} onChange={(event) => updateAddForm('overview', event.target.value)} placeholder="What is it about?" rows={3}/></div>
          <div className="md:col-span-2"><label className="form-label" htmlFor="add-poster">Poster image URL (optional)</label><input id="add-poster" type="url" className="form-input" maxLength={1000} value={addForm.posterPath} onChange={(event) => updateAddForm('posterPath', event.target.value)} placeholder="https://…/poster.jpg"/></div>
          <div className="md:col-span-2"><label className="form-label" htmlFor="add-genres">Genres</label><input id="add-genres" className="form-input" maxLength={500} value={addForm.genres} onChange={(event) => updateAddForm('genres', event.target.value)} placeholder="Sci-fi, Drama, Thriller"/></div>
          <div><label className="form-label" htmlFor="add-source">How do you keep this title?</label><select id="add-source" className="form-input" value={addForm.source} onChange={(event) => updateAddForm('source', event.target.value as AddFormState['source'])}><option value="manual">Personal entry</option><option value="local">Local file / NAS</option><option value="streaming">Online playback link</option></select></div>
          <div><label className="form-label" htmlFor="add-url">Playback URL (optional)</label><input id="add-url" type="url" className="form-input" maxLength={2000} value={addForm.mediaUrl} onChange={(event) => updateAddForm('mediaUrl', event.target.value)} placeholder="https://…"/></div>
          <div className="md:col-span-2"><label className="form-label" htmlFor="add-path">Local file location (optional)</label><input id="add-path" className="form-input" maxLength={1000} value={addForm.filePath} onChange={(event) => updateAddForm('filePath', event.target.value)} placeholder="e.g. E:\\Movies\\Interstellar.mkv or /mnt/media/series/"/></div>
          {addForm.mediaType === 'tv' && <div className="grid grid-cols-2 gap-4 md:col-span-2"><div><label className="form-label" htmlFor="add-season">Current season</label><input id="add-season" type="number" min="0" max="1000" className="form-input" value={addForm.currentSeason} onChange={(event) => updateAddForm('currentSeason', event.target.value)}/></div><div><label className="form-label" htmlFor="add-episode">Current episode</label><input id="add-episode" type="number" min="0" max="100000" className="form-input" value={addForm.currentEpisode} onChange={(event) => updateAddForm('currentEpisode', event.target.value)}/></div></div>}
          <div className="md:col-span-2"><label className="form-label" htmlFor="add-notes">Personal notes</label><textarea id="add-notes" className="form-input min-h-24 resize-y" maxLength={5000} value={addForm.notes} onChange={(event) => updateAddForm('notes', event.target.value)} placeholder="Who recommended it? Which episode should you continue from? Anything you want to remember…" rows={3}/></div>
          <div className="flex flex-wrap gap-3 md:col-span-2"><button type="submit" disabled={saving} className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>} {saving ? 'Saving…' : 'Save title'}</button><button type="button" onClick={() => { setShowAddForm(false); setAddForm(emptyAddForm); }} className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800">Cancel</button></div>
        </form>
      </section>}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/><input aria-label="Search library" value={query} onChange={(event) => setQuery(event.target.value)} className="form-input pl-10" placeholder="Search titles, genres, notes…"/></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:flex">
            <select aria-label="Filter by type" className="form-input min-w-32" value={mediaFilter} onChange={(event) => setMediaFilter(event.target.value as 'all' | MediaType)}><option value="all">All types</option><option value="movie">Movies</option><option value="tv">Series</option></select>
            <select aria-label="Filter by genre" className="form-input min-w-36" value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)}><option value="all">All genres</option>{availableGenres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}</select>
            <select aria-label="Filter by status" className="form-input min-w-40" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | WatchStatus)}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select aria-label="Sort library" className="form-input min-w-36" value={sortBy} onChange={(event) => setSortBy(event.target.value as 'recent' | 'title' | 'rating')}><option value="recent">Recently updated</option><option value="title">Title A–Z</option><option value="rating">Highest rated</option></select>
            <button type="button" aria-pressed={favoriteOnly} onClick={() => setFavoriteOnly((current) => !current)} className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${favoriteOnly ? 'border-red-500/50 bg-red-600/15 text-red-300' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}><Heart className="h-4 w-4" fill={favoriteOnly ? 'currentColor' : 'none'}/> Favorites</button>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-zinc-500"><span>{filteredItems.length} of {items.length} titles</span>{(query || mediaFilter !== 'all' || genreFilter !== 'all' || statusFilter !== 'all' || favoriteOnly) && <button type="button" className="text-red-400 hover:text-red-300" onClick={() => { setQuery(''); setMediaFilter('all'); setGenreFilter('all'); setStatusFilter('all'); setFavoriteOnly(false); }}>Clear filters</button>}</div>

        {loading ? <div className="flex min-h-64 items-center justify-center"><div className="spinner" aria-label="Loading your library"/></div> : loadError ? <div className="rounded-2xl border border-red-900/60 bg-red-950/20 px-6 py-10 text-center"><p className="font-semibold">Your library could not be loaded</p><p className="mt-2 text-sm text-zinc-400">{loadError}</p><button type="button" className="btn-secondary mt-4" onClick={() => void fetchLibrary()}>Try again</button></div> : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 py-14 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800"><BookmarkPlus className="h-7 w-7 text-zinc-400"/></div><h2 className="mt-4 text-xl font-bold">{items.length ? 'No matching titles' : 'Your library starts here'}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">{items.length ? 'Try adjusting the search or filters.' : 'Add movies and series from Discover or enter a personal title, including its local file location and your notes.'}</p><div className="mt-5 flex flex-wrap justify-center gap-3"><button type="button" onClick={() => setShowAddForm(true)} className="btn-primary inline-flex items-center gap-2 px-4 py-2.5"><Plus className="h-4 w-4"/> Add a title</button><a href="/trending" className="btn-secondary inline-flex items-center gap-2 px-4 py-2.5"><Search className="h-4 w-4"/> Discover</a></div></div>
        ) : <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredItems.map((item) => {
            const image = posterUrl(item.posterPath);
            const isBusy = busyItemId === item.id;
            return <article key={item.id} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
              <div className="flex flex-col">
                <div className="relative w-full bg-zinc-800">{image ? <img src={image} alt={`${item.title} poster`} loading="lazy" className="h-[400px] w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }}/> : <div className="flex h-[400px] items-center justify-center"><Film className="h-10 w-10 text-zinc-600"/></div>}<span className="absolute left-2 top-2 rounded-md bg-black/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide">{item.mediaType === 'tv' ? 'Series' : 'Movie'}</span></div>
                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <div className="flex items-start gap-2"><h2 className="min-w-0 flex-1 text-lg font-bold leading-6">{item.title}</h2><button type="button" title={item.favorite ? 'Remove from favorites' : 'Add to favorites'} disabled={isBusy} onClick={() => void toggleFavorite(item)} className={`rounded-lg p-1.5 ${item.favorite ? 'text-red-400' : 'text-zinc-500 hover:text-red-400'}`}><Heart className="h-5 w-5" fill={item.favorite ? 'currentColor' : 'none'}/></button></div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">{getYear(item.releaseDate) && <span>{getYear(item.releaseDate)}</span>}{item.voteAverage > 0 && <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400"/>{item.voteAverage.toFixed(1)} TMDB</span>}</div>
                  <p className="mt-3 line-clamp-3 text-sm leading-5 text-zinc-400">{item.overview || 'No description added yet.'}</p>
                  {item.genres.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{item.genres.slice(0, 4).map((genre) => <span key={genre} className="rounded-full bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300">{genre}</span>)}</div>}
                  <div className="mt-auto pt-4"><label htmlFor={`status-${item.id}`} className="sr-only">Watch status for {item.title}</label><div className="flex items-center gap-2"><select id={`status-${item.id}`} className="form-input min-w-0 flex-1 py-2 text-sm" value={item.status} disabled={isBusy} onChange={(event) => void saveStatus(item, event.target.value as WatchStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label={`Personal rating for ${item.title}`} title="Your personal rating out of 10" className="form-input w-24 py-2 text-sm" value={item.rating ?? ''} disabled={isBusy} onChange={(event) => void setRating(item, event.target.value)}><option value="">Rate /10</option>{Array.from({ length: 10 }, (_, index) => index + 1).map((rating) => <option key={rating} value={rating}>{rating}/10</option>)}</select></div></div>
                </div>
              </div>
              {item.mediaType === 'tv' && <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950/50 px-4 py-3"><div className="flex items-center gap-2 text-sm text-zinc-400"><Tv2 className="h-4 w-4 text-sky-400"/>Progress <span className="font-semibold text-white">S{item.currentSeason} · E{item.currentEpisode}</span></div><div className="flex gap-2"><button type="button" title="Previous episode" disabled={isBusy || item.currentEpisode === 0} onClick={() => void changeProgress(item, -1)} className="rounded-md border border-zinc-700 px-2 py-1 text-sm disabled:opacity-30">−</button><button type="button" disabled={isBusy} onClick={() => void changeProgress(item, 1)} className="inline-flex items-center gap-1 rounded-md bg-sky-600/20 px-2.5 py-1 text-sm font-semibold text-sky-300 hover:bg-sky-600/30 disabled:opacity-50">Next episode <ChevronDown className="h-3.5 w-3.5 -rotate-90"/></button></div></div>}
              {(item.filePath || item.mediaUrl || item.notes) && <div className="space-y-2 border-t border-zinc-800 px-4 py-3 text-sm">{item.filePath && <p className="break-all text-zinc-400"><span className="text-zinc-600">File:</span> {item.filePath}</p>}{item.mediaUrl && (isDirectVideoUrl(item.mediaUrl) ? <button type="button" onClick={() => playLinkedVideo(item)} className="inline-flex items-center gap-1.5 font-medium text-sky-400 hover:text-sky-300"><Play className="h-4 w-4"/> Watch in CineMate</button> : <a href={item.mediaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-sky-400 hover:text-sky-300"><MonitorPlay className="h-4 w-4"/> Open playback link <span aria-hidden="true">↗</span></a>)}{item.notes && <p className="line-clamp-2 whitespace-pre-line text-zinc-400"><span className="text-zinc-600">Notes:</span> {item.notes}</p>}</div>}
              {editingId === item.id && editForm && <form onSubmit={(event) => void saveEdit(event, item)} className="space-y-3 border-t border-zinc-800 bg-zinc-950/70 p-4">
                <h3 className="font-semibold">Edit title details</h3>
                <div><label className="form-label" htmlFor={`edit-title-${item.id}`}>Title</label><input id={`edit-title-${item.id}`} required maxLength={200} className="form-input" value={editForm.title} onChange={(event) => updateEditForm('title', event.target.value)}/></div>
                <div className="grid grid-cols-2 gap-3"><div><label className="form-label" htmlFor={`edit-year-${item.id}`}>Release date</label><input id={`edit-year-${item.id}`} maxLength={20} className="form-input" value={editForm.releaseDate} onChange={(event) => updateEditForm('releaseDate', event.target.value)}/></div>{item.mediaType === 'tv' && <><div><label className="form-label" htmlFor={`edit-season-${item.id}`}>Season</label><input id={`edit-season-${item.id}`} type="number" min="0" max="1000" className="form-input" value={editForm.currentSeason} onChange={(event) => updateEditForm('currentSeason', event.target.value)}/></div><div><label className="form-label" htmlFor={`edit-episode-${item.id}`}>Episode</label><input id={`edit-episode-${item.id}`} type="number" min="0" max="100000" className="form-input" value={editForm.currentEpisode} onChange={(event) => updateEditForm('currentEpisode', event.target.value)}/></div></>}</div>
                <div><label className="form-label" htmlFor={`edit-overview-${item.id}`}>Description</label><textarea id={`edit-overview-${item.id}`} rows={2} maxLength={5000} className="form-input resize-y" value={editForm.overview} onChange={(event) => updateEditForm('overview', event.target.value)}/></div>
                <div><label className="form-label" htmlFor={`edit-poster-${item.id}`}>Poster image URL</label><input id={`edit-poster-${item.id}`} type="text" maxLength={1000} className="form-input" value={editForm.posterPath} onChange={(event) => updateEditForm('posterPath', event.target.value)}/></div>
                <div><label className="form-label" htmlFor={`edit-genres-${item.id}`}>Genres (comma-separated)</label><input id={`edit-genres-${item.id}`} maxLength={500} className="form-input" value={editForm.genres} onChange={(event) => updateEditForm('genres', event.target.value)}/></div>
                <div><label className="form-label" htmlFor={`edit-path-${item.id}`}>Local file location</label><input id={`edit-path-${item.id}`} maxLength={1000} className="form-input" value={editForm.filePath} onChange={(event) => updateEditForm('filePath', event.target.value)}/></div>
                <div><label className="form-label" htmlFor={`edit-url-${item.id}`}>Playback URL (HTTP/S only)</label><input id={`edit-url-${item.id}`} type="url" maxLength={2000} className="form-input" value={editForm.mediaUrl} onChange={(event) => updateEditForm('mediaUrl', event.target.value)}/></div>
                <div><label className="form-label" htmlFor={`edit-notes-${item.id}`}>Personal notes</label><textarea id={`edit-notes-${item.id}`} rows={3} maxLength={5000} className="form-input resize-y" value={editForm.notes} onChange={(event) => updateEditForm('notes', event.target.value)}/></div>
                <div className="flex gap-2"><button type="submit" disabled={isBusy} className="btn-primary px-4 py-2 text-sm">Save changes</button><button type="button" onClick={() => { setEditingId(null); setEditForm(null); }} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Cancel</button></div>
              </form>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-4 py-3"><span className="inline-flex items-center gap-1.5 text-xs text-zinc-600"><Clock3 className="h-3.5 w-3.5"/>Updated {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : 'recently'}</span><div className="flex flex-wrap justify-end gap-1"><button type="button" onClick={() => chooseLocalFile(item)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-sky-400 hover:bg-sky-950/40 hover:text-sky-300" title="Choose a video file from your device"><Play className="h-3.5 w-3.5"/><span>Play local</span></button><button type="button" disabled={isBusy} onClick={() => startEdit(item)} title="Edit title details" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-40"><Edit3 className="h-3.5 w-3.5"/><span>Edit</span></button><button type="button" disabled={isBusy} onClick={() => void removeItem(item)} title="Remove from library" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-zinc-500 hover:bg-red-950/50 hover:text-red-300 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5"/><span>Remove</span></button></div></div>
            </article>;
          })}
        </div>}
      </section>
    </div>
  );
};

export default Watchlist;