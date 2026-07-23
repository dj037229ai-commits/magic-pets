'use client';

import Image from 'next/image';
import { Cloud, Play, RotateCcw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PetSoundCue } from './pet-audio';
import styles from './pet-demo.module.css';

type GameStatus = 'ready' | 'playing' | 'finished';
type FinishReason = 'ceiling' | 'parachute';
type CloudVariant = 'normal' | 'pass' | 'bounce';
type MotionState = 'falling' | 'landed' | 'bouncing' | 'parachuting';

type CloudPlatform = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  variant: CloudVariant;
};

type CloudLayout = {
  platforms: CloudPlatform[];
  nextId: number;
};

type CloudHopGameProps = {
  bestScore: number;
  dailyBestScore: number;
  dailyGameAttempts: number;
  rewardAvailable: boolean;
  petId: string;
  petName: string;
  onSound: (cue: PetSoundCue) => void;
  onFinish: (score: number) => void;
};

const CLOUD_RISE_BASE = 20;
const CLOUD_RISE_ACCELERATION = 1.45;
const CLOUD_RISE_MAX = 84;
const CLOUD_SIZE_SCALE = .7;
const GRAVITY = 1040;
const MOVE_SPEED = 224;
const BOUNCE_SPEED = 525;
const PARACHUTE_SPEED = 112;
const PLATFORM_HEIGHT = 30;
const PET_HITBOX = { width: 48, height: 54 };

const PET_SIZES: Record<string, { width: number; height: number }> = {
  'star-cat': { width: 128, height: 116 },
  'cloud-rabbit': { width: 136, height: 125 },
  'forest-fox': { width: 154, height: 132 },
  'ocean-dragon': { width: 142, height: 128 },
};

const petFrameFor = (petId: string) => petId === 'star-cat'
  ? '/images/pet-demo/full-frames-v5/idle-01.png'
  : `/images/pet-demo/pet-frames/${petId}/idle-01.png`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const platformVariantFor = (index: number): CloudVariant => {
  if (index > 0 && index % 6 === 0) return 'bounce';
  if (index > 1 && index % 4 === 0) return 'pass';
  return 'normal';
};

const createPlatform = (id: number, x: number, y: number, width: number, variant: CloudVariant): CloudPlatform => ({
  id,
  x,
  y,
  width,
  height: PLATFORM_HEIGHT,
  variant,
});

const createInitialLayout = (height: number): CloudLayout => {
  const safeHeight = Math.max(360, height || 380);
  const platforms: CloudPlatform[] = [];
  let nextId = 0;
  let previousX = 50;
  let previousY = safeHeight * .58;

  platforms.push(createPlatform(nextId++, previousX, previousY, 122, 'normal'));

  for (let index = 1; index < 8; index += 1) {
    previousY += 76 + Math.random() * 30;
    previousX = clamp(previousX + (Math.random() - .5) * 58, 17, 83);
    const width = 96 + Math.round(Math.random() * 28);
    const variant = index === 1 ? 'normal' : platformVariantFor(index);
    platforms.push(createPlatform(nextId++, previousX, previousY, width, variant));
  }

  return { platforms, nextId };
};

const getPlatformBounds = (platform: CloudPlatform, arenaWidth: number) => {
  const center = platform.x / 100 * arenaWidth;
  const visualWidth = platform.width * CLOUD_SIZE_SCALE;
  return { left: center - visualWidth / 2, right: center + visualWidth / 2 };
};

const getPlatformSurfaceY = (platform: CloudPlatform) => platform.y + platform.height * (1 - CLOUD_SIZE_SCALE);

const overlapsPlatform = (playerX: number, platform: CloudPlatform, arenaWidth: number) => {
  const bounds = getPlatformBounds(platform, arenaWidth);
  const playerLeft = playerX - PET_HITBOX.width / 2;
  const playerRight = playerX + PET_HITBOX.width / 2;
  return playerRight - 8 > bounds.left && playerLeft + 8 < bounds.right;
};

export default function CloudHopGame({ bestScore, dailyBestScore, dailyGameAttempts, rewardAvailable, petId, petName, onSound, onFinish }: CloudHopGameProps) {
  const [initialLayout] = useState<CloudLayout>(() => createInitialLayout(380));
  const [status, setStatus] = useState<GameStatus>('ready');
  const [finishReason, setFinishReason] = useState<FinishReason>('parachute');
  const [score, setScore] = useState(0);
  const [playerX, setPlayerX] = useState(180);
  const [playerY, setPlayerY] = useState(50);
  const [platforms, setPlatforms] = useState<CloudPlatform[]>(initialLayout.platforms);
  const [motionState, setMotionState] = useState<MotionState>('falling');
  const [scoredCloudIds, setScoredCloudIds] = useState<Set<number>>(() => new Set());
  const [lastReward, setLastReward] = useState(0);
  const [landingPulse, setLandingPulse] = useState(0);

  const arenaRef = useRef<HTMLDivElement>(null);
  const arenaSizeRef = useRef({ width: 360, height: 380 });
  const platformsRef = useRef<CloudPlatform[]>(initialLayout.platforms);
  const nextPlatformIdRef = useRef(initialLayout.nextId);
  const playerXRef = useRef(180);
  const playerYRef = useRef(50);
  const velocityYRef = useRef(0);
  const currentPlatformRef = useRef<number | null>(null);
  const movingDirectionRef = useRef<-1 | 0 | 1>(0);
  const motionStateRef = useRef<MotionState>('falling');
  const parachutingRef = useRef(false);
  const finishedRef = useRef(false);
  const scoreRef = useRef(0);
  const gameElapsedRef = useRef(0);
  const scoredCloudIdsRef = useRef<Set<number>>(new Set());
  const onFinishRef = useRef(onFinish);
  const onSoundRef = useRef(onSound);
  const petSize = PET_SIZES[petId] ?? PET_SIZES['star-cat'];
  const petFrame = useMemo(() => petFrameFor(petId), [petId]);

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
      arenaSizeRef.current = {
        width: arena.clientWidth || 360,
        height: arena.clientHeight || 380,
      };
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

  const movePlayer = useCallback((direction: -1 | 0 | 1) => {
    if (status !== 'playing') return;
    movingDirectionRef.current = direction;
  }, [status]);

  const startGame = () => {
    const layout = createInitialLayout(arenaSizeRef.current.height);
    const firstCloud = layout.platforms[0];
    const startX = arenaSizeRef.current.width * .5;
    const startY = Math.max(18, (firstCloud?.y ?? arenaSizeRef.current.height * .58) - petSize.height - 62);

    finishedRef.current = false;
    scoreRef.current = 0;
    gameElapsedRef.current = 0;
    playerXRef.current = startX;
    playerYRef.current = startY;
    velocityYRef.current = 48;
    currentPlatformRef.current = null;
    movingDirectionRef.current = 0;
    motionStateRef.current = 'falling';
    parachutingRef.current = false;
    nextPlatformIdRef.current = layout.nextId;
    scoredCloudIdsRef.current = new Set();
    platformsRef.current = layout.platforms;
    setPlatforms(layout.platforms);
    setScore(0);
    setPlayerX(startX);
    setPlayerY(startY);
    setMotionState('falling');
    setScoredCloudIds(new Set());
    setLastReward(0);
    setLandingPulse(0);
    setStatus('playing');
    onSoundRef.current('gameStart');
  };

  useEffect(() => {
    if (status !== 'playing') return;

    let lastTick = performance.now();
    let renderElapsed = 0;
    let animationFrame = 0;

    const setMotion = (nextState: MotionState) => {
      if (motionStateRef.current === nextState) return;
      motionStateRef.current = nextState;
      setMotionState(nextState);
    };

    const finishGame = (reason: FinishReason) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      movingDirectionRef.current = 0;
      parachutingRef.current = false;
      currentPlatformRef.current = null;
      setMotion('landed');
      setFinishReason(reason);
      setStatus('finished');
      const finalScore = scoreRef.current;
      const reward = rewardAvailable ? Math.max(0, finalScore - dailyBestScore) : 0;
      setLastReward(reward);
      onFinishRef.current(finalScore);
      onSoundRef.current(reason === 'ceiling' ? 'crash' : finalScore > 0 ? 'success' : 'crash');
      if (navigator.vibrate) navigator.vibrate(finalScore > 0 ? [20, 30, 20] : [45, 30, 60]);
    };

    const openParachute = () => {
      if (parachutingRef.current || finishedRef.current) return;
      parachutingRef.current = true;
      currentPlatformRef.current = null;
      velocityYRef.current = 0;
      playerYRef.current = -petSize.height - 56;
      setMotion('parachuting');
      onSoundRef.current('wake');
    };

    const addScoreFor = (platform: CloudPlatform) => {
      if (scoredCloudIdsRef.current.has(platform.id)) return;
      scoredCloudIdsRef.current.add(platform.id);
      setScoredCloudIds(new Set(scoredCloudIdsRef.current));
      scoreRef.current += 1;
      setScore(scoreRef.current);
      setLandingPulse((current) => current + 1);
      onSoundRef.current('starCatch');
      if (navigator.vibrate) navigator.vibrate(13);
    };

    const tick = (now: number) => {
      const delta = Math.min(.04, Math.max(.001, (now - lastTick) / 1000));
      lastTick = now;
      gameElapsedRef.current += delta;
      renderElapsed += delta;

      if (movingDirectionRef.current !== 0 && !parachutingRef.current) {
        playerXRef.current = clamp(
          playerXRef.current + movingDirectionRef.current * MOVE_SPEED * delta,
          PET_HITBOX.width / 2,
          arenaSizeRef.current.width - PET_HITBOX.width / 2,
        );
      }

      const previousPlatforms = platformsRef.current;
      const riseSpeed = parachutingRef.current
        ? 0
        : Math.min(CLOUD_RISE_MAX, CLOUD_RISE_BASE + gameElapsedRef.current * CLOUD_RISE_ACCELERATION);
      let nextPlatforms = previousPlatforms
        .map((platform) => ({ ...platform, y: platform.y - riseSpeed * delta }))
        .filter((platform) => platform.y > -90);

      let lowestPlatform = nextPlatforms.reduce<CloudPlatform | null>((lowest, platform) => (
        !lowest || platform.y > lowest.y ? platform : lowest
      ), null);
      while (lowestPlatform && lowestPlatform.y < arenaSizeRef.current.height + 112) {
        const nextX = clamp(lowestPlatform.x + (Math.random() - .5) * 58, 17, 83);
        const nextY = lowestPlatform.y + 76 + Math.random() * 30;
        const nextIndex = nextPlatformIdRef.current;
        const nextVariant = platformVariantFor(nextIndex);
        const nextCloud = createPlatform(nextIndex, nextX, nextY, 96 + Math.round(Math.random() * 28), nextVariant);
        nextPlatformIdRef.current += 1;
        nextPlatforms = [...nextPlatforms, nextCloud];
        lowestPlatform = nextCloud;
      }

      const state = motionStateRef.current;
      if (state === 'parachuting') {
        const groundY = arenaSizeRef.current.height - petSize.height - 12;
        playerYRef.current = Math.min(groundY, playerYRef.current + PARACHUTE_SPEED * delta);
        if (playerYRef.current >= groundY - 1) {
          playerYRef.current = groundY;
          finishGame('parachute');
        }
      } else if (state === 'landed') {
        const currentCloud = nextPlatforms.find((platform) => platform.id === currentPlatformRef.current);
        const stillOnCloud = currentCloud
          && getPlatformSurfaceY(currentCloud) > 18
          && overlapsPlatform(playerXRef.current, currentCloud, arenaSizeRef.current.width);

        if (stillOnCloud) {
          playerYRef.current = getPlatformSurfaceY(currentCloud) - petSize.height + 5;
          velocityYRef.current = 0;
        } else {
          currentPlatformRef.current = null;
          velocityYRef.current = Math.max(54, velocityYRef.current);
          setMotion('falling');
        }
      } else {
        const previousY = playerYRef.current;
        const previousBottom = previousY + petSize.height - 13;
        velocityYRef.current += GRAVITY * delta;
        const nextY = previousY + velocityYRef.current * delta;
        const nextBottom = nextY + petSize.height - 13;
        const landingCloud = nextPlatforms
          .filter((platform) => platform.variant !== 'pass' && platform.id !== currentPlatformRef.current)
          .map((platform) => ({
            platform,
            previousPlatform: previousPlatforms.find((candidate) => candidate.id === platform.id),
          }))
          .filter(({ platform, previousPlatform }) => {
            const previousPlatformY = previousPlatform ? getPlatformSurfaceY(previousPlatform) : getPlatformSurfaceY(platform) + riseSpeed * delta;
            const platformSurfaceY = getPlatformSurfaceY(platform);
            const crossedTop = previousBottom <= previousPlatformY + 8 && nextBottom >= platformSurfaceY - 2;
            return crossedTop && platformSurfaceY > 12 && overlapsPlatform(playerXRef.current, platform, arenaSizeRef.current.width);
          })
          .sort((left, right) => left.platform.y - right.platform.y)[0]?.platform;

        if (landingCloud) {
          playerYRef.current = getPlatformSurfaceY(landingCloud) - petSize.height + 5;
          addScoreFor(landingCloud);
          if (landingCloud.variant === 'bounce') {
            velocityYRef.current = -BOUNCE_SPEED;
            currentPlatformRef.current = null;
            setMotion('bouncing');
            onSoundRef.current('jump');
          } else {
            velocityYRef.current = 0;
            currentPlatformRef.current = landingCloud.id;
            setMotion('landed');
          }
        } else {
          playerYRef.current = nextY;
          if (nextY > arenaSizeRef.current.height + 18) openParachute();
        }
      }

      if (!parachutingRef.current && playerYRef.current <= 0) finishGame('ceiling');

      platformsRef.current = nextPlatforms;
      if (renderElapsed >= 1 / 30) {
        renderElapsed = 0;
        setPlayerX(playerXRef.current);
        setPlayerY(playerYRef.current);
        setPlatforms(nextPlatforms);
      }
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [dailyBestScore, petSize.height, rewardAvailable, status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') movePlayer(-1);
      if (event.code === 'ArrowRight' || event.code === 'KeyD') movePlayer(1);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight' || event.code === 'KeyA' || event.code === 'KeyD') movePlayer(0);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [movePlayer]);

  const motionLabel = motionState === 'parachuting'
    ? '張開降落傘'
    : motionState === 'landed'
      ? '站在雲朵上'
      : motionState === 'bouncing'
        ? '被灰色雲朵彈起'
        : '正在下墜';

  return (
    <section className={styles.cloudHopPanel} aria-labelledby="cloud-hop-game-title">
      <header className={styles.gameHeader}>
        <div><span>CLOUD DESCENT</span><h2 id="cloud-hop-game-title">雲朵跳躍</h2></div>
        <div className={styles.cloudGameStats}><span><Cloud size={13} /> {score}</span><span>最高 {bestScore}</span></div>
      </header>

      <div ref={arenaRef} className={styles.cloudArena} data-status={status} data-pet={petId} data-motion={motionState}>
        <div className={styles.cloudSkyGlow} aria-hidden="true" />

        {platforms.map((platform) => (
          <span
            key={platform.id}
            className={styles.cloudPlatform}
            data-variant={platform.variant}
            data-scored={scoredCloudIds.has(platform.id)}
            style={{ left: `${platform.x}%`, top: platform.y, width: platform.width, height: platform.height }}
            aria-label={platform.variant === 'pass' ? '淡色穿透雲' : platform.variant === 'bounce' ? '灰色彈跳雲' : '正常雲朵'}
          ><i /><i /><b>{platform.variant === 'pass' ? '⋯' : platform.variant === 'bounce' ? '↟' : '✦'}</b></span>
        ))}

        <div
          className={styles.cloudPet}
          data-pet={petId}
          data-jump-state={motionState}
          style={{ left: playerX, top: playerY, width: petSize.width, height: petSize.height }}
          aria-label={`${petName}${motionLabel}`}
        >
          <span className={styles.cloudPetShadow} aria-hidden="true" />
          {motionState === 'parachuting' && <span className={styles.cloudParachute} aria-hidden="true"><i /><i /></span>}
          <Image src={petFrame} alt={`${petName}${motionLabel}`} fill priority sizes="150px" className={styles.cloudPetImage} />
        </div>

        <div className={styles.cloudScoreBadge}><Sparkles size={12} /> 站上 {score} 朵雲</div>
        {landingPulse > 0 && <span key={`cloud-pulse-${landingPulse}`} className={styles.cloudLandingBurst}>+1</span>}

        {status === 'ready' && (
          <div className={styles.gameOverlay}>
            <span className={styles.overlayStar}>☁️</span>
            <h3>往下找雲朵站好！</h3>
            <p>寵物會自動下墜，左右移動對準下方雲朵；淡色雲會穿透，灰色雲會彈跳。</p>
            <button type="button" onClick={startGame}><Play size={17} fill="currentColor" /> 開始遊戲</button>
          </div>
        )}

        {status === 'finished' && (
          <div className={styles.gameOverlay}>
            <span className={styles.overlayStar}>{finishReason === 'parachute' ? '🪂' : '💫'}</span>
            <h3>{finishReason === 'parachute' ? '降落傘帶我安全回來了！' : '碰到上方了！'}</h3>
            <p>這次站上 {score} 朵雲{rewardAvailable ? (lastReward > 0 ? `，新增 ${lastReward} 星幣。` : `，今天最高分仍是 ${dailyBestScore}。`) : '，今天前三次已記入。'}</p>
            <button type="button" onClick={startGame}><RotateCcw size={16} /> 再玩一次</button>
          </div>
        )}
      </div>

      <div className={styles.cloudControlArea}>
        <div className={styles.cloudMoveControls}>
          <button type="button" aria-label="向左移動" disabled={status !== 'playing' || motionState === 'parachuting'} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); movePlayer(-1); }} onPointerUp={() => movePlayer(0)} onPointerCancel={() => movePlayer(0)}>← 左</button>
          <button type="button" aria-label="向右移動" disabled={status !== 'playing' || motionState === 'parachuting'} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); movePlayer(1); }} onPointerUp={() => movePlayer(0)} onPointerCancel={() => movePlayer(0)}>右 →</button>
        </div>
        <div className={styles.cloudBestScore}><span>最佳雲朵</span><strong>{Math.max(bestScore, score)}</strong></div>
      </div>
      <p className={styles.gameRewardNote}>{rewardAvailable ? `今日已記入 ${Math.min(3, dailyGameAttempts)}/3 次，每站上一朵可累積 1 分` : '今天前三次已記入，仍可繼續挑戰個人紀錄'}</p>
    </section>
  );
}
