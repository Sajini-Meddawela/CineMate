import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Watchlist from './pages/Watchlist';
import Trending from './pages/Trending';
import Auth from './pages/Auth';

function App() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/trending" element={<Trending />} />
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;