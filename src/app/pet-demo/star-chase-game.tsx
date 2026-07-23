'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight, Play, RotateCcw, Sparkles, Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PetSoundCue } from './pet-audio';
import styles from './pet-demo.module.css';

type GameStatus = 'ready' | 'playing' | 'finished';

type FallingStar = {
  id: number;
  x: number;
  y: number;
  speed: number;
  spin: number;
  size: number;
};

type StarChaseGameProps = {
  bestScore: number;
  dailyBestScore: number;
  dailyGameAttempts: number;
  rewardAvailable: boolean;
  petId: string;
  petName: string;
  onSound: (cue: PetSoundCue) => void;
  onFinish: (score: number) => void;
};

const RUN_FRAMES = Array.from(
  { length: 8 },
  (_, index) => `/images/pet-demo/full-frames-v5/run-${String(index + 1).padStart(2, '0')}.png`,
);

const GAME_SECONDS = 20;
const STAR_VISUAL_RADIUS_RATIO = 0.42;
const BASKET_RIM_ALLOWANCE = { horizontal: 4, top: 6 };
const HEAD_BASKET_BY_PET: Record<string, { width: number; height: number; offsetX: number; centerY: number }> = {
  'star-cat': { width: 56, height: 27, offsetX: 10, centerY: 64 },
  'cloud-rabbit': { width: 60, height: 27, offsetX: 9, centerY: 57 },
  'forest-fox': { width: 60, height: 27, offsetX: 8, centerY: 63 },
  'ocean-dragon': { width: 64, height: 28, offsetX: 9, centerY: 63 },
};

export default function StarChaseGame({ bestScore, dailyBestScore, dailyGameAttempts, rewardAvailable, petId, petName, onSound, onFinish }: StarChaseGameProps) {
  const [status, setStatus] = useState<GameStatus>('ready');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [playerX, setPlayerX] = useState(50);
  const [facingDirection, setFacingDirection] = useState<-1 | 1>(1);
  const [runFrame, setRunFrame] = useState(0);
  const [stars, setStars] = useState<FallingStar[]>([]);
  const [lastReward, setLastReward] = useState(0);
  const [catchPulse, setCatchPulse] = useState(0);
  const catchConfig = HEAD_BASKET_BY_PET[petId] ?? HEAD_BASKET_BY_PET['star-cat'];
  const catchZoneX = Math.max(4, Math.min(96, playerX + facingDirection * catchConfig.offsetX));
  const runFrames = useMemo(() => petId === 'star-cat'
    ? RUN_FRAMES
    : Array.from({ length: 8 }, (_, index) => `/images/pet-demo/pet-frames/${petId}/run-${String(index + 1).padStart(2, '0')}.png`), [petId]);

  const playerXRef = useRef(50);
  const directionRef = useRef<-1 | 0 | 1>(0);
  const facingDirectionRef = useRef<-1 | 1>(1);
  const arenaRef = useRef<HTMLDivElement>(null);
  const arenaSizeRef = useRef({ width: 360, height: 405 });
  const scoreRef = useRef(0);
  const onFinishRef = useRef(onFinish);
  const onSoundRef = useRef(onSound);
  const starIdRef = useRef(0);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    onSoundRef.current = onSound;
  }, [onSound]);

  const setMoveDirection = (nextDirection: -1 | 0 | 1) => {
    directionRef.current = nextDirection;
    if (nextDirection !== 0) {
      facingDirectionRef.current = nextDirection;
      setFacingDirection(nextDirection);
    }
  };

  const nudgePlayer = (stepDirection: -1 | 1) => {
    if (status !== 'playing') return;
    const nextX = Math.max(8, Math.min(92, playerXRef.current + stepDirection * 9));
    playerXRef.current = nextX;
    setPlayerX(nextX);
    setRunFrame((current) => (current + 1) % runFrames.length);
  };

  const startGame = () => {
    scoreRef.current = 0;
    playerXRef.current = 50;
    directionRef.current = 0;
    facingDirectionRef.current = 1;
    setScore(0);
    setTimeLeft(GAME_SECONDS);
    setPlayerX(50);
    setFacingDirection(1);
    setRunFrame(0);
    setStars([]);
    setLastReward(0);
    setStatus('playing');
    onSoundRef.current('gameStart');
  };

  useEffect(() => {
    const arena = arenaRef.current;
    if (!arena) return;

    const updateArenaSize = () => {
      arenaSizeRef.current = {
        width: arena.clientWidth || 360,
        height: arena.clientHeight || 405,
      };
    };

    updateArenaSize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateArenaSize);
      return () => window.removeEventListener('resize', updateArenaSize);
    }
    const resizeObserver = new ResizeObserver(updateArenaSize);
    resizeObserver.observe(arena);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (status !== 'playing') return;
      if (event.key === 'ArrowLeft') setMoveDirection(-1);
      if (event.key === 'ArrowRight') setMoveDirection(1);
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setMoveDirection(0);
    };

    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'playing') return;

    const endAt = Date.now() + GAME_SECONDS * 1000;
    let frameTicks = 0;
    let finished = false;

    const spawnTimer = window.setInterval(() => {
      starIdRef.current += 1;
      setStars((current) => [
        ...current,
        {
          id: starIdRef.current,
          x: 8 + Math.random() * 84,
          y: -8,
          speed: 1.4 + Math.random() * 1.05,
          spin: Math.random() * 40 - 20,
          size: 16 + Math.random() * 10,
        },
      ]);
    }, 610);

    const physicsTimer = window.setInterval(() => {
      if (directionRef.current !== 0) {
        const nextX = Math.max(8, Math.min(92, playerXRef.current + directionRef.current * 2.25));
        playerXRef.current = nextX;
        setPlayerX(nextX);
        frameTicks += 1;
        if (frameTicks % 2 === 0) setRunFrame((current) => (current + 1) % runFrames.length);
      }

      let caught = 0;
      setStars((current) => current.flatMap((star) => {
        const nextY = star.y + star.speed;
        const targetX = Math.max(4, Math.min(96, playerXRef.current + facingDirectionRef.current * catchConfig.offsetX));
        const deltaX = (star.x - targetX) / 100 * arenaSizeRef.current.width;
        const deltaY = (nextY - catchConfig.centerY) / 100 * arenaSizeRef.current.height;
        const basketHalfWidth = catchConfig.width / 2;
        const basketHalfHeight = catchConfig.height / 2;
        const starVisualRadius = star.size * STAR_VISUAL_RADIUS_RATIO;
        const isCaught = Math.abs(deltaX) <= basketHalfWidth + BASKET_RIM_ALLOWANCE.horizontal + starVisualRadius
          && deltaY >= -basketHalfHeight - BASKET_RIM_ALLOWANCE.top - starVisualRadius
          && deltaY <= basketHalfHeight + starVisualRadius;
        if (isCaught) {
          caught += 1;
          return [];
        }
        if (nextY > 106) return [];
        return [{ ...star, y: nextY, spin: star.spin + 7 }];
      }));

      if (caught > 0) {
        scoreRef.current += caught;
        setScore(scoreRef.current);
        setCatchPulse((current) => current + 1);
        onSoundRef.current('starCatch');
        if (navigator.vibrate) navigator.vibrate(12);
      }
    }, 50);

    const clockTimer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && !finished) {
        finished = true;
        const reward = rewardAvailable ? Math.max(0, scoreRef.current - dailyBestScore) : 0;
        setLastReward(reward);
        setMoveDirection(0);
        setStatus('finished');
        onSoundRef.current(scoreRef.current > 0 ? 'success' : 'crash');
        onFinishRef.current(scoreRef.current);
      }
    }, 100);

    return () => {
      window.clearInterval(spawnTimer);
      window.clearInterval(physicsTimer);
      window.clearInterval(clockTimer);
    };
  }, [status, dailyBestScore, rewardAvailable, runFrames, catchConfig]);

  return (
    <section className={styles.gamePanel} aria-labelledby="game-title">
      <header className={styles.gameHeader}>
        <div><span>STAR CHASE</span><h2 id="game-title">追星星</h2></div>
        <div className={styles.gameStats}>
          <span><Star size={14} fill="currentColor" /> {score}</span>
          <span>⏱ {timeLeft}</span>
        </div>
      </header>

      <div ref={arenaRef} className={styles.gameArena}>
        <span className={styles.gameMoon} aria-hidden="true" />
        <span className={styles.gameCloudOne} aria-hidden="true" />
        <span className={styles.gameCloudTwo} aria-hidden="true" />
        <span className={styles.gameSkyStars} aria-hidden="true">✦　·　✧　·　✦　·　✧</span>

        {stars.map((star) => (
          <span
            key={star.id}
            className={styles.fallingStar}
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              transform: `translate(-50%, -50%) rotate(${star.spin}deg)`,
            }}
            aria-hidden="true"
          >★</span>
        ))}

        <span className={styles.gameGround} aria-hidden="true" />
        <div
          className={styles.gameCatchZone}
          style={{
            left: `${catchZoneX}%`,
            top: `${catchConfig.centerY}%`,
            width: catchConfig.width,
            height: catchConfig.height,
          }}
          data-pet={petId}
          data-catch-zone="true"
          aria-hidden="true"
        >
          <span className={styles.gameCatchAura} />
          {catchPulse > 0 && (
            <span key={`catch-${catchPulse}`} className={styles.gameCatchBurst}>
              <span>+1</span>
            </span>
          )}
        </div>
        <div
          className={`${styles.gamePet} ${facingDirection < 0 ? styles.gamePetLeft : ''} ${catchPulse % 2 ? styles.gamePetCatch : ''}`}
          style={{ left: `${playerX}%` }}
          data-pet={petId}
          aria-label={`正在追星星的${petName}`}
        >
          {runFrames.map((src, index) => (
              <Image
                key={src}
                src={src}
                alt={index === runFrame ? `向星星奔跑的${petName}` : ''}
                fill
                priority
                sizes="150px"
                className={`${styles.gamePetFrame} ${index === runFrame ? styles.gamePetFrameActive : ''}`}
              />
            ))}
        </div>

        {status === 'ready' && (
          <div className={styles.gameOverlay}>
            <span className={styles.overlayStar}>⭐</span>
            <h3>左右移動，接住星星！</h3>
            <p>讓星星掉進寵物頭上的發光籃子，就會獲得 1 分！</p>
            <button type="button" onClick={startGame}><Play size={17} fill="currentColor" /> 開始遊戲</button>
          </div>
        )}

        {status === 'finished' && (
          <div className={styles.gameOverlay}>
            <span className={styles.overlayStar}>{score >= 8 ? '🌟' : '⭐'}</span>
            <h3>{score >= 8 ? '追星高手！' : '完成挑戰！'}</h3>
            <p>接到 {score} 顆星星{rewardAvailable ? (lastReward > 0 ? `，新增 ${lastReward} 星幣。` : `，今天最高分仍是 ${dailyBestScore}。`) : '，今天前三次已記入。'}</p>
            <button type="button" onClick={startGame}><RotateCcw size={16} /> 再玩一次</button>
          </div>
        )}
      </div>

      <div className={styles.gameControls}>
        <button
          type="button"
          disabled={status !== 'playing'}
          onClick={() => nudgePlayer(-1)}
          onPointerDown={() => setMoveDirection(-1)}
          onPointerUp={() => setMoveDirection(0)}
          onPointerCancel={() => setMoveDirection(0)}
          onPointerLeave={() => setMoveDirection(0)}
          aria-label="向左跑"
        ><ChevronLeft size={28} /></button>
        <div>
          <Sparkles size={15} />
          <span>最高紀錄</span>
          <strong>{Math.max(bestScore, score)}</strong>
        </div>
        <button
          type="button"
          disabled={status !== 'playing'}
          onClick={() => nudgePlayer(1)}
          onPointerDown={() => setMoveDirection(1)}
          onPointerUp={() => setMoveDirection(0)}
          onPointerCancel={() => setMoveDirection(0)}
          onPointerLeave={() => setMoveDirection(0)}
          aria-label="向右跑"
        ><ChevronRight size={28} /></button>
      </div>

      <p className={styles.gameRewardNote}>
        {rewardAvailable ? `今日已記入 ${Math.min(3, dailyGameAttempts)}/3 次，成績會挑戰最高分` : '今日前三次已記入，仍可繼續挑戰個人紀錄'}
      </p>
    </section>
  );
}
