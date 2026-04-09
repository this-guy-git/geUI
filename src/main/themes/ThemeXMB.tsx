import React, { useEffect, useState } from 'react';
import { Config, GameEntry } from '../App';
import { GameCard } from '../GameCard';

declare const require: any;

const { ipcRenderer } = require('electron');

export const ThemeXMB: React.FC<{ config: Config; selectedEmu: number; setSelectedEmu: (i: number) => void }> = ({ config, selectedEmu, setSelectedEmu }) => {
  const emu = config.emulators[selectedEmu];
  const [games, setGames] = useState<GameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    ipcRenderer.invoke('list-games', emu.name, emu.gamesDir).then((files: GameEntry[]) => {
      setGames(files);
      setLoading(false);
    });
  }, [emu.name, emu.gamesDir]);

  return (
    <div style={{
      background: 'linear-gradient(90deg,#222 60%,#444)',
      color: '#fff',
      minHeight: '100vh',
      padding: 32,
      fontFamily: 'Arial, Segoe UI, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <h1 style={{ fontWeight: 400, fontSize: 48, marginBottom: 16, letterSpacing: 2 }}>{emu.name || 'Emulator'}</h1>
      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        {config.emulators.map((emu, i) => (
          <button
            key={i}
            style={{
              padding: '18px 32px',
              background: i === selectedEmu ? 'linear-gradient(90deg,#08f,#222)' : '#222',
              color: '#fff',
              border: 'none',
              borderRadius: 16,
              fontSize: 20,
              fontWeight: 500,
              boxShadow: i === selectedEmu ? '0 2px 12px #08f8' : 'none',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onClick={() => setSelectedEmu(i)}
          >
            {emu.name || 'Emulator'}
          </button>
        ))}
      </div>
      <div style={{
        background: '#333',
        borderRadius: 24,
        padding: 32,
        width: '100%',
        maxWidth: 900,
        minHeight: 300,
        boxShadow: '0 4px 32px #0008',
        marginBottom: 32,
      }}>
        <h2 style={{ fontWeight: 400, fontSize: 28, marginBottom: 16 }}>{emu.name || 'Emulator'} Games</h2>
        {loading ? (
          <div>Loading games...</div>
        ) : games.length === 0 ? (
          <div>No games found in <span style={{ color: '#08f' }}>{emu.gamesDir}</span></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 228px)', gap: 24, justifyContent: 'center', justifyItems: 'center' }}>
            {games.map((game, idx) => (
              <GameCard key={idx} game={game} cardBackground="#222" />
            ))}
          </div>
        )}
      </div>
      <div style={{ color: '#aaa', fontSize: 16 }}>Games directory: <span style={{ color: '#08f' }}>{emu.gamesDir}</span></div>
    </div>
  );
};
