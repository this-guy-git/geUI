import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Config, GameEntry } from '../App';

declare const require: any;

const { ipcRenderer } = require('electron');
const nodePath = require('path');

const TILES_PER_ROW = 8;
const ROWS_PER_PAGE = 4;
const GAMES_PER_PAGE = TILES_PER_ROW * ROWS_PER_PAGE;
const STICK_DEADZONE = 0.45;
const NAV_FIRST_REPEAT_MS = 210;
const NAV_REPEAT_MS = 95;
const VOLUME_REPEAT_MS = 80;

type WiiUTileProps = {
  game: GameEntry;
  tileSize: number;
  isHovered: boolean;
  isFocused: boolean;
  onActivate: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
};

type FloatShard = {
  x: string;
  y: string;
  w: number;
  h: number;
  shape: 'pill' | 'diamond' | 'blob' | 'slab' | 'triangle';
  rotate: number;
  opacity: number;
  radius: number;
  blur: number;
  dur: number;
  delay: number;
  tx1: number;
  ty1: number;
  tx2: number;
  ty2: number;
  tx3: number;
  ty3: number;
  tw1: number;
  tw2: number;
  tw3: number;
};

type ShardPhysics = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  vr: number;
};

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

const shapeKinds: Array<FloatShard['shape']> = ['pill', 'diamond', 'blob', 'slab', 'triangle'];

const createRandomShards = (count: number): FloatShard[] =>
  new Array(count).fill(0).map(() => {
    const shape = shapeKinds[Math.floor(randomBetween(0, shapeKinds.length))];

    let width = randomBetween(34, 108);
    let height = randomBetween(14, 58);

    if (shape === 'pill') {
      width = randomBetween(44, 114);
      height = randomBetween(12, 26);
    }

    if (shape === 'diamond' || shape === 'triangle') {
      const side = randomBetween(22, 52);
      width = side;
      height = side;
    }

    if (shape === 'blob') {
      width = randomBetween(28, 84);
      height = randomBetween(20, 66);
    }

    return {
      x: `${randomBetween(-2, 98).toFixed(2)}%`,
      y: `${randomBetween(-2, 98).toFixed(2)}%`,
      w: width,
      h: height,
      shape,
      rotate: randomBetween(-38, 38),
      opacity: randomBetween(0.28, 0.62),
      radius: randomBetween(8, 999),
      blur: randomBetween(0, 1.6),
      dur: randomBetween(6.8, 16.5),
      delay: randomBetween(0, 4.2),
      tx1: randomBetween(-18, 18),
      ty1: randomBetween(-16, 16),
      tx2: randomBetween(-24, 24),
      ty2: randomBetween(-20, 20),
      tx3: randomBetween(-14, 14),
      ty3: randomBetween(-14, 14),
      tw1: randomBetween(-3, 3),
      tw2: randomBetween(-4, 4),
      tw3: randomBetween(-3, 3),
    };
  });

const WiiUTile: React.FC<WiiUTileProps> = ({ game, tileSize, isHovered, isFocused, onActivate, onHoverStart, onHoverEnd }) => {
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const currentThumbnail = game.thumbnailUrls[thumbnailIndex];

  useEffect(() => {
    setThumbnailIndex(0);
  }, [game.fileName]);

  return (
    <div
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onClick={onActivate}
      className="wiiu-liquid-button"
      style={{
        width: tileSize,
        height: tileSize,
        borderRadius: 20,
        border: '1px solid rgba(176, 189, 200, 0.96)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(231,238,244,0.96) 100%)',
        boxShadow: isFocused
          ? '0 0 0 3px rgba(0, 189, 232, 0.36), 0 12px 22px rgba(41, 53, 70, 0.22), inset 0 1px 0 rgba(255,255,255,0.98)'
          : isHovered
          ? '0 10px 20px rgba(41, 53, 70, 0.2), inset 0 1px 0 rgba(255,255,255,0.96)'
          : '0 4px 10px rgba(55, 68, 88, 0.14), inset 0 1px 0 rgba(255,255,255,0.94)',
        display: 'grid',
        placeItems: 'center',
        position: 'relative',
        transition: 'transform 110ms ease, box-shadow 110ms ease',
        transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: isHovered || isFocused ? 8 : 1,
        cursor: 'pointer',
      }}
    >
      <div
        className="wiiu-liquid-inner"
        style={{
          width: tileSize - 8,
          height: tileSize - 8,
          borderRadius: 17,
          border: '1px solid rgba(192, 204, 214, 0.75)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.65) 0%, rgba(233,241,246,0.45) 100%)',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}
      >
        {currentThumbnail ? (
          <img
            src={currentThumbnail}
            alt={game.displayName}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            onError={event => {
              if (thumbnailIndex < game.thumbnailUrls.length - 1) {
                setThumbnailIndex(currentThumbnailIndex => currentThumbnailIndex + 1);
                return;
              }

              event.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div style={{ fontSize: 32, color: '#5c6d86' }}>🎮</div>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          top: 7,
          height: 24,
          borderRadius: 999,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.08) 100%)',
          pointerEvents: 'none',
        }}
      />

      {(isHovered || isFocused) && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 11px)',
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: Math.max(240, tileSize * 3.2),
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            padding: '9px 14px',
            borderRadius: 15,
            border: '1px solid rgba(196, 208, 218, 0.95)',
            background: 'rgba(255,255,255,0.96)',
            boxShadow: '0 10px 20px rgba(42, 57, 77, 0.2)',
            color: '#3d4a5f',
            fontSize: 14,
            fontWeight: 600,
            zIndex: 50,
          }}
        >
          {game.displayName}
          <span
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              width: 10,
              height: 10,
              transform: 'translateX(-50%) rotate(-45deg)',
              borderLeft: '1px solid rgba(196, 208, 218, 0.95)',
              borderBottom: '1px solid rgba(196, 208, 218, 0.95)',
              background: 'rgba(255,255,255,0.96)',
            }}
          />
        </div>
      )}
    </div>
  );
};

export const ThemeWiiU: React.FC<{ config: Config; selectedEmu: number; setSelectedEmu: (i: number) => void; onVolumeAdjust?: (delta: number) => void; onToggleMute?: () => void }> = ({ config, selectedEmu, setSelectedEmu, onVolumeAdjust, onToggleMute }) => {
  const emu = config.emulators[selectedEmu];
  const [games, setGames] = useState<GameEntry[]>([]);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [controllerActive, setControllerActive] = useState(false);
  const [focusedGameIndex, setFocusedGameIndex] = useState<number | null>(null);
  const [hoveredGameIndex, setHoveredGameIndex] = useState<number | null>(null);
  const [launchStatus, setLaunchStatus] = useState<string | null>(null);
  const [physicsTick, setPhysicsTick] = useState(0);
  const lastMouseRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const launchStatusTimerRef = useRef<number | null>(null);
  const navHoldRef = useRef<Record<'up' | 'down' | 'left' | 'right', { active: boolean; nextAt: number }>>({
    up: { active: false, nextAt: 0 },
    down: { active: false, nextAt: 0 },
    left: { active: false, nextAt: 0 },
    right: { active: false, nextAt: 0 },
  });
  const shoulderHoldRef = useRef<Record<'lb' | 'rb', { active: boolean; nextAt: number }>>({
    lb: { active: false, nextAt: 0 },
    rb: { active: false, nextAt: 0 },
  });
  const triggerHoldRef = useRef<Record<'lt' | 'rt', { active: boolean; nextAt: number }>>({
    lt: { active: false, nextAt: 0 },
    rt: { active: false, nextAt: 0 },
  });
  const volumeStickHoldRef = useRef<Record<'up' | 'down', { active: boolean; nextAt: number }>>({
    up: { active: false, nextAt: 0 },
    down: { active: false, nextAt: 0 },
  });
  const faceButtonHoldRef = useRef<{ a: boolean }>({ a: false });
  const stickButtonHoldRef = useRef<{ r3: boolean }>({ r3: false });

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const tileSize = useMemo(() => {
    const sceneWidth = Math.min(1240, viewport.width) - 36;
    const availableGridWidth = Math.max(640, sceneWidth);
    const horizontalGapTotal = 15 * (TILES_PER_ROW - 1);
    const byWidth = (availableGridWidth - horizontalGapTotal) / TILES_PER_ROW;

    const availableGridHeight = Math.max(360, viewport.height - 210);
    const verticalGapTotal = 15 * (ROWS_PER_PAGE - 1);
    const byHeight = (availableGridHeight - verticalGapTotal) / ROWS_PER_PAGE;

    const baseSize = Math.min(byWidth, byHeight);

    // Give 720p a stronger default footprint, then ramp further on larger displays.
    const baselineBoost = 1.12;
    const largeDisplayBoost = viewport.height >= 1080 || viewport.width >= 1920 ? 1.18 : 1;
    const scaledSize = baseSize * baselineBoost * largeDisplayBoost;

    return Math.max(104, Math.min(260, Math.floor(scaledSize)));
  }, [viewport.height, viewport.width]);

  useEffect(() => {
    setLoading(true);
    setCurrentPage(0);
    setFocusedGameIndex(null);
    setHoveredGameIndex(null);
    ipcRenderer.invoke('list-games', emu.name, emu.gamesDir).then((files: GameEntry[]) => {
      setGames(files);
      setLoading(false);
    });
  }, [emu.name, emu.gamesDir]);

  const totalPages = Math.max(1, Math.ceil(games.length / GAMES_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages - 1) {
      setCurrentPage(totalPages - 1);
    }
  }, [currentPage, totalPages]);

  const pagedGames = useMemo(() => {
    const startIndex = currentPage * GAMES_PER_PAGE;
    return games.slice(startIndex, startIndex + GAMES_PER_PAGE);
  }, [currentPage, games]);

  const pageStartIndex = currentPage * GAMES_PER_PAGE;
  const pageEndIndex = pageStartIndex + Math.max(0, pagedGames.length - 1);

  useEffect(() => {
    if (pagedGames.length === 0) {
      setFocusedGameIndex(null);
      return;
    }

    setFocusedGameIndex(previousFocus => {
      if (previousFocus === null || previousFocus < pageStartIndex || previousFocus > pageEndIndex) {
        return pageStartIndex;
      }

      return previousFocus;
    });
  }, [pageEndIndex, pageStartIndex, pagedGames.length]);

  useEffect(() => {
    if (controllerActive) {
      setHoveredGameIndex(focusedGameIndex);
    }
  }, [controllerActive, focusedGameIndex]);

  const changePage = useCallback((delta: number) => {
    if (games.length === 0) {
      return;
    }

    setCurrentPage(previousPage => {
      const nextPage = Math.max(0, Math.min(totalPages - 1, previousPage + delta));

      if (nextPage !== previousPage) {
        const nextFocus = nextPage * GAMES_PER_PAGE;
        setFocusedGameIndex(nextFocus);
        setHoveredGameIndex(nextFocus);
      }

      return nextPage;
    });
  }, [games.length, totalPages]);

  const moveFocus = useCallback((dx: number, dy: number) => {
    if (pagedGames.length === 0) {
      return;
    }

    const safeFocus = focusedGameIndex === null ? pageStartIndex : focusedGameIndex;
    const localIndex = Math.max(0, Math.min(pagedGames.length - 1, safeFocus - pageStartIndex));
    const rowCount = Math.max(1, Math.ceil(pagedGames.length / TILES_PER_ROW));
    const row = Math.floor(localIndex / TILES_PER_ROW);
    const col = localIndex % TILES_PER_ROW;

    let nextRow = row + dy;
    let nextCol = col + dx;

    nextRow = Math.max(0, Math.min(rowCount - 1, nextRow));
    nextCol = Math.max(0, Math.min(TILES_PER_ROW - 1, nextCol));

    let nextLocal = nextRow * TILES_PER_ROW + nextCol;

    if (nextLocal >= pagedGames.length) {
      nextLocal = pagedGames.length - 1;
    }

    const nextAbsolute = pageStartIndex + nextLocal;
    setFocusedGameIndex(nextAbsolute);
    setHoveredGameIndex(nextAbsolute);
  }, [focusedGameIndex, pageStartIndex, pagedGames.length]);

  const showLaunchStatus = useCallback((message: string) => {
    setLaunchStatus(message);

    if (launchStatusTimerRef.current !== null) {
      window.clearTimeout(launchStatusTimerRef.current);
    }

    launchStatusTimerRef.current = window.setTimeout(() => {
      setLaunchStatus(null);
      launchStatusTimerRef.current = null;
    }, 2800);
  }, []);

  const launchGameByIndex = useCallback(async (absoluteIndex: number | null) => {
    if (absoluteIndex === null || absoluteIndex < 0 || absoluteIndex >= games.length) {
      showLaunchStatus('No game selected');
      return;
    }

    const selectedGame = games[absoluteIndex];
    const gamePath = nodePath.join(emu.gamesDir, selectedGame.fileName);

    try {
      const result = await ipcRenderer.invoke('launch-game', emu.name, emu.path, gamePath);

      if (!result || !result.ok) {
        const reason = result && result.error ? result.error : 'Unknown launch failure';
        console.error('Failed to launch game:', reason);
        const attemptedArgs = result && Array.isArray(result.attemptedArgs) ? result.attemptedArgs : [];
        const detail = attemptedArgs.length > 0 ? ` Tried: ${attemptedArgs.join(' | ')}` : '';
        showLaunchStatus(`Launch failed: ${reason}${detail}`);
        return;
      }

      showLaunchStatus(`Launching ${selectedGame.displayName}...`);
    } catch (error) {
      console.error('Launch IPC failed:', error);
      showLaunchStatus('Launch failed. Restart app to reload launcher IPC.');
    }
  }, [emu.gamesDir, emu.path, games, showLaunchStatus]);

  const floatShards = useMemo(() => createRandomShards(96), []);
  const shardPhysicsRef = useRef<ShardPhysics[]>(floatShards.map(() => ({ x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0 })));

  const startPhysicsLoop = () => {
    if (animationFrameRef.current !== null) {
      return;
    }

    const tick = () => {
      let hasActiveMotion = false;

      for (const physics of shardPhysicsRef.current) {
        physics.x += physics.vx;
        physics.y += physics.vy;
        physics.r += physics.vr;

        // Medium damping so motion is visible but controlled.
        physics.vx *= 0.76;
        physics.vy *= 0.76;
        physics.vr *= 0.74;

        // Gentle spring return with a little more glide.
        physics.vx += -physics.x * 0.03;
        physics.vy += -physics.y * 0.03;
        physics.vr += -physics.r * 0.025;

        if (
          Math.abs(physics.vx) > 0.02 ||
          Math.abs(physics.vy) > 0.02 ||
          Math.abs(physics.vr) > 0.02 ||
          Math.abs(physics.x) > 0.02 ||
          Math.abs(physics.y) > 0.02 ||
          Math.abs(physics.r) > 0.02
        ) {
          hasActiveMotion = true;
        }
      }

      setPhysicsTick(current => current + 1);

      if (hasActiveMotion) {
        animationFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let rafId = 0;

    const tryRepeat = (isPressed: boolean, holdState: { active: boolean; nextAt: number }, now: number, action: () => void) => {
      if (!isPressed) {
        holdState.active = false;
        holdState.nextAt = 0;
        return;
      }

      if (!holdState.active) {
        action();
        holdState.active = true;
        holdState.nextAt = now + NAV_FIRST_REPEAT_MS;
        return;
      }

      if (now >= holdState.nextAt) {
        action();
        holdState.nextAt = now + NAV_REPEAT_MS;
      }
    };

    const triggerOnce = (isPressed: boolean, holdState: { [key: string]: boolean }, key: string, action: () => void) => {
      if (!isPressed) {
        holdState[key] = false;
        return;
      }

      if (!holdState[key]) {
        action();
        holdState[key] = true;
      }
    };

    const tick = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = Array.from(gamepads).find(candidate => candidate && candidate.connected && candidate.mapping === 'standard');

      if (pad) {
        setControllerActive(true);
        const now = performance.now();
        const axisX = pad.axes[0] || 0;
        const axisY = pad.axes[1] || 0;
        const buttons = pad.buttons;

        const pressLeft = !!buttons[14]?.pressed || axisX <= -STICK_DEADZONE;
        const pressRight = !!buttons[15]?.pressed || axisX >= STICK_DEADZONE;
        const pressUp = !!buttons[12]?.pressed || axisY <= -STICK_DEADZONE;
        const pressDown = !!buttons[13]?.pressed || axisY >= STICK_DEADZONE;
        const pressLB = !!buttons[4]?.pressed;
        const pressRB = !!buttons[5]?.pressed;
        const pressLT = !!buttons[6]?.pressed || (buttons[6]?.value || 0) > 0.4;
        const pressRT = !!buttons[7]?.pressed || (buttons[7]?.value || 0) > 0.4;
        const pressA = !!buttons[0]?.pressed;
        const pressR3 = !!buttons[11]?.pressed;
        const rightStickX = pad.axes[2] || 0;
        const volumeUp = rightStickX >= STICK_DEADZONE;
        const volumeDown = rightStickX <= -STICK_DEADZONE;

        tryRepeat(pressLeft, navHoldRef.current.left, now, () => moveFocus(-1, 0));
        tryRepeat(pressRight, navHoldRef.current.right, now, () => moveFocus(1, 0));
        tryRepeat(pressUp, navHoldRef.current.up, now, () => moveFocus(0, -1));
        tryRepeat(pressDown, navHoldRef.current.down, now, () => moveFocus(0, 1));
        tryRepeat(pressLB, shoulderHoldRef.current.lb, now, () => changePage(-1));
        tryRepeat(pressRB, shoulderHoldRef.current.rb, now, () => changePage(1));
        tryRepeat(pressLT, triggerHoldRef.current.lt, now, () => changePage(-1));
        tryRepeat(pressRT, triggerHoldRef.current.rt, now, () => changePage(1));
        tryRepeat(volumeUp, volumeStickHoldRef.current.up, now, () => {
          onVolumeAdjust?.(3);
          volumeStickHoldRef.current.up.nextAt = now + VOLUME_REPEAT_MS;
        });
        tryRepeat(volumeDown, volumeStickHoldRef.current.down, now, () => {
          onVolumeAdjust?.(-3);
          volumeStickHoldRef.current.down.nextAt = now + VOLUME_REPEAT_MS;
        });
        triggerOnce(pressA, faceButtonHoldRef.current, 'a', () => {
          launchGameByIndex(focusedGameIndex);
        });
        triggerOnce(pressR3, stickButtonHoldRef.current, 'r3', () => {
          onToggleMute?.();
        });
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [changePage, focusedGameIndex, launchGameByIndex, moveFocus, onToggleMute, onVolumeAdjust]);

  useEffect(() => {
    return () => {
      if (launchStatusTimerRef.current !== null) {
        window.clearTimeout(launchStatusTimerRef.current);
      }
    };
  }, []);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const now = performance.now();
    const previous = lastMouseRef.current;
    const dx = previous ? event.clientX - previous.x : 0;
    const dy = previous ? event.clientY - previous.y : 0;
    const dt = previous ? Math.max(1, now - previous.time) : 16;
    const speed = Math.hypot(dx, dy) / dt;

    if (speed > 0.02) {
      const mouseVelocityX = dx / dt;
      const mouseVelocityY = dy / dt;
      const velocityLength = Math.hypot(mouseVelocityX, mouseVelocityY) || 1;
      const velocityDirX = mouseVelocityX / velocityLength;
      const velocityDirY = mouseVelocityY / velocityLength;
      const viewportWidth = window.innerWidth || 1;
      const viewportHeight = window.innerHeight || 1;

      floatShards.forEach((shard, index) => {
        const physics = shardPhysicsRef.current[index];
        const centerX = (parseFloat(shard.x) / 100) * viewportWidth + physics.x;
        const centerY = (parseFloat(shard.y) / 100) * viewportHeight + physics.y;
        const distanceX = centerX - event.clientX;
        const distanceY = centerY - event.clientY;
        const distance = Math.hypot(distanceX, distanceY);
        const speedFactor = Math.min(1.6, speed * 0.65);
        const influenceRadius = 110 + speedFactor * 20;

        if (distance > influenceRadius) {
          return;
        }

        const influence = 1 - distance / influenceRadius;
        const radialX = distance > 0 ? distanceX / distance : 0;
        const radialY = distance > 0 ? distanceY / distance : 0;
        const impulse = influence * (0.16 + speedFactor * speedFactor * 0.26) * (2.4 + (index % 4) * 0.8);

        // Primary impulse follows mouse travel direction; secondary term pushes away from cursor.
        physics.vx += velocityDirX * impulse + radialX * impulse * 0.07;
        physics.vy += velocityDirY * impulse + radialY * impulse * 0.07;
        physics.vr += (velocityDirX - velocityDirY) * influence * speedFactor * 0.2;

        // Hard caps prevent any sudden bursts.
        physics.vx = Math.max(-1.7, Math.min(1.7, physics.vx));
        physics.vy = Math.max(-1.7, Math.min(1.7, physics.vy));
        physics.vr = Math.max(-0.7, Math.min(0.7, physics.vr));
      });

      startPhysicsLoop();
    }

    lastMouseRef.current = { x: event.clientX, y: event.clientY, time: now };
  };

  const handleMouseLeave = () => {
    lastMouseRef.current = null;
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(1300px 680px at 50% -28%, rgba(255,255,255,1) 0%, rgba(241,245,247,1) 50%, rgba(224,231,236,1) 100%)',
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
        color: '#3c4a5f',
      }}
    >
      <style>
        {`
          @keyframes wiiuFloat {
            0% {
              transform: translate3d(0px, 0px, 0px) rotate(var(--rot, 0deg));
            }
            25% {
              transform: translate3d(var(--tx1, 10px), var(--ty1, -8px), 0px) rotate(calc(var(--rot, 0deg) + var(--tw1, 2deg)));
            }
            52% {
              transform: translate3d(var(--tx2, -14px), var(--ty2, 12px), 0px) rotate(calc(var(--rot, 0deg) + var(--tw2, -3deg)));
            }
            78% {
              transform: translate3d(var(--tx3, 8px), var(--ty3, 6px), 0px) rotate(calc(var(--rot, 0deg) + var(--tw3, 1deg)));
            }
            100% {
              transform: translate3d(0px, 0px, 0px) rotate(var(--rot, 0deg));
            }
          }

          @keyframes wiiuBlobFloat {
            0% { transform: translate3d(0px, 0px, 0px) scale(1); }
            50% { transform: translate3d(var(--bx, 14px), var(--by, -10px), 0px) scale(1.04); }
            100% { transform: translate3d(0px, 0px, 0px) scale(1); }
          }

          @keyframes wiiuGlassSweep {
            0% { transform: translateX(-135%); opacity: 0; }
            15% { opacity: 0.45; }
            45% { opacity: 0.25; }
            100% { transform: translateX(135%); opacity: 0; }
          }

          .wiiu-float-shard {
            animation-name: wiiuFloat;
            animation-duration: var(--dur, 8s);
            animation-delay: var(--delay, 0s);
            animation-iteration-count: infinite;
            animation-timing-function: ease-in-out;
            transform-origin: center;
            will-change: transform;
          }

          .wiiu-liquid-button,
          .wiiu-liquid-control {
            overflow: visible;
          }

          .wiiu-float-blob {
            animation-name: wiiuBlobFloat;
            animation-duration: var(--bdur, 12s);
            animation-delay: var(--bdelay, 0s);
            animation-iteration-count: infinite;
            animation-timing-function: ease-in-out;
            will-change: transform;
          }

          .wiiu-liquid-control::after {
            content: '';
            position: absolute;
            top: -18%;
            left: -42%;
            width: 46%;
            height: 140%;
            background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.65) 48%, rgba(255,255,255,0) 100%);
            transform: translateX(-135%) skewX(-18deg);
            animation: wiiuGlassSweep 4.8s ease-in-out infinite;
            pointer-events: none;
          }

          .wiiu-menu-glass {
            position: relative;
            overflow: hidden;
          }

          .wiiu-menu-glass::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: inherit;
            pointer-events: none;
            background:
              linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(168,221,255,0.1) 34%, rgba(255,255,255,0) 100%),
              radial-gradient(640px 210px at 50% -10%, rgba(152,214,255,0.48) 0%, rgba(255,255,255,0) 70%);
          }

          .wiiu-menu-glass::after {
            content: '';
            position: absolute;
            top: -12%;
            left: -26%;
            width: 42%;
            height: 140%;
            border-radius: 999px;
            pointer-events: none;
            background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(180,232,255,0.64) 50%, rgba(255,255,255,0) 100%);
            transform: translateX(-145%) skewX(-18deg);
            animation: wiiuGlassSweep 5.8s ease-in-out infinite;
          }
        `}
      </style>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(620px 280px at 22% 20%, rgba(255,255,255,0.66) 0%, rgba(255,255,255,0) 72%), radial-gradient(720px 320px at 78% 72%, rgba(198,214,226,0.16) 0%, rgba(198,214,226,0) 74%)',
        }}
      />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {floatShards.map((shard, index) => (
          (() => {
            void physicsTick;
            const physics = shardPhysicsRef.current[index];
            const moveX = physics?.x || 0;
            const moveY = physics?.y || 0;
            const rotateByMouse = physics?.r || 0;

            const shapeSpecificStyle: React.CSSProperties =
              shard.shape === 'diamond'
                ? { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', borderRadius: 4 }
                : shard.shape === 'triangle'
                  ? { clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)', borderRadius: 2 }
                  : shard.shape === 'blob'
                    ? { borderRadius: '56% 44% 62% 38% / 42% 58% 46% 54%' }
                    : shard.shape === 'slab'
                      ? { borderRadius: 8 }
                      : { borderRadius: 999 };

            return (
              <div
                key={index}
                style={{
                  position: 'absolute',
                  left: shard.x,
                  top: shard.y,
                  width: shard.w,
                  height: shard.h,
                  transform: `translate3d(${moveX.toFixed(2)}px, ${moveY.toFixed(2)}px, 0px) rotate(${rotateByMouse.toFixed(2)}deg)`,
                  ['--rot' as any]: `${shard.rotate}deg`,
                  ['--dur' as any]: `${shard.dur}s`,
                  ['--delay' as any]: `${shard.delay}s`,
                  ['--tx1' as any]: `${shard.tx1}px`,
                  ['--ty1' as any]: `${shard.ty1}px`,
                  ['--tx2' as any]: `${shard.tx2}px`,
                  ['--ty2' as any]: `${shard.ty2}px`,
                  ['--tx3' as any]: `${shard.tx3}px`,
                  ['--ty3' as any]: `${shard.ty3}px`,
                  ['--tw1' as any]: `${shard.tw1}deg`,
                  ['--tw2' as any]: `${shard.tw2}deg`,
                  ['--tw3' as any]: `${shard.tw3}deg`,
                  willChange: 'transform',
                }}
              >
            <div
              className="wiiu-float-shard"
              style={{
                width: '100%',
                height: '100%',
                borderRadius: shard.radius,
                border: '1px solid rgba(172, 192, 208, 0.75)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(216,231,241,0.52) 100%)',
                boxShadow: '0 10px 18px rgba(69, 90, 111, 0.22), inset 0 1px 0 rgba(255,255,255,0.78)',
                opacity: shard.opacity,
                backdropFilter: `blur(${shard.blur}px)`,
                WebkitBackdropFilter: `blur(${shard.blur}px)`,
                ...shapeSpecificStyle,
              }}
            />
              </div>
            );
          })()
        ))}

        <div
          className="wiiu-float-blob"
          style={{
            position: 'absolute',
            left: '12%',
            top: '64%',
            width: 220,
            height: 140,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.55) 0%, rgba(217,230,240,0.08) 76%)',
            filter: 'blur(18px)',
            opacity: 0.65,
            ['--bdur' as any]: '12.8s',
            ['--bdelay' as any]: '0.2s',
            ['--bx' as any]: '16px',
            ['--by' as any]: '-10px',
          }}
        />
        <div
          className="wiiu-float-blob"
          style={{
            position: 'absolute',
            right: '8%',
            top: '26%',
            width: 250,
            height: 160,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 40%, rgba(255,255,255,0.52) 0%, rgba(209,224,236,0.06) 78%)',
            filter: 'blur(20px)',
            opacity: 0.58,
            ['--bdur' as any]: '14.6s',
            ['--bdelay' as any]: '1.1s',
            ['--bx' as any]: '-14px',
            ['--by' as any]: '12px',
          }}
        />
        <div
          className="wiiu-float-blob"
          style={{
            position: 'absolute',
            left: '42%',
            top: '14%',
            width: 190,
            height: 120,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 44% 35%, rgba(255,255,255,0.48) 0%, rgba(206,223,236,0.07) 80%)',
            filter: 'blur(17px)',
            opacity: 0.52,
            ['--bdur' as any]: '13.4s',
            ['--bdelay' as any]: '0.8s',
            ['--bx' as any]: '10px',
            ['--by' as any]: '-8px',
          }}
        />
        <div
          className="wiiu-float-blob"
          style={{
            position: 'absolute',
            left: '64%',
            top: '74%',
            width: 210,
            height: 130,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 38% 38%, rgba(255,255,255,0.44) 0%, rgba(203,220,233,0.06) 80%)',
            filter: 'blur(19px)',
            opacity: 0.48,
            ['--bdur' as any]: '15.2s',
            ['--bdelay' as any]: '1.7s',
            ['--bx' as any]: '-12px',
            ['--by' as any]: '-9px',
          }}
        />
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 1240,
          minHeight: '100vh',
          margin: '0 auto',
          padding: '72px 18px 24px',
          boxSizing: 'border-box',
          display: 'grid',
          alignContent: 'start',
        }}
      >
        {loading ? (
          <div style={{ minHeight: 420, display: 'grid', placeItems: 'center', fontWeight: 700, color: '#4c5b71' }}>
            Loading games...
          </div>
        ) : games.length === 0 ? (
          <div style={{ minHeight: 420, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No games found</div>
              <div style={{ fontSize: 13, color: '#697a90' }}>{emu.gamesDir}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', justifyItems: 'center', gap: 16 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${TILES_PER_ROW}, ${tileSize}px)`,
                justifyContent: 'center',
                alignContent: 'start',
                gap: 15,
                minHeight: 420,
                overflow: 'visible',
              }}
            >
              {pagedGames.map((game, idx) => {
                const absoluteIndex = currentPage * GAMES_PER_PAGE + idx;

                return (
                  <WiiUTile
                    key={absoluteIndex}
                    game={game}
                    tileSize={tileSize}
                    isHovered={hoveredGameIndex === absoluteIndex}
                    isFocused={focusedGameIndex === absoluteIndex}
                    onActivate={() => launchGameByIndex(absoluteIndex)}
                    onHoverStart={() => {
                      setControllerActive(false);
                      setFocusedGameIndex(absoluteIndex);
                      setHoveredGameIndex(absoluteIndex);
                    }}
                    onHoverEnd={() => setHoveredGameIndex(previousIndex => (previousIndex === absoluteIndex ? null : previousIndex))}
                  />
                );
              })}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button
                  type="button"
                  onClick={() => changePage(-1)}
                  disabled={currentPage === 0}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: '1px solid rgba(176, 189, 200, 0.85)',
                    background: currentPage === 0 ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.92)',
                    color: currentPage === 0 ? '#9ca9b8' : '#61748b',
                    fontSize: 20,
                    lineHeight: '30px',
                    cursor: currentPage === 0 ? 'default' : 'pointer',
                  }}
                >
                  ‹
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {new Array(totalPages).fill(0).map((_, pageIndex) => (
                    <button
                      key={pageIndex}
                      type="button"
                      onClick={() => {
                        const nextFocus = pageIndex * GAMES_PER_PAGE;
                        setCurrentPage(pageIndex);
                        setFocusedGameIndex(nextFocus);
                        setHoveredGameIndex(nextFocus);
                      }}
                      aria-label={`Go to page ${pageIndex + 1}`}
                      style={{
                        width: pageIndex === currentPage ? 12 : 8,
                        height: pageIndex === currentPage ? 12 : 8,
                        borderRadius: 999,
                        border: 'none',
                        background: pageIndex === currentPage ? '#00bde8' : '#aebbc7',
                        boxShadow: pageIndex === currentPage ? '0 0 0 2px rgba(0, 189, 232, 0.24)' : 'none',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => changePage(1)}
                  disabled={currentPage === totalPages - 1}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: '1px solid rgba(176, 189, 200, 0.85)',
                    background: currentPage === totalPages - 1 ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.92)',
                    color: currentPage === totalPages - 1 ? '#9ca9b8' : '#61748b',
                    fontSize: 20,
                    lineHeight: '30px',
                    cursor: currentPage === totalPages - 1 ? 'default' : 'pointer',
                  }}
                >
                  ›
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {launchStatus && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 22,
            transform: 'translateX(-50%)',
            padding: '9px 14px',
            borderRadius: 12,
            background: 'rgba(49, 63, 82, 0.88)',
            color: '#f2f6fa',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 8px 18px rgba(20, 31, 46, 0.32)',
            zIndex: 120,
            pointerEvents: 'none',
          }}
        >
          {launchStatus}
        </div>
      )}
    </div>
  );
};
