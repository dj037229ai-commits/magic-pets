'use client';

import Image from 'next/image';
import { Flag, Play, RotateCcw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PetSoundCue } from './pet-audio';
import styles from './pet-demo.module.css';

type GameStatus = 'ready' | 'playing' | 'finished';
type FinishReason = 'crash' | 'finish';
type ObstacleKind = 'crystal' | 'mushroom' | 'stump' | 'thorn';

type Obstacle = {
  id: number;
  x: number;
  width: number;
  height: number;
  kind: ObstacleKind;
  icon: string;
  passed: boolean;
};

type ObstacleHopGameProps = {
  bestDistance: number;
  dailyBestScore: number;
  dailyGameAttempts: number;
  rewardAvailable: boolean;
  petId: string;
  petName: string;
  onSound: (cue: PetSoundCue) => void;
  onFinish: (distance: number, cleared: number) => void;
};

const GAME_SECONDS = 25;
const MAX_CHARGE_MS = 900;
const MIN_JUMP_SPEED = 455;
const MAX_JUMP_SPEED = 735;
const GRAVITY = 1560;
const GROUND_OFFSET = 55;
const PLAYER_X_RATIO = 0.22;
const PLAYER_HITBOX = { width: 43, height: 54 };

const OBSTACLE_KINDS: Record<ObstacleKind, { width: number; height: number; icon: string }> = {
  crystal: { width: 31, height: 46, icon: '◆' },
  mushroom: { width: 38, height: 38, icon: '●' },
  stump: { width: 43, height: 48, icon: '▰' },
  thorn: { width: 48, height: 31, icon: '▲' },
};

const PET_SIZES: Record<string, { width: number; height: number }> = {
  'star-cat': { width: 126, height: 114 },
  'cloud-rabbit': { width: 134, height: 124 },
  'forest-fox': { width: 154, height: 132 },
  'ocean-dragon': { width: 140, height: 126 },
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export default function ObstacleHopGame({ bestDistance, dailyBestScore, dailyGameAttempts, rewardAvailable, petId, petName, onSound, onFinish }: ObstacleHopGameProps) {
  const [status, setStatus] = useState<GameStatus>('ready');
  const [finishReason, setFinishReason] = useState<FinishReason>('crash');
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [distance, setDistance] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [lastReward, setLastReward] = useState(0);
  const [jumpY, setJumpY] = useState(0);
  const [charge, setCharge] = useState(0);
  const [isCharging, setIsCharging] = useState(false);
  const [isAirborne, setIsAirborne] = useState(false);
  const [runFrame, setRunFrame] = useState(0);
  const [worldOffset, setWorldOffset] = useState(0);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);

  const arenaRef = useRef<HTMLDivElement>(null);
  const arenaSizeRef = useRef({ width: 360, height: 350 });
  const obstaclesRef = useRef<Obstacle[]>([]);
  const obstacleIdRef = useRef(0);
  const spawnDistanceRef = useRef(230);
  const jumpYRef = useRef(0);
  const velocityRef = useRef(0);
  const airborneRef = useRef(false);
  const chargingRef = useRef(false);
  const chargeStartedAtRef = useRef(0);
  const distanceRef = useRef(0);
  const clearedRef = useRef(0);
  const worldOffsetRef = useRef(0);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const onSoundRef = useRef(onSound);

  const runFrames = useMemo(() => petId === 'star-cat'
    ? Array.from({ length: 8 }, (_, index) => `/images/pet-demo/full-frames-v5/run-${String(index + 1).padStart(2, '0')}.png`)
    : Array.from({ length: 8 }, (_, index) => `/images/pet-demo/pet-frames/${petId}/run-${String(index + 1).padStart(2, '0')}.png`), [petId]);
  const petSize = PET_SIZES[petId] ?? PET_SIZES['star-cat'];

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    onSoundRef.current = onSound;
  }, [onSound]);

  useEffect(() => {
    const arena = arenaRef.current;
    if (!arena) return;
    const updateSize = () => {
      arenaSizeRef.current = { width: arena.clientWidth || 360, height: arena.clientHeight || 350 };
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(arena);
    return () => observer.disconnect();
  }, []);

  const launchJump = useCallback(() => {
    if (!chargingRef.current || airborneRef.current) return;
    const heldFor = Date.now() - chargeStartedAtRef.current;
    const power = clamp(heldFor / MAX_CHARGE_MS, 0.12, 1);
    velocityRef.current = MIN_JUMP_SPEED + (MAX_JUMP_SPEED - MIN_JUMP_SPEED) * power;
    airborneRef.current = true;
    chargingRef.current = false;
    setCharge(power);
    setIsCharging(false);
    setIsAirborne(true);
    onSoundRef.current('jump');
    if (navigator.vibrate) navigator.vibrate(Math.round(10 + power * 18));
  }, []);

  const beginCharge = useCallback(() => {
    if (status !== 'playing' || airborneRef.current || chargingRef.current) return;
    chargingRef.current = true;
    chargeStartedAtRef.current = Date.now();
    setCharge(0.12);
    setIsCharging(true);
  }, [status]);

  const startGame = () => {
    finishedRef.current = false;
    chargingRef.current = false;
    airborneRef.current = false;
    jumpYRef.current = 0;
    velocityRef.current = 0;
    distanceRef.current = 0;
    clearedRef.current = 0;
    worldOffsetRef.current = 0;
    obstaclesRef.current = [];
    obstacleIdRef.current = 0;
    spawnDistanceRef.current = 360;
    setStatus('playing');
    setTimeLeft(GAME_SECONDS);
    setDistance(0);
    setCleared(0);
    setLastReward(0);
    setJumpY(0);
    setCharge(0);
    setIsCharging(false);
    setIsAirborne(false);
    setRunFrame(0);
    setWorldOffset(0);
    setObstacles([]);
    onSoundRef.current('gameStart');
  };

  useEffect(() => {
    if (status !== 'playing') return;

    const startedAt = Date.now();
    let lastTick = performance.now();
    let renderElapsed = 0;
    let runElapsed = 0;
    let animationFrame = 0;

    const finishRun = (reason: FinishReason) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      chargingRef.current = false;
      setIsCharging(false);
      setFinishReason(reason);
      setStatus('finished');
      const finalDistance = distanceRef.current;
      const finalCleared = clearedRef.current;
      const reward = rewardAvailable ? Math.max(0, finalCleared - dailyBestScore) : 0;
      setLastReward(reward);
      onFinishRef.current(finalDistance, finalCleared);
      onSoundRef.current(reason === 'crash' ? 'crash' : 'success');
      if (navigator.vibrate) navigator.vibrate(reason === 'crash' ? [45, 35, 70] : [20, 35, 20]);
    };

    const tick = (now: number) => {
      const delta = Math.min(0.04, Math.max(0.001, (now - lastTick) / 1000));
      lastTick = now;
      renderElapsed += delta;
      runElapsed += delta;

      if (chargingRef.current) {
        const power = clamp((Date.now() - chargeStartedAtRef.current) / MAX_CHARGE_MS, 0.12, 1);
        setCharge(power);
        if (power >= 1) launchJump();
      }

      if (airborneRef.current) {
        velocityRef.current -= GRAVITY * delta;
        jumpYRef.current += velocityRef.current * delta;
        if (jumpYRef.current <= 0) {
          jumpYRef.current = 0;
          velocityRef.current = 0;
          airborneRef.current = false;
          setIsAirborne(false);
          setCharge(0);
        }
      }

      const speed = 178 + Math.min(68, distanceRef.current * 0.42);
      worldOffsetRef.current += speed * delta;
      distanceRef.current = Math.floor(worldOffsetRef.current / 19);
      spawnDistanceRef.current -= speed * delta;

      let nextObstacles = obstaclesRef.current.map((obstacle) => ({ ...obstacle, x: obstacle.x - speed * delta }));
      const playerX = arenaSizeRef.current.width * PLAYER_X_RATIO;
      const playerLeft = playerX - PLAYER_HITBOX.width / 2;
      const playerRight = playerX + PLAYER_HITBOX.width / 2;
      const groundY = arenaSizeRef.current.height - GROUND_OFFSET;
      const playerBottom = groundY - jumpYRef.current - 5;
      const playerTop = playerBottom - PLAYER_HITBOX.height;

      for (const obstacle of nextObstacles) {
        if (!obstacle.passed && obstacle.x + obstacle.width < playerLeft) {
          obstacle.passed = true;
          clearedRef.current += 1;
          onSoundRef.current('obstaclePass');
        }
        const horizontalHit = playerRight - 7 > obstacle.x && playerLeft + 7 < obstacle.x + obstacle.width;
        const obstacleTop = groundY - obstacle.height;
        const verticalHit = playerBottom > obstacleTop + 5 && playerTop < groundY - 3;
        if (horizontalHit && verticalHit) {
          obstaclesRef.current = nextObstacles;
          setObstacles(nextObstacles);
          finishRun('crash');
          return;
        }
      }

      nextObstacles = nextObstacles.filter((obstacle) => obstacle.x + obstacle.width > -45);

      if (spawnDistanceRef.current <= 0) {
        const kinds = Object.keys(OBSTACLE_KINDS) as ObstacleKind[];
        const createObstacle = (x: number): Obstacle => {
          const kind = kinds[Math.floor(Math.random() * kinds.length)] ?? 'crystal';
          const definition = OBSTACLE_KINDS[kind];
          obstacleIdRef.current += 1;
          return { id: obstacleIdRef.current, x, kind, ...definition, passed: false };
        };
        const firstX = arenaSizeRef.current.width + 35;
        nextObstacles.push(createObstacle(firstX));
        const paired = Math.random() < 0.38;
        if (paired) nextObstacles.push(createObstacle(firstX + 150 + Math.random() * 40));
        spawnDistanceRef.current = paired ? 430 + Math.random() * 90 : 285 + Math.random() * 135;
      }

      obstaclesRef.current = nextObstacles;
      const remaining = Math.max(0, Math.ceil((startedAt + GAME_SECONDS * 1000 - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        finishRun('finish');
        return;
      }

      if (renderElapsed >= 1 / 30) {
        renderElapsed = 0;
        setJumpY(jumpYRef.current);
        setDistance(distanceRef.current);
        setCleared(clearedRef.current);
        setWorldOffset(worldOffsetRef.current);
        setObstacles(nextObstacles);
      }

      if (!airborneRef.current && !chargingRef.current && runElapsed >= 0.095) {
        runElapsed = 0;
        setRunFrame((current) => (current + 1) % runFrames.length);
      }

      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [dailyBestScore, launchJump, rewardAvailable, runFrames, status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      event.preventDefault();
      beginCharge();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      launchJump();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [beginCharge, launchJump]);

  const jumpState = isCharging ? 'charging' : isAirborne ? 'airborne' : 'running';

  return (
    <section className={styles.jumpGamePanel} aria-labelledby="jump-game-title">
      <header className={styles.gameHeader}>
        <div><span>STAR TRAIL</span><h2 id="jump-game-title">星野跳跳</h2></div>
        <div className={styles.jumpGameStats}><span><Flag size={13} /> {distance}m</span><span>⏱ {timeLeft}</span></div>
      </header>

      <div ref={arenaRef} className={styles.jumpArena} data-status={status}>
        <div className={styles.jumpSkyGlow} aria-hidden="true" />
        <div className={styles.jumpCloudLayer} style={{ '--scroll-x': `${-worldOffset * 0.12}px` } as React.CSSProperties} aria-hidden="true" />
        <div className={styles.jumpHillLayer} style={{ '--scroll-x': `${-worldOffset * 0.28}px` } as React.CSSProperties} aria-hidden="true" />
        <div className={styles.jumpTreeLayer} style={{ '--scroll-x': `${-worldOffset * 0.58}px` } as React.CSSProperties} aria-hidden="true" />
        <div className={styles.jumpGround} style={{ '--scroll-x': `${-worldOffset}px` } as React.CSSProperties} aria-hidden="true" />

        {obstacles.map((obstacle) => (
          <span
            key={obstacle.id}
            className={styles.jumpObstacle}
            data-kind={obstacle.kind}
            style={{ left: obstacle.x, width: obstacle.width, height: obstacle.height }}
            aria-label={`${obstacle.kind}障礙物`}
          ><i>{obstacle.icon}</i></span>
        ))}

        <div
          className={styles.jumpPet}
          data-pet={petId}
          data-jump-state={jumpState}
          style={{ bottom: GROUND_OFFSET - 5 + jumpY, width: petSize.width, height: petSize.height }}
          aria-label={`${petName}${isAirborne ? '正在跳躍' : isCharging ? '正在蓄力' : '正在奔跑'}`}
        >
          <span className={styles.jumpPetShadow} aria-hidden="true" />
          {runFrames.map((src, index) => (
            <Image
              key={src}
              src={src}
              alt={index === runFrame ? `${petName}向右奔跑` : ''}
              fill
              priority
              sizes="150px"
              className={`${styles.jumpPetFrame} ${index === runFrame ? styles.jumpPetFrameActive : ''}`}
            />
          ))}
        </div>

        <div className={styles.jumpClearedBadge}><Sparkles size={12} /> 跳過 {cleared}</div>

        {status === 'ready' && (
          <div className={styles.gameOverlay}>
            <span className={styles.overlayStar}>🐾</span>
            <h3>按住蓄力，放開起跳！</h3>
            <p>短按跳得低又快；長按跳得高，但可能落在下一個障礙前。</p>
            <button type="button" onClick={startGame}><Play size={17} fill="currentColor" /> 開始遊戲</button>
          </div>
        )}

        {status === 'finished' && (
          <div className={styles.gameOverlay}>
            <span className={styles.overlayStar}>{finishReason === 'finish' ? '🏁' : '💫'}</span>
            <h3>{finishReason === 'finish' ? '跑到終點了！' : '碰到障礙了！'}</h3>
            <p>前進 {distance} 公尺、跳過 {cleared} 個障礙{rewardAvailable ? (lastReward > 0 ? `，新增 ${lastReward} 星幣。` : `，今天最高分仍是 ${dailyBestScore}。`) : '，今天前三次已記入。'}</p>
            <button type="button" onClick={startGame}><RotateCcw size={16} /> 再跑一次</button>
          </div>
        )}
      </div>

      <div className={styles.jumpControlArea}>
        <div className={styles.jumpChargeMeter} aria-label={`跳躍蓄力 ${Math.round(charge * 100)}%`}>
          <span><i style={{ width: `${charge * 100}%` }} /></span>
          <small>{charge < 0.45 ? '低跳' : charge < 0.78 ? '中跳' : '高跳'}</small>
        </div>
        <button
          type="button"
          disabled={status !== 'playing' || isAirborne}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            beginCharge();
          }}
          onPointerUp={launchJump}
          onPointerCancel={launchJump}
          aria-label="按住蓄力，放開跳躍"
        >
          {isCharging ? '蓄力中…放開起跳！' : isAirborne ? '跳躍中' : '按住蓄力・放開跳躍'}
        </button>
        <div className={styles.jumpBestScore}><span>最佳距離</span><strong>{Math.max(bestDistance, distance)}m</strong></div>
      </div>

      <p className={styles.gameRewardNote}>{rewardAvailable ? `今日已記入 ${Math.min(3, dailyGameAttempts)}/3 次，跳過每個障礙可累積最高分` : '今日前三次已記入，仍可挑戰最遠紀錄'}</p>
    </section>
  );
}
