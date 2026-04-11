import React, { useEffect, useState } from 'react';
import { Config, GameEntry } from '../App';
import { GameCard } from '../GameCard';

declare const require: any;

const { ipcRenderer } = require('electron');

export const ThemeXbox: React.FC<{ config: Config; selectedEmu: number; setSelectedEmu: (i: number) => void; themeVariant: 'light' | 'dark' }> = ({ config, selectedEmu, setSelectedEmu, themeVariant }) => {
  const emu = config.emulators[selectedEmu];
  const [games, setGames] = useState<GameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const isDark = themeVariant === 'dark';
  const pageBackground = isDark
    ? 'linear-gradient(135deg, #0f5f16 60%, #155f25 100%)'
    : 'linear-gradient(135deg, #e7f6e7 0%, #c8e7c8 100%)';
  const panelBackground = isDark ? '#1d9f1d' : '#f5fbf5';
  const cardBackground = isDark ? '#107c10' : '#dcefdc';
  const buttonBackground = (selected: boolean) => (selected ? (isDark ? 'linear-gradient(90deg,#1d9f1d,#107c10)' : 'linear-gradient(90deg,#cde9cd,#a5d8a5)') : (isDark ? '#222' : '#edf6ed'));
  const buttonText = isDark ? '#fff' : '#123012';
  useEffect(() => {
    setLoading(true);
    ipcRenderer.invoke('list-games', emu.name, emu.gamesDir).then((files: GameEntry[]) => {
      setGames(files);
      setLoading(false);
    });
  }, [emu.name, emu.gamesDir]);

  return (
    <div style={{
      background: pageBackground,
      color: isDark ? '#fff' : '#102110',
      minHeight: '100vh',
      padding: 32,
      fontFamily: 'Segoe UI, Arial, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <h1 style={{ fontWeight: 700, fontSize: 48, marginBottom: 16, letterSpacing: 2 }}>{emu.name || 'Emulator'}</h1>
      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        {config.emulators.map((emu, i) => (
          <button
            key={i}
            style={{
              padding: '18px 32px',
              background: buttonBackground(i === selectedEmu),
              color: buttonText,
              border: 'none',
              borderRadius: 16,
              fontSize: 20,
              fontWeight: 500,
              boxShadow: i === selectedEmu ? (isDark ? '0 2px 12px #1d9f1d88' : '0 2px 12px rgba(79, 153, 79, 0.25)') : 'none',
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
        background: panelBackground,
        borderRadius: 24,
        padding: 32,
        width: '100%',
        maxWidth: 900,
        minHeight: 300,
        boxShadow: isDark ? '0 4px 32px #0008' : '0 4px 32px rgba(68, 98, 68, 0.18)',
        marginBottom: 32,
      }}>
        <h2 style={{ fontWeight: 400, fontSize: 28, marginBottom: 16 }}>{emu.name || 'Emulator'} Games</h2>
        {loading ? (
          <div>Loading games...</div>
        ) : games.length === 0 ? (
          <div>No games found in <span style={{ color: '#fff' }}>{emu.gamesDir}</span></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 228px)', gap: 24, justifyContent: 'center', justifyItems: 'center' }}>
            {games.map((game, idx) => (
              <GameCard key={idx} game={game} cardBackground={cardBackground} themeVariant={themeVariant} />
            ))}
          </div>
        )}
      </div>
      <div style={{ color: isDark ? '#eee' : '#244224', fontSize: 16 }}>Games directory: <span style={{ color: isDark ? '#fff' : '#103710' }}>{emu.gamesDir}</span></div>
    </div>
  );
};
