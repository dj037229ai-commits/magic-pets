'use client';

import { ChevronLeft, Cloud, LockKeyhole, Sparkles, Star } from 'lucide-react';
import { useState } from 'react';
import CloudHopGame from './cloud-hop-game';
import ObstacleHopGame from './obstacle-hop-game';
import type { PetBgmTrack, PetSoundCue } from './pet-audio';
import StarChaseGame from './star-chase-game';
import styles from './pet-demo.module.css';

type GameId = 'star-chase' | 'obstacle-hop' | 'cloud-hop';

type PetGameHubProps = {
  bestStarScore: number;
  globalBestStarScore: number;
  bestJumpDistance: number;
  bestCloudScore: number;
  jumpUnlocked: boolean;
  dailyGameAttempts: number;
  dailyStarBestScore: number;
  dailyObstacleBestScore: number;
  dailyCloudBestScore: number;
  rewardAvailable: boolean;
  petId: string;
  petName: string;
  gameBlocked: boolean;
  gameBlockNeedLabel: string;
  gameBlockMessage: string;
  onReturnToHome: () => void;
  onSound: (cue: PetSoundCue) => void;
  onBgm: (track: PetBgmTrack) => void;
  onFinishStarChase: (score: number) => void;
  onFinishObstacleHop: (distance: number, cleared: number) => void;
  onFinishCloudHop: (score: number) => void;
};

export const OBSTACLE_HOP_UNLOCK_SCORE = 4;

export default function PetGameHub({
  bestStarScore,
  globalBestStarScore,
  bestJumpDistance,
  bestCloudScore,
  jumpUnlocked,
  dailyGameAttempts,
  dailyStarBestScore,
  dailyObstacleBestScore,
  dailyCloudBestScore,
  rewardAvailable,
  petId,
  petName,
  gameBlocked,
  gameBlockNeedLabel,
  gameBlockMessage,
  onReturnToHome,
  onSound,
  onBgm,
  onFinishStarChase,
  onFinishObstacleHop,
  onFinishCloudHop,
}: PetGameHubProps) {
  const [selectedGame, setSelectedGame] = useState<GameId | null>(null);
  const [lockedHint, setLockedHint] = useState(false);

  const careNotice = (
    <div className={styles.gameCareNotice} role="alert" aria-live="assertive">
      <span className={styles.gameCareNoticeIcon} aria-hidden="true">💗</span>
      <span className={styles.gameCareNoticeEyebrow}>先照顧一下我</span>
      <h2>{gameBlockMessage}</h2>
      <p>我的{gameBlockNeedLabel}低於 20 了，現在沒有力氣玩遊戲。先餵食、摸摸我，等狀態回到 20 以上再一起玩吧！</p>
      <button type="button" onClick={onReturnToHome}>回小屋照顧我</button>
    </div>
  );

  if (selectedGame) {
    return (
      <section className={styles.selectedGameView}>
        <button type="button" className={styles.backToGamesButton} onClick={() => { onBgm(petId as PetBgmTrack); setSelectedGame(null); }}>
          <ChevronLeft size={17} /> 選擇其他遊戲
        </button>
        {gameBlocked ? careNotice : selectedGame === 'star-chase' ? (
          <StarChaseGame
            bestScore={bestStarScore}
            dailyBestScore={dailyStarBestScore}
            dailyGameAttempts={dailyGameAttempts}
            rewardAvailable={rewardAvailable}
            petId={petId}
            petName={petName}
            onSound={onSound}
            onFinish={onFinishStarChase}
          />
        ) : selectedGame === 'obstacle-hop' ? (
          <ObstacleHopGame
            bestDistance={bestJumpDistance}
            dailyBestScore={dailyObstacleBestScore}
            dailyGameAttempts={dailyGameAttempts}
            rewardAvailable={rewardAvailable}
            petId={petId}
            petName={petName}
            onSound={onSound}
            onFinish={onFinishObstacleHop}
          />
        ) : (
          <CloudHopGame
            bestScore={bestCloudScore}
            dailyBestScore={dailyCloudBestScore}
            dailyGameAttempts={dailyGameAttempts}
            rewardAvailable={rewardAvailable}
            petId={petId}
            petName={petName}
            onSound={onSound}
            onFinish={onFinishCloudHop}
          />
        )}
      </section>
    );
  }

  const unlockProgress = Math.min(100, globalBestStarScore / OBSTACLE_HOP_UNLOCK_SCORE * 100);

  return (
    <section className={styles.gameHub} aria-labelledby="game-hub-title">
      <header className={styles.gameHubHeader}>
        <div><span>MAGIC ARCADE</span><h2 id="game-hub-title">寵物遊戲場</h2></div>
        <strong>{jumpUnlocked ? '3/3' : '2/3'} 解鎖 · 今日 {Math.min(3, dailyGameAttempts)}/3 次</strong>
      </header>
      <p className={styles.gameHubIntro}>和{petName}一起挑戰遊戲。每顆星星、每朵雲、每個障礙都會換算成 1 星幣；每日前三次結算，各遊戲保留自己的最高分。</p>

      {gameBlocked ? careNotice : <div className={styles.gameChoiceGrid}>
        <button type="button" className={styles.gameChoiceCard} onClick={() => { onBgm('star-chase'); setSelectedGame('star-chase'); }}>
          <span className={`${styles.gameChoiceArt} ${styles.starChaseChoiceArt}`} aria-hidden="true"><i>★</i><i>☾</i></span>
          <span className={styles.gameChoiceStatus}><Star size={12} fill="currentColor" /> 已解鎖</span>
          <b>追星星</b>
          <small>左右奔跑，用頭頂籃子接住星星。</small>
          <em>最高 {bestStarScore} 分</em>
        </button>

        <button
          type="button"
          className={`${styles.gameChoiceCard} ${!jumpUnlocked ? styles.gameChoiceLocked : ''}`}
          onClick={() => {
            if (jumpUnlocked) { onBgm('obstacle-hop'); setSelectedGame('obstacle-hop'); }
            else setLockedHint(true);
          }}
          aria-describedby={!jumpUnlocked ? 'jump-unlock-hint' : undefined}
        >
          <span className={`${styles.gameChoiceArt} ${styles.obstacleChoiceArt}`} aria-hidden="true"><i>🐾</i><i>🪵</i></span>
          <span className={styles.gameChoiceStatus}>{jumpUnlocked ? <><Sparkles size={12} /> 已解鎖</> : <><LockKeyhole size={12} /> 待解鎖</>}</span>
          <b>星野跳跳</b>
          <small>長按蓄力，跳過接連出現的障礙物。</small>
          <em>{jumpUnlocked ? `最遠 ${bestJumpDistance}m` : `追星星達 ${OBSTACLE_HOP_UNLOCK_SCORE} 分`}</em>
        </button>

        <button type="button" className={styles.gameChoiceCard} onClick={() => { onBgm('cloud-hop'); setSelectedGame('cloud-hop'); }}>
          <span className={`${styles.gameChoiceArt} ${styles.cloudHopChoiceArt}`} aria-hidden="true"><i>☁</i><i>✦</i></span>
          <span className={styles.gameChoiceStatus}><Cloud size={12} /> 已解鎖</span>
          <b>寵物跳雲朵</b>
          <small>持續下墜左右找雲，淡色穿透、灰色彈跳。</small>
          <em>最高 {bestCloudScore} 分</em>
        </button>
      </div>}

      {!gameBlocked && !jumpUnlocked && (
        <article id="jump-unlock-hint" className={`${styles.gameUnlockQuest} ${lockedHint ? styles.gameUnlockQuestPulse : ''}`}>
          <span><LockKeyhole size={17} /></span>
          <div><b>新遊戲解鎖任務</b><small>任一寵物在「追星星」取得 {OBSTACLE_HOP_UNLOCK_SCORE} 分</small><i><em style={{ width: `${unlockProgress}%` }} /></i></div>
          <strong>{globalBestStarScore}/{OBSTACLE_HOP_UNLOCK_SCORE}</strong>
        </article>
      )}
    </section>
  );
}
