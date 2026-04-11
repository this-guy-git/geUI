import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Config, GameEntry } from '../App';
import { XmbWaveBackground } from './XmbWaveBackground';

declare const require: any;

const { ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');
const fs = require('fs');
const nodePath = require('path');

const STICK_DEADZONE = 0.58;
const NAV_FIRST_REPEAT_MS = 260;
const NAV_REPEAT_MS = 140;
const MIN_VISIBLE_GAMES = 6;
const MAX_VISIBLE_GAMES = 12;

const resolveFileUrl = (relativeOrAbsolutePath: string) => {
  if (!relativeOrAbsolutePath) {
    return '';
  }

  const candidatePaths = nodePath.isAbsolute(relativeOrAbsolutePath)
    ? [relativeOrAbsolutePath]
    : [
        nodePath.join(((globalThis as any).process?.cwd?.() || ''), relativeOrAbsolutePath),
        nodePath.join((((globalThis as any).process?.resourcesPath as string) || ''), relativeOrAbsolutePath),
      ];

  const absolutePath = candidatePaths.find(candidatePath => candidatePath && fs.existsSync(candidatePath));

  if (!absolutePath) {
    return '';
  }

  try {
    return pathToFileURL(absolutePath).href;
  } catch {
    return '';
  }
};

type XmbCategory = {
  key: string;
  label: string;
  iconFallback: string;
  iconAsset: string;
};

const XMB_CATEGORIES: XmbCategory[] = [
  { key: 'settings', label: 'Settings', iconFallback: 'ST', iconAsset: 'assets/images/xmb-settings.png' },
  { key: 'photo', label: 'Photo', iconFallback: 'PH', iconAsset: 'assets/images/xmb-photo.png' },
  { key: 'music', label: 'Music', iconFallback: 'MU', iconAsset: 'assets/images/xmb-music.png' },
  { key: 'video', label: 'Video', iconFallback: 'VD', iconAsset: 'assets/images/xmb-movies.png' },
  { key: 'game', label: 'Game', iconFallback: 'GM', iconAsset: 'assets/images/xmb-game.png' },
  { key: 'network', label: 'Network', iconFallback: 'NW', iconAsset: 'assets/images/xmb-network.png' },
];

export const ThemeXMB: React.FC<{ config: Config; selectedEmu: number; setSelectedEmu: (i: number) => void; themeVariant: 'light' | 'dark'; inputLocked?: boolean }> = ({ config, selectedEmu, setSelectedEmu, themeVariant, inputLocked = false }) => {
  const listMouseInputEnabled = false;
  const emu = config.emulators[selectedEmu];
  const [games, setGames] = useState<GameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedGameIndex, setFocusedGameIndex] = useState(0);
  const [thumbnailIndexByFile, setThumbnailIndexByFile] = useState<Record<string, number>>({});
  const [nowLabel, setNowLabel] = useState(() => new Date().toLocaleString());
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight || 900);
  const controllerActiveRef = useRef(false);
  const cursorClickAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastFocusedIndexRef = useRef<number | null>(null);
  const focusedGameIndexRef = useRef(0);
  const launchHoldRef = useRef(false);
  const navHoldRef = useRef<Record<'up' | 'down', { active: boolean; nextAt: number }>>({
    up: { active: false, nextAt: 0 },
    down: { active: false, nextAt: 0 },
  });
  const isDark = themeVariant === 'dark';

  const palette = {
    pageBackground: isDark
      ? 'linear-gradient(180deg, #1f1237 0%, #1a1030 35%, #120a24 68%, #0b0718 100%)'
      : 'linear-gradient(180deg, #3da6e6 0%, #2a8fce 34%, #1c73b5 66%, #12548d 100%)',
    textMain: isDark ? '#f2edff' : '#f5fcff',
    textMuted: isDark ? 'rgba(233, 220, 255, 0.72)' : 'rgba(226, 244, 255, 0.86)',
    itemActive: isDark ? 'rgba(196, 162, 255, 0.28)' : 'rgba(196, 236, 255, 0.36)',
    itemIdle: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(233, 248, 255, 0.16)',
    iconRing: isDark ? 'rgba(218, 190, 255, 0.5)' : 'rgba(210, 241, 255, 0.76)',
    waveMain: isDark ? 'rgba(230, 213, 255, 0.42)' : 'rgba(240, 250, 255, 0.76)',
    waveSecondary: isDark ? 'rgba(190, 152, 245, 0.26)' : 'rgba(197, 232, 255, 0.54)',
    rowSelectedBackground: isDark
      ? 'linear-gradient(90deg, rgba(170, 130, 255, 0.34) 0%, rgba(145, 104, 236, 0.2) 45%, rgba(97, 66, 162, 0.06) 100%)'
      : 'linear-gradient(90deg, rgba(210, 244, 255, 0.58) 0%, rgba(150, 220, 255, 0.36) 45%, rgba(98, 180, 235, 0.1) 100%)',
  };

  const activeCategory = 'game';

  const categoryIconUrls = useMemo(() => {
    const icons: Record<string, string> = {};
    for (const category of XMB_CATEGORIES) {
      icons[category.key] = resolveFileUrl(category.iconAsset);
    }
    return icons;
  }, []);

  const clockIconUrl = useMemo(() => resolveFileUrl('assets/images/xmb-clock.png'), []);

  const visibleGameCount = useMemo(() => {
    // Reserve vertical space for top status, category row, title, and padding.
    const reservedHeight = 300;
    const rowHeight = 78;
    const computedRows = Math.floor((viewportHeight - reservedHeight) / rowHeight);
    return Math.max(MIN_VISIBLE_GAMES, Math.min(MAX_VISIBLE_GAMES, computedRows));
  }, [viewportHeight]);

  const focusAnchorIndex = useMemo(() => {
    return Math.max(2, Math.floor(visibleGameCount / 3));
  }, [visibleGameCount]);

  const listStartIndex = useMemo(() => {
    if (games.length <= visibleGameCount) {
      return 0;
    }

    const maxWindowStart = games.length - visibleGameCount;
    const anchoredStart = focusedGameIndex - focusAnchorIndex;
    return Math.max(0, Math.min(maxWindowStart, anchoredStart));
  }, [focusAnchorIndex, focusedGameIndex, games.length, visibleGameCount]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyWidth = body.style.width;
    const previousBodyHeight = body.style.height;

    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.width = '100%';
    body.style.height = '100%';

    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.width = previousBodyWidth;
      body.style.height = previousBodyHeight;
    };
  }, []);

  const launchGameByIndex = useCallback(async (index: number) => {
    if (index < 0 || index >= games.length) {
      return;
    }

    const selectedGame = games[index];
    const gamePath = nodePath.join(emu.gamesDir, selectedGame.fileName);

    try {
      const result = await ipcRenderer.invoke('launch-game', emu.name, emu.path, gamePath);

      if (!result || !result.ok) {
        return;
      }
    } catch {
      // Keep XMB launch flow silent.
    }
  }, [emu.gamesDir, emu.name, emu.path, games]);

  useEffect(() => {
    setLoading(true);
    lastFocusedIndexRef.current = null;
    setFocusedGameIndex(0);
    setThumbnailIndexByFile({});
    ipcRenderer.invoke('list-games', emu.name, emu.gamesDir).then((files: GameEntry[]) => {
      setGames(files);
      setLoading(false);
    });
  }, [emu.name, emu.gamesDir]);

  useEffect(() => {
    const cursorClickUrl = resolveFileUrl('assets/music/xmb-click.mp3');
    if (!cursorClickUrl) {
      cursorClickAudioRef.current = null;
      return;
    }

    const audio = new Audio(cursorClickUrl);
    audio.preload = 'auto';
    audio.volume = 0.5;
    cursorClickAudioRef.current = audio;

    return () => {
      audio.pause();
      cursorClickAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (loading || games.length === 0) {
      return;
    }

    if (lastFocusedIndexRef.current === null) {
      lastFocusedIndexRef.current = focusedGameIndex;
      return;
    }

    if (lastFocusedIndexRef.current === focusedGameIndex) {
      return;
    }

    lastFocusedIndexRef.current = focusedGameIndex;

    const clickAudio = cursorClickAudioRef.current;
    if (!clickAudio) {
      return;
    }

    try {
      clickAudio.currentTime = 0;
      void clickAudio.play();
    } catch {
      // Ignore playback failures from browser autoplay restrictions.
    }
  }, [focusedGameIndex, games.length, loading]);

  useEffect(() => {
    focusedGameIndexRef.current = focusedGameIndex;
  }, [focusedGameIndex]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowLabel(new Date().toLocaleString());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight || 900);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = () => {
      controllerActiveRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  useEffect(() => {
    let rafId = 0;

    const tryRepeat = (pressed: boolean, hold: { active: boolean; nextAt: number }, now: number, action: () => void) => {
      if (!pressed) {
        hold.active = false;
        hold.nextAt = 0;
        return;
      }

      if (!hold.active) {
        hold.active = true;
        hold.nextAt = now + NAV_FIRST_REPEAT_MS;
        action();
        return;
      }

      if (now >= hold.nextAt) {
        hold.nextAt = now + NAV_REPEAT_MS;
        action();
      }
    };

    const tick = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = Array.from(gamepads).find(candidate => candidate && candidate.connected && candidate.mapping === 'standard');

      if (inputLocked) {
        navHoldRef.current.up.active = false;
        navHoldRef.current.down.active = false;
        launchHoldRef.current = false;
        controllerActiveRef.current = false;
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      if (!pad || loading || games.length === 0) {
        navHoldRef.current.up.active = false;
        navHoldRef.current.down.active = false;
        launchHoldRef.current = false;
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      const axisY = pad.axes?.[1] || 0;
      const pressUp = !!pad.buttons?.[12]?.pressed || axisY <= -STICK_DEADZONE;
      const pressDown = !!pad.buttons?.[13]?.pressed || axisY >= STICK_DEADZONE;
      const pressA = !!pad.buttons?.[0]?.pressed;
      const gameCount = games.length;
      const now = performance.now();

      if (pressUp || pressDown || pressA) {
        controllerActiveRef.current = true;
      }

      tryRepeat(pressUp, navHoldRef.current.up, now, () => {
        setFocusedGameIndex(previous => (previous <= 0 ? previous : previous - 1));
      });

      tryRepeat(pressDown, navHoldRef.current.down, now, () => {
        setFocusedGameIndex(previous => (previous >= gameCount - 1 ? previous : previous + 1));
      });

      if (pressA && !launchHoldRef.current) {
        void launchGameByIndex(focusedGameIndexRef.current);
      }

      launchHoldRef.current = pressA;
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      navHoldRef.current.up.active = false;
      navHoldRef.current.down.active = false;
      launchHoldRef.current = false;
    };
  }, [games.length, inputLocked, launchGameByIndex, loading]);

  return (
    <div
      style={{
        background: palette.pageBackground,
        color: palette.textMain,
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'Segoe UI, Arial, sans-serif',
      }}
    >
      <style>{`
        @keyframes xmbSparkFloat {
          0% { transform: translateY(0px); opacity: 0.3; }
          50% { transform: translateY(-18px); opacity: 0.75; }
          100% { transform: translateY(0px); opacity: 0.3; }
        }
      `}</style>

      <XmbWaveBackground themeVariant={themeVariant} canvasOpacityDark={0.76} canvasOpacityLight={0.68} />

      <div
        style={{
          position: 'absolute',
          top: 18,
          right: 98,
          zIndex: 4,
          color: palette.textMuted,
          fontSize: 14,
          lineHeight: 1.2,
          letterSpacing: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          pointerEvents: 'none',
        }}
      >
        {clockIconUrl ? (
          <img
            src={clockIconUrl}
            alt=""
            aria-hidden="true"
            style={{ width: 64, height: 64, objectFit: 'contain', display: 'block', flex: '0 0 auto', marginRight: -10, alignSelf: 'center', transform: 'translateY(3px)' }}
          />
        ) : null}
        <span style={{ marginLeft: -12, display: 'inline-flex', alignItems: 'center' }}>{nowLabel}</span>
      </div>

      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '56px 56px 42px', boxSizing: 'border-box' }}>
        <div style={{ width: 'min(1100px, 92vw)' }}>
        <div style={{ display: 'flex', gap: 30, alignItems: 'flex-start', justifyContent: 'center', marginBottom: 34, overflowX: 'hidden', paddingBottom: 4, width: '100%' }}>
          {XMB_CATEGORIES.map(category => {
            const isActive = category.key === activeCategory;

            return (
              <div
                key={category.key}
                style={{
                  minWidth: 76,
                  textAlign: 'center',
                  opacity: isActive ? 1 : 0.62,
                  transform: isActive ? 'translateY(0)' : 'translateY(2px)',
                  transition: 'opacity 160ms ease, transform 160ms ease',
                }}
              >
                <div
                  style={{
                    width: 68,
                    height: 68,
                    margin: '0 auto 6px',
                    borderRadius: 999,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 17,
                    fontWeight: 800,
                    letterSpacing: 0.7,
                    background: 'transparent',
                    boxShadow: 'none',
                    color: isActive ? '#ffffff' : palette.textMuted,
                    textShadow: isActive ? '0 0 16px rgba(255,255,255,0.92)' : 'none',
                    transform: isActive ? 'scale(1.08)' : 'scale(1)',
                    transition: 'transform 160ms ease, color 160ms ease, text-shadow 160ms ease',
                  }}
                >
                  {categoryIconUrls[category.key] ? (
                    <img
                      src={categoryIconUrls[category.key]}
                      alt=""
                      aria-hidden="true"
                      style={{
                        width: 60,
                        height: 60,
                        objectFit: 'contain',
                        filter: isActive
                          ? 'drop-shadow(0 0 8px rgba(255,255,255,0.92)) brightness(1.18)'
                          : 'brightness(0.9) opacity(0.85)',
                        transition: 'filter 160ms ease',
                      }}
                    />
                  ) : (
                    category.iconFallback
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 760px)', justifyContent: 'center', alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 300, marginBottom: 16, textShadow: '0 2px 14px rgba(0,0,0,0.18)' }}>
              {emu.name} Games
            </div>

            {loading ? (
              <div style={{ color: palette.textMuted, fontSize: 18 }}>Loading games...</div>
            ) : games.length === 0 ? (
              <div style={{ color: palette.textMuted, fontSize: 18 }}>No games found in {emu.gamesDir}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {games.slice(listStartIndex, listStartIndex + visibleGameCount).map((game, idx) => {
                  const globalIndex = listStartIndex + idx;
                  const isFocused = globalIndex === focusedGameIndex;
                  const thumbnailIndex = thumbnailIndexByFile[game.fileName] ?? 0;
                  const thumbnail = game.thumbnailUrls[thumbnailIndex];

                  return (
                    <button
                      key={game.fileName}
                      type="button"
                      onMouseEnter={() => {
                        if (!listMouseInputEnabled) {
                          return;
                        }

                        if (inputLocked) {
                          return;
                        }

                        if (controllerActiveRef.current) {
                          return;
                        }

                        setFocusedGameIndex(globalIndex);
                      }}
                      onClick={() => {
                        if (!listMouseInputEnabled) {
                          return;
                        }

                        void launchGameByIndex(globalIndex);
                      }}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '58px 1fr',
                        gap: 12,
                        alignItems: 'center',
                        border: 'none',
                        borderRadius: 12,
                        padding: '8px 12px',
                        background: 'transparent',
                        color: palette.textMain,
                        textAlign: 'left',
                        cursor: listMouseInputEnabled ? 'pointer' : 'default',
                        boxShadow: 'none',
                        backdropFilter: 'none',
                        WebkitBackdropFilter: 'none',
                        outline: 'none',
                        pointerEvents: listMouseInputEnabled ? 'auto' : 'none',
                      }}
                    >
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 10,
                          border: 'none',
                          background: 'transparent',
                          overflow: 'hidden',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 14,
                          fontWeight: 700,
                        }}
                      >
                        {thumbnail ? (
                          <img
                            src={thumbnail}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            onError={event => {
                              if (thumbnailIndex < game.thumbnailUrls.length - 1) {
                                setThumbnailIndexByFile(previous => ({
                                  ...previous,
                                  [game.fileName]: thumbnailIndex + 1,
                                }));
                                return;
                              }

                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          'GM'
                        )}
                      </div>
                      <div
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontSize: isFocused ? 24 : 20,
                          fontWeight: isFocused ? 400 : 300,
                          lineHeight: 1.2,
                          color: isFocused ? '#ffffff' : palette.textMain,
                          textShadow: isFocused ? '0 0 14px rgba(255,255,255,0.95)' : 'none',
                          transition: 'font-size 120ms ease, text-shadow 120ms ease',
                        }}
                      >
                        {game.displayName}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </div>

      </div>

      {new Array(22).fill(0).map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 2,
            height: 2,
            borderRadius: 999,
            background: isDark ? 'rgba(245, 232, 255, 0.85)' : 'rgba(255, 255, 255, 0.9)',
            top: `${8 + ((i * 17) % 74)}%`,
            left: `${4 + ((i * 37) % 92)}%`,
            opacity: 0.35,
            animation: `xmbSparkFloat ${4.4 + (i % 6) * 0.8}s ease-in-out ${(i % 7) * 0.3}s infinite`,
            pointerEvents: 'none',
          }}
        />
      ))}

    </div>
  );
};
