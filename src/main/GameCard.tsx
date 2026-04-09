import React, { useState } from 'react';
import { GameEntry } from './App';

type GameCardProps = {
  game: GameEntry;
  cardBackground: string;
};

export const GameCard: React.FC<GameCardProps> = ({ game, cardBackground }) => {
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const currentThumbnail = game.thumbnailUrls[thumbnailIndex];

  return (
    <div
      style={{
        background: cardBackground,
        borderRadius: 16,
        width: 228,
        height: 344,
        minWidth: 228,
        maxWidth: 228,
        minHeight: 344,
        maxHeight: 344,
        padding: 12,
        boxShadow: '0 2px 8px #0006',
        fontWeight: 400,
        color: '#fff',
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          bottom: 48,
          borderRadius: 12,
          background: '#111827',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          padding: 12,
          boxSizing: 'border-box',
        }}
      >
        {currentThumbnail ? (
          <img
            src={currentThumbnail}
            alt={game.displayName}
            style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center center', display: 'block' }}
            onError={event => {
              if (thumbnailIndex < game.thumbnailUrls.length - 1) {
                setThumbnailIndex(currentThumbnailIndex => currentThumbnailIndex + 1);
                return;
              }

              event.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div style={{ fontSize: 48 }}>🎮</div>
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          fontWeight: 700,
          fontSize: 13,
          lineHeight: 1.15,
          height: 34,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          whiteSpace: 'normal',
          textOverflow: 'ellipsis',
          textAlign: 'center',
          padding: '0 4px',
          boxSizing: 'border-box',
        }}
      >
        {game.displayName}
      </div>
    </div>
  );
};