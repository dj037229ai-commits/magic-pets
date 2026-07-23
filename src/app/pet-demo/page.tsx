'use client';

import Image from 'next/image';
import {
  ChevronDown,
  CircleHelp,
  Gamepad2,
  Gift,
  Home,
  ListChecks,
  LockKeyhole,
  PawPrint,
  PlayCircle,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Users,
  WandSparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FORTUNE_MESSAGE_COUNT, FORTUNE_MESSAGES, type FortuneDeckId } from './fortune-messages';
import PetGameHub, { OBSTACLE_HOP_UNLOCK_SCORE } from './pet-game-hub';
import { playPetSound, startPetBgm, stopPetBgm, type PetBgmTrack, type PetSoundCue } from './pet-audio';
import styles from './pet-demo.module.css';

type PetMotion = 'idle' | 'pet' | 'sleep' | 'feed' | 'play';
type ViewId = 'home' | 'fortune' | 'tasks' | 'shop' | 'game';
type TaskId = 'pet' | 'feed' | 'play' | 'fortune' | 'purchase';
type DeckId = FortuneDeckId;
type PetId = 'star-cat' | 'cloud-rabbit' | 'forest-fox' | 'ocean-dragon';
type AgeBand = '7-12' | '13-15';
type InfoModal = 'none' | 'privacy' | 'parent-gate' | 'parent-center';
type CareMode = 'feed' | 'play' | null;
type ShopCategory = 'all' | 'food' | 'toy' | 'decor' | 'bag';
type CareNeed = 'hunger' | 'mood' | 'energy';
type FortuneDrawPhase = 'idle' | 'opening' | 'shuffling' | 'spread' | 'revealed';
type FortuneCard = {
  id: number;
  message: string;
  luckyColorName: string;
  luckyColorHex: string;
};
type FortuneDeckDefinition = {
  id: DeckId;
  name: string;
  level: number;
  icon: string;
  color: string;
  setting: string;
  openLabel: string;
  openHours?: readonly [number, number];
};
type RoomItemPosition = { x: number; y: number };
type RoomItemDrag = {
  itemId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  position: RoomItemPosition;
  moved: boolean;
};

type DailyState = {
  date: string;
  checkInClaimed: boolean;
  petted: boolean;
  rested: boolean;
  fortuneCount: number;
  fortuneRewardClaims: Record<DeckId, boolean>;
  purchased: boolean;
  gameRewardClaimed: boolean;
  gamePlayCount: number;
  gameBestScore: number;
  gameBestScores: {
    starChase: number;
    obstacleHop: number;
    cloudHop: number;
  };
  sponsorViews: number;
  taskGiftClaimed: boolean;
  taskGiftItemId: string | null;
  fedPetIds: PetId[];
  playedPetIds: PetId[];
  taskClaims: Record<TaskId, boolean>;
};

type LoginStreakState = {
  days: number;
  lastDate: string;
};

type PetProgress = {
  affection: number;
  abilityLevel: number;
  bestGameScore: number;
  bestJumpDistance: number;
  bestCloudScore: number;
  ownedItems: string[];
  equippedItems: string[];
  decorationPositions: Record<string, RoomItemPosition>;
  arrangeHintSeen: boolean;
  toyDurability: Record<string, number>;
  consumables: Record<string, number>;
  hunger: number;
  mood: number;
  energy: number;
  restingUntil: number;
  lastNeedsUpdate: string;
  lastNeedsUpdateAt: number;
  claimedAffectionLevels: number[];
};

type SponsorReward = {
  id: string;
  date: string;
  time: string;
  reward: number;
};

type GameState = {
  version: 12;
  onboardingComplete: boolean;
  ageBand: AgeBand | null;
  activePetId: PetId;
  unlockedPetIds: PetId[];
  coins: number;
  pets: Record<PetId, PetProgress>;
  daily: DailyState;
  loginStreak: LoginStreakState;
  sponsorHistory: SponsorReward[];
};

type LoginReward = {
  day: number;
  coins: number;
  itemId: string | null;
  restarted: boolean;
};

type BackupEnvelope = {
  format: 'mistry-pet-save';
  version: number;
  exportedAt: string;
  game: GameState;
};

type ShopItem = {
  id: string;
  name: string;
  description: string;
  icon: string;
  art?: string;
  price: number;
  kind: '食物' | '玩具' | '裝飾';
  hunger?: number;
  mood?: number;
  energy?: number;
  favoriteFor?: PetId[];
  petOnly?: PetId[];
  rewardOnly?: boolean;
};

type LevelReward = {
  level: number;
  threshold: number;
  coins: number;
  itemId: string;
  title: string;
};

type PetDialogue = {
  idle: string[];
  pet: string[];
  feed: string[];
  favoriteFood: string[];
  play: string[];
  favoritePlay: string[];
  hungry: string[];
  tired: string[];
  sad: string[];
};

type PetDefinition = {
  id: PetId;
  name: string;
  houseName: string;
  emoji: string;
  image: string;
  roomImage: string;
  description: string;
  unlockPrice: number;
  accent: string;
};

const STORAGE_KEY = 'mistry-pet-world-v2';
const LEGACY_STORAGE_KEY = 'mistry-star-cat-world-v1';
const SPONSOR_REWARD = 10;
const SPONSOR_DAILY_LIMIT = 2;
const GAME_DAILY_ATTEMPT_LIMIT = 3;
const GAME_NEED_THRESHOLD = 20;
const REST_DURATION_MS = 15_000;
const MOOD_DECAY_INTERVAL_MS = 60 * 60 * 1000;
const MOOD_DECAY_AMOUNT = 6;
const MOOD_FLOOR = 55;
const BACKUP_CODE_PREFIX = 'MISTRY-PET-SAVE-V1:';
const TEST_AD_SECONDS = 5;
const SOUND_PREFERENCE_STORAGE_KEY = 'mistry-pet-sound-enabled-v1';
const LOGIN_CYCLE_DAYS = 7;
const FORTUNE_DRAW_BASE_REWARD = 8;

const PETS: PetDefinition[] = [
  {
    id: 'star-cat',
    name: '星星貓',
    houseName: '星空觀測屋',
    emoji: '🐱',
    image: '/images/pet-demo/star-cat-house.png',
    roomImage: '/images/pet-demo/star-cat-house-empty-clean.png',
    description: '喜歡觀察星星，會陪你抽取每日魔法小語。',
    unlockPrice: 168,
    accent: '#7760d7',
  },
  {
    id: 'cloud-rabbit',
    name: '雲朵兔',
    houseName: '晴空雲朵屋',
    emoji: '🐰',
    image: '/images/pet-demo/cloud-rabbit-house.png',
    roomImage: '/images/pet-demo/cloud-rabbit-house-empty.png',
    description: '住在彩虹和雲朵中，最會替心情放晴。',
    unlockPrice: 168,
    accent: '#6aaee8',
  },
  {
    id: 'forest-fox',
    name: '森林狐',
    houseName: '橡果樹洞屋',
    emoji: '🦊',
    image: '/images/pet-demo/forest-fox-house.png',
    roomImage: '/images/pet-demo/forest-fox-house-empty.png',
    description: '勇敢又細心，喜歡收集森林裡的小發現。',
    unlockPrice: 168,
    accent: '#8b9c38',
  },
  {
    id: 'ocean-dragon',
    name: '海月小龍',
    houseName: '月光海塔屋',
    emoji: '🐲',
    image: '/images/pet-demo/ocean-dragon-house.png',
    roomImage: '/images/pet-demo/ocean-dragon-house-empty.png',
    description: '在月光海上守護好夢，也喜歡追逐泡泡。',
    unlockPrice: 168,
    accent: '#367fc4',
  },
];

const FORTUNE_CARD_BACKS: Record<PetId, string> = {
  'star-cat': '/images/pet-demo/fortune-card-backs-v1/star-cat.webp',
  'cloud-rabbit': '/images/pet-demo/fortune-card-backs-v1/cloud-rabbit.webp',
  'forest-fox': '/images/pet-demo/fortune-card-backs-v1/forest-fox.webp',
  'ocean-dragon': '/images/pet-demo/fortune-card-backs-v1/ocean-dragon.webp',
};

const HOME_IDLE_FRAMES = Array.from(
  { length: 4 },
  (_, index) => `/images/pet-demo/full-frames-v5/idle-${String(index + 1).padStart(2, '0')}.png`,
);

const HOME_PET_FRAMES = Array.from(
  { length: 4 },
  (_, index) => `/images/pet-demo/full-frames-v5/pet-${String(index + 1).padStart(2, '0')}.png`,
);

const IDLE_FRAME_SEQUENCE = [0, 0, 1, 1, 2, 2, 1, 0, 0, 0, 3, 0];
const PET_FRAME_SEQUENCE = [0, 1, 2, 2, 2, 3];
const SLEEP_FRAME_SEQUENCE = [0, 0, 1, 1, 2, 1, 0, 0, 3, 0];

const PET_DIALOGUES: Record<PetId, PetDialogue> = {
  'star-cat': {
    idle: ['窗外的星星今天也在眨眼呢。', '要不要一起找最亮的那顆星？', '我剛剛把一個好夢藏進斗篷裡了。', '今天也慢慢來，我會陪著你。'],
    pet: ['呼嚕呼嚕……再摸一下嘛～', '你的手暖暖的，像小星星！', '耳朵後面也可以摸摸喔。'],
    feed: ['好香！我的鬍鬚都開心起來了。', '謝謝你，我吃得剛剛好。'],
    favoriteFood: ['星星餅乾！這是我最喜歡的味道！', '咔滋咔滋，像把星光吃進肚子裡！'],
    play: ['看我把玩具追到月亮旁邊！', '再一次，我這次會更快！'],
    favoritePlay: ['魔法球亮起來了，我們一起追！', '這顆球好像一顆會跑的小星星！'],
    hungry: ['肚子發出小小的咕嚕聲了……', '可以分我一點點心嗎？'],
    tired: ['眼皮像月亮一樣慢慢沉下來了。', '我想窩在軟墊上休息一下。'],
    sad: ['今天的星光有點淡，可以陪陪我嗎？', '摸摸我或陪我玩，我會慢慢有精神。'],
  },
  'cloud-rabbit': {
    idle: ['今天的雲像一大團棉花糖！', '我想跳到彩虹的另一端看看。', '風吹過耳朵時會有沙沙的聲音喔。', '有你在，天空看起來更亮了。'],
    pet: ['耳朵被摸得暖呼呼的！', '嘿嘿，我的臉頰是不是很軟？', '再輕輕摸一下，我不會跑掉。'],
    feed: ['好吃！臉頰要變得圓滾滾了。', '謝謝你，我的肚子像雲朵一樣滿足。'],
    favoriteFood: ['彩虹果凍會在嘴巴裡跳舞耶！', '哇，是我最喜歡的彩虹味！'],
    play: ['我可以一口氣跳過三朵雲！', '玩具跑到哪裡，我就跳到哪裡！'],
    favoritePlay: ['雲朵玩偶軟綿綿，抱著也能玩！', '接住雲朵！換你丟給我囉！'],
    hungry: ['跳了好多下，肚子也跟著空了。', '我聞到點心的香味了嗎？'],
    tired: ['耳朵有點垂下來，我需要充充電。', '讓我在雲朵床上躺一下吧。'],
    sad: ['天空有一小塊灰灰的，陪我把它吹走吧。', '和我說說話，我會重新笑起來。'],
  },
  'forest-fox': {
    idle: ['樹洞外面好像有新的腳印。', '我今天找到一片特別漂亮的葉子。', '安靜聽，森林正在說悄悄話。', '準備好了，我們隨時可以去探險。'],
    pet: ['尾巴忍不住搖起來了！', '被你摸摸之後，勇氣又多了一點。', '只有最信任的朋友可以摸我的耳朵喔。'],
    feed: ['補充完成！又能繼續探險了。', '這份點心有森林陽光的味道。'],
    favoriteFood: ['月光牛奶暖暖的，我最喜歡了！', '喝完月光牛奶，尾巴都蓬起來了！'],
    play: ['看我繞過樹根，再把玩具帶回來！', '森林探險家不會放過任何小線索。'],
    favoritePlay: ['緞帶魔法棒像會飛的螢火蟲！', '抓到緞帶了！下一回合換你追我。'],
    hungry: ['探險背包裡還有點心嗎？', '肚子咕嚕叫，連松鼠都聽見了。'],
    tired: ['今天走了好多路，腳掌想休息了。', '先回樹洞補充活力，再出發吧。'],
    sad: ['森林突然安靜了一點，你願意陪我嗎？', '一起玩一會兒，我就能找回勇氣。'],
  },
  'ocean-dragon': {
    idle: ['海面上的月光像一條銀色小路。', '剛剛有一顆泡泡對我眨眼睛。', '想不想聽海浪今天說了什麼？', '我會守著你的願望，不讓它漂走。'],
    pet: ['角角旁邊癢癢的，再摸一下！', '鰭都舒服得輕輕張開了。', '你的手像曬過月光一樣暖。'],
    feed: ['好吃！肚子裡冒出幸福的小泡泡。', '謝謝你，我的尾巴又有力氣了。'],
    favoriteFood: ['海風布丁滑溜溜，是我的最愛！', '一口布丁，一口月光，太幸福了！'],
    play: ['泡泡追逐賽現在開始！', '看我的尾巴把玩具推回來！'],
    favoritePlay: ['貝殼泡泡組！我要吹最大的一顆！', '泡泡飛高高，再慢慢落下來了！'],
    hungry: ['我的肚子像空空的貝殼。', '可以來一份海風點心嗎？'],
    tired: ['尾巴擺得慢慢的，我想休息一下。', '讓月光替我補充一點活力吧。'],
    sad: ['泡泡都變小了，可以陪我玩嗎？', '聽見你的聲音，我就不會孤單。'],
  },
};

const SLEEP_PHRASES: Record<PetId, string> = {
  'star-cat': '星光變得柔柔的……陪我做個好夢吧。',
  'cloud-rabbit': '雲朵枕頭準備好了，我要輕輕睡一下。',
  'forest-fox': '樹洞好安靜……醒來再一起探險喔。',
  'ocean-dragon': '月光在海面搖呀搖……晚安。',
};

const SHOP_ITEMS: ShopItem[] = [
  { id: 'star-cookie', name: '星星餅乾', description: '紫色星糖霜的酥脆餅乾，星星貓最喜歡。', icon: '🍪', art: '/images/pet-demo/food-toys-v2/star-cookie-art.png', price: 8, kind: '食物', hunger: 26, mood: 3, favoriteFor: ['star-cat'], petOnly: ['star-cat'] },
  { id: 'rainbow-jelly', name: '彩虹果凍', description: '彩虹水果和雲朵奶油，吃完心情亮晶晶。', icon: '🍮', art: '/images/pet-demo/food-toys-v2/rainbow-jelly-art.png', price: 10, kind: '食物', hunger: 20, mood: 8, favoriteFor: ['cloud-rabbit'], petOnly: ['cloud-rabbit'] },
  { id: 'moon-milk', name: '月光牛奶', description: '橡實杯裡的暖暖月光，讓森林狐恢復活力。', icon: '🥛', art: '/images/pet-demo/food-toys-v2/moon-milk-art.png', price: 11, kind: '食物', hunger: 18, energy: 8, favoriteFor: ['forest-fox'], petOnly: ['forest-fox'] },
  { id: 'sea-pudding', name: '海風布丁', description: '貝殼杯裡的清爽海藍布丁，閃著泡泡光。', icon: '🧁', art: '/images/pet-demo/food-toys-v2/sea-pudding-art.png', price: 12, kind: '食物', hunger: 22, mood: 5, favoriteFor: ['ocean-dragon'], petOnly: ['ocean-dragon'] },
  { id: 'cloudberry-parfait', name: '雲莓彩虹杯', description: '雲朵兔的專屬甜點，莓果與彩虹一層一層。', icon: '🍨', art: '/images/pet-demo/food-toys-v2/cloudberry-parfait-art.png', price: 13, kind: '食物', hunger: 22, mood: 9, favoriteFor: ['cloud-rabbit'], petOnly: ['cloud-rabbit'] },
  { id: 'forest-honey-biscuit', name: '森林蜂蜜餅', description: '森林狐的橡實蜂蜜餅，香甜又有飽足感。', icon: '🍯', art: '/images/pet-demo/food-toys-v2/forest-honey-biscuit-art.png', price: 14, kind: '食物', hunger: 25, mood: 4, favoriteFor: ['forest-fox'], petOnly: ['forest-fox'] },
  { id: 'pearl-sea-jelly', name: '珍珠海洋凍', description: '海洋龍的珍珠果凍，清涼補充飽足與心情。', icon: '🫧', art: '/images/pet-demo/food-toys-v2/pearl-sea-jelly-art.png', price: 15, kind: '食物', hunger: 24, mood: 8, favoriteFor: ['ocean-dragon'], petOnly: ['ocean-dragon'] },
  { id: 'star-ball', name: '星星魔法球', description: '會滾出星光軌跡的經典玩具。', icon: '🔮', art: '/images/pet-demo/food-toys-v2/star-ball-art.png', price: 25, kind: '玩具', favoriteFor: ['star-cat'], petOnly: ['star-cat'] },
  { id: 'cloud-plush', name: '雲朵玩偶', description: '可以抱、可以拋，也能陪睡。', icon: '☁️', art: '/images/pet-demo/food-toys-v2/cloud-plush-art.png', price: 34, kind: '玩具', favoriteFor: ['cloud-rabbit'], petOnly: ['cloud-rabbit'] },
  { id: 'ribbon-wand', name: '螢光緞帶棒', description: '像螢火蟲一樣飛舞的森林緞帶。', icon: '🎗️', art: '/images/pet-demo/food-toys-v2/ribbon-wand-art.png', price: 38, kind: '玩具', favoriteFor: ['forest-fox'], petOnly: ['forest-fox'] },
  { id: 'bubble-shell', name: '貝殼泡泡組', description: '吹出亮晶晶的大泡泡，海洋龍的最愛。', icon: '🫧', art: '/images/pet-demo/food-toys-v2/bubble-shell-art.png', price: 42, kind: '玩具', favoriteFor: ['ocean-dragon'], petOnly: ['ocean-dragon'] },
  { id: 'rainbow-kite', name: '彩虹雲風箏', description: '雲朵兔專屬的柔軟風箏，尾巴會飄出彩虹。', icon: '🪁', art: '/images/pet-demo/food-toys-v2/rainbow-kite-art.png', price: 40, kind: '玩具', favoriteFor: ['cloud-rabbit'], petOnly: ['cloud-rabbit'] },
  { id: 'leaf-ribbon-chase', name: '葉葉追光棒', description: '森林狐專屬的葉子緞帶玩具，還有一顆小螢火蟲。', icon: '🍃', art: '/images/pet-demo/food-toys-v2/leaf-ribbon-chase-art.png', price: 44, kind: '玩具', favoriteFor: ['forest-fox'], petOnly: ['forest-fox'] },
  { id: 'bubble-coral-rattle', name: '珊瑚泡泡搖鈴', description: '海洋龍專屬的圓潤貝殼搖鈴，搖一搖就有泡泡。', icon: '🪸', art: '/images/pet-demo/food-toys-v2/bubble-coral-rattle-art.png', price: 48, kind: '玩具', favoriteFor: ['ocean-dragon'], petOnly: ['ocean-dragon'] },
  { id: 'moon-cushion', name: '星月絨布抱枕', description: '深藍天鵝絨、金線刺繡與柔軟流蘇。', icon: '🌙', art: '/images/pet-demo/decor-v2/moon-cushion.png', price: 35, kind: '裝飾' },
  { id: 'nebula-plant', name: '星雲水晶盆栽', description: '靛紫葉片會開出微微發亮的水晶花。', icon: '🪴', art: '/images/pet-demo/decor-v2/nebula-plant.png', price: 45, kind: '裝飾' },
  { id: 'glow-lantern', name: '木雕星光燈', description: '木質與黃銅燈框裡亮著溫暖星光。', icon: '🏮', art: '/images/pet-demo/decor-v2/glow-lantern.png', price: 48, kind: '裝飾' },
  { id: 'friend-frame', name: '星軌友情相框', description: '木雕相框記錄四位寵物夥伴的星軌。', icon: '🖼️', art: '/images/pet-demo/decor-v2/friend-frame.png', price: 58, kind: '裝飾' },
  { id: 'cloud-rainbow-mobile', name: '彩虹雲朵掛飾', description: '雲朵兔專屬的彩虹掛飾，讓房間像漂在天空。', icon: '🌈', art: '/images/pet-demo/pet-specific-v1/cloud-rainbow-mobile-art.png', price: 52, kind: '裝飾', petOnly: ['cloud-rabbit'] },
  { id: 'acorn-glow-planter', name: '螢火橡實盆', description: '森林狐專屬的橡實盆栽，種著會發光的小嫩芽。', icon: '🌱', art: '/images/pet-demo/pet-specific-v1/acorn-glow-planter-art.png', price: 56, kind: '裝飾', petOnly: ['forest-fox'] },
  { id: 'moon-tide-fountain', name: '月潮貝殼泉', description: '海洋龍專屬的月潮噴泉，水光會在房間裡閃動。', icon: '⛲', art: '/images/pet-demo/pet-specific-v1/moon-tide-fountain-art.png', price: 62, kind: '裝飾', petOnly: ['ocean-dragon'] },
  { id: 'silver-nameplate', name: '銀河名牌', description: '親密度 Lv.2 的銀雕腳印紀念。', icon: '🌟', art: '/images/pet-demo/decor-v2/silver-nameplate.png', price: 0, kind: '裝飾', rewardOnly: true },
  { id: 'friendship-medal', name: '友情勳章', description: '親密度 Lv.3 的木雕星章展示座。', icon: '🏅', art: '/images/pet-demo/decor-v2/friendship-medal.png', price: 0, kind: '裝飾', rewardOnly: true },
  { id: 'best-friend-crown', name: '最佳夥伴王冠', description: '親密度 Lv.4 的星石王冠與絨布座墊。', icon: '👑', art: '/images/pet-demo/decor-v2/best-friend-crown.png', price: 0, kind: '裝飾', rewardOnly: true },
];

const AFFECTION_REWARDS: LevelReward[] = [
  { level: 2, threshold: 45, coins: 20, itemId: 'silver-nameplate', title: '變成好朋友了！' },
  { level: 3, threshold: 65, coins: 35, itemId: 'friendship-medal', title: '彼此更信任了！' },
  { level: 4, threshold: 85, coins: 50, itemId: 'best-friend-crown', title: '成為最佳夥伴！' },
];

const TASKS: Array<{ id: TaskId; label: string; detail: string; reward: number; icon: string }> = [
  { id: 'pet', label: '溫柔摸摸', detail: '摸目前的寵物 1 次', reward: 10, icon: '🫳' },
  { id: 'feed', label: '開心吃飯', detail: '餵目前的寵物 1 次', reward: 10, icon: '🍪' },
  { id: 'play', label: '一起玩耍', detail: '使用玩具互動 1 次', reward: 12, icon: '🧸' },
  { id: 'fortune', label: '今日占卜', detail: '完成 1 次占卜', reward: 8, icon: '🔮' },
  { id: 'purchase', label: '布置小屋', detail: '購買 1 件物品或能力', reward: 20, icon: '🎁' },
];

const DECKS: FortuneDeckDefinition[] = [
  {
    id: 'stars', name: '晨光小語', level: 1, icon: '🌅', color: '#e39a4b',
    setting: '日常鼓勵與好習慣。晨光出現時抽一張，找到今天可以完成的小目標。',
    openLabel: '早上 06:00–10:00', openHours: [6, 10],
  },
  {
    id: 'moon', name: '月亮小卡', level: 2, icon: '🌙', color: '#4f70c9',
    setting: '情緒辨識、休息與睡前自我整理。它不預測吉凶，而是陪你理解心情、安定下來。',
    openLabel: '下午 18:00–22:00', openHours: [18, 22],
  },
  {
    id: 'courage', name: '勇氣魔法', level: 3, icon: '🦁', color: '#dd8952',
    setting: '面對挑戰、表達界線與尋求幫助。適合需要跨出第一步或重新嘗試的時候。',
    openLabel: '全天開放',
  },
];

const LUCKY_COLORS = [
  { name: '晨曦杏橘', hex: '#f2a65a' },
  { name: '雲朵粉藍', hex: '#a7d8ef' },
  { name: '森林嫩綠', hex: '#91b65d' },
  { name: '海洋薄荷', hex: '#72d4c6' },
  { name: '星夜薰紫', hex: '#9b84d9' },
  { name: '月光奶油', hex: '#f7dd8b' },
];

function isFortuneDeckOpen(deck: FortuneDeckDefinition, hour: number) {
  if (!deck.openHours) return true;
  const [startHour, endHour] = deck.openHours;
  return hour >= startHour && hour < endHour;
}

function getDailyLuckyColor() {
  const dateSeed = Number(localDateKey().replaceAll('-', ''));
  return LUCKY_COLORS[dateSeed % LUCKY_COLORS.length];
}

function shuffleItems<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function createFortuneCards(deckId: DeckId, previousMessage: string): FortuneCard[] {
  const messages = FORTUNE_MESSAGES[deckId];
  const availableMessages = previousMessage && messages.length > 5
    ? messages.filter((message) => message !== previousMessage)
    : messages;
  const luckyColor = getDailyLuckyColor();
  const messageCards = shuffleItems(availableMessages)
    .slice(0, 6)
    .map((message, index) => ({
      id: index,
      message,
      luckyColorName: luckyColor.name,
      luckyColorHex: luckyColor.hex,
    }));
  return shuffleItems(messageCards).map((card, index) => ({ ...card, id: index }));
}

const NAV_ITEMS: Array<{ id: ViewId; label: string; icon: typeof Home }> = [
  { id: 'home', label: '小屋', icon: Home },
  { id: 'fortune', label: '占卜', icon: WandSparkles },
  { id: 'tasks', label: '任務', icon: ListChecks },
  { id: 'shop', label: '商店', icon: ShoppingBag },
  { id: 'game', label: '遊戲', icon: Gamepad2 },
];

const SHOP_CATEGORIES: Array<{ id: ShopCategory; label: string; icon: string }> = [
  { id: 'all', label: '全部', icon: '✨' },
  { id: 'food', label: '食物', icon: '🍪' },
  { id: 'toy', label: '玩具', icon: '🧸' },
  { id: 'decor', label: '裝飾', icon: '🪴' },
  { id: 'bag', label: '背包', icon: '🎒' },
];

const emptyDaily = (date = ''): DailyState => ({
  date,
  checkInClaimed: false,
  petted: false,
  rested: false,
  fortuneCount: 0,
  fortuneRewardClaims: { stars: false, moon: false, courage: false },
  purchased: false,
  gameRewardClaimed: false,
  gamePlayCount: 0,
  gameBestScore: 0,
  gameBestScores: { starChase: 0, obstacleHop: 0, cloudHop: 0 },
  sponsorViews: 0,
  taskGiftClaimed: false,
  taskGiftItemId: null,
  fedPetIds: [],
  playedPetIds: [],
  taskClaims: { pet: false, feed: false, play: false, fortune: false, purchase: false },
});

const emptyLoginStreak = (): LoginStreakState => ({ days: 0, lastDate: '' });

const emptyPetProgress = (date = localDateKey()): PetProgress => ({
  affection: 32,
  abilityLevel: 1,
  bestGameScore: 0,
  bestJumpDistance: 0,
  bestCloudScore: 0,
  ownedItems: [],
  equippedItems: [],
  decorationPositions: {},
  arrangeHintSeen: false,
  toyDurability: {},
  consumables: { 'star-cookie': 2 },
  hunger: 72,
  mood: 74,
  energy: 78,
  restingUntil: 0,
  lastNeedsUpdate: date,
  lastNeedsUpdateAt: Date.now(),
  claimedAffectionLevels: [],
});

const createDefaultGame = (): GameState => ({
  version: 12,
  onboardingComplete: false,
  ageBand: null,
  activePetId: 'star-cat',
  unlockedPetIds: [],
  coins: 120,
  pets: {
    'star-cat': emptyPetProgress(),
    'cloud-rabbit': emptyPetProgress(),
    'forest-fox': emptyPetProgress(),
    'ocean-dragon': emptyPetProgress(),
  },
  daily: emptyDaily(),
  loginStreak: emptyLoginStreak(),
  sponsorHistory: [],
});

function localDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function daysBetween(from: string, to: string) {
  if (!from || !to) return 0;
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.min(7, Math.floor((end.getTime() - start.getTime()) / 86_400_000)));
}

function normaliseLoginStreak(saved: Partial<LoginStreakState> | undefined): LoginStreakState {
  return {
    days: typeof saved?.days === 'number' ? Math.max(0, Math.min(LOGIN_CYCLE_DAYS, Math.floor(saved.days))) : 0,
    lastDate: typeof saved?.lastDate === 'string' ? saved.lastDate : '',
  };
}

function loginDayForClaim(game: GameState, today: string) {
  const streak = normaliseLoginStreak(game.loginStreak);
  if (game.daily.date === today && game.daily.checkInClaimed) return Math.max(1, streak.days);
  if (streak.lastDate && daysBetween(streak.lastDate, today) === 1) {
    return streak.days >= LOGIN_CYCLE_DAYS ? 1 : Math.max(1, streak.days + 1);
  }
  return 1;
}

function loginCoinReward(day: number) {
  return day === LOGIN_CYCLE_DAYS ? 100 : 20 + (Math.max(1, Math.min(LOGIN_CYCLE_DAYS - 1, day)) - 1) * 10;
}

function pickLoginGift(progress: PetProgress, petId: PetId) {
  const candidates = SHOP_ITEMS.filter((item) => (
    (item.kind === '食物' || item.kind === '玩具')
    && (!item.petOnly || item.petOnly.includes(petId))
  ));
  const newToys = candidates.filter((item) => item.kind === '食物' || !progress.ownedItems.includes(item.id));
  const pool = newToys.length > 0 ? newToys : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickTaskFood(petId: PetId) {
  const candidates = SHOP_ITEMS.filter((item) => item.kind === '食物' && (!item.petOnly || item.petOnly.includes(petId)));
  return candidates[Math.floor(Math.random() * candidates.length)] ?? SHOP_ITEMS.find((item) => item.kind === '食物');
}

function applyDailyTaskFoodReward(current: GameState, daily: DailyState) {
  const allTasksClaimed = TASKS.every((task) => daily.taskClaims[task.id]);
  const sponsorComplete = daily.sponsorViews >= SPONSOR_DAILY_LIMIT;
  if (!allTasksClaimed || !sponsorComplete || daily.taskGiftClaimed) {
    return { game: { ...current, daily }, gift: null as ShopItem | null };
  }

  const gift = pickTaskFood(current.activePetId);
  if (!gift) {
    return {
      game: { ...current, daily: { ...daily, taskGiftClaimed: true } },
      gift: null as ShopItem | null,
    };
  }

  const progress = current.pets[current.activePetId];
  return {
    game: {
      ...current,
      pets: {
        ...current.pets,
        [current.activePetId]: {
          ...progress,
          consumables: { ...progress.consumables, [gift.id]: (progress.consumables[gift.id] ?? 0) + 1 },
        },
      },
      daily: { ...daily, taskGiftClaimed: true, taskGiftItemId: gift.id },
    },
    gift,
  };
}

function normaliseDecorationPositions(saved: unknown): Record<string, RoomItemPosition> {
  if (!saved || typeof saved !== 'object') return {};
  return Object.fromEntries(Object.entries(saved as Record<string, unknown>).flatMap(([itemId, value]) => {
    if (!value || typeof value !== 'object') return [];
    const candidate = value as { x?: unknown; y?: unknown };
    if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number') return [];
    if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return [];
    return [[itemId, {
      x: Math.max(6, Math.min(94, candidate.x)),
      y: Math.max(8, Math.min(92, candidate.y)),
    } satisfies RoomItemPosition]];
  }));
}

function normaliseToyDurability(saved: unknown, ownedItems: string[]): Record<string, number> {
  const savedDurability = saved && typeof saved === 'object' ? saved as Record<string, unknown> : {};
  return Object.fromEntries(SHOP_ITEMS.filter((item) => item.kind === '玩具' && ownedItems.includes(item.id)).flatMap((item) => {
    const value = savedDurability[item.id];
    const durability = typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(item.price, Math.floor(value)))
      : item.price;
    return [[item.id, durability]];
  }));
}

function normalisePetProgress(saved: Partial<PetProgress> | undefined, today: string): PetProgress {
  const progress = { ...emptyPetProgress(today), ...saved };
  const ownedItems = Array.isArray(progress.ownedItems) ? progress.ownedItems : [];
  const elapsedDays = daysBetween(progress.lastNeedsUpdate, today);
  const savedMoodTimestamp = typeof saved?.lastNeedsUpdateAt === 'number' && Number.isFinite(saved.lastNeedsUpdateAt)
    ? saved.lastNeedsUpdateAt
    : Date.now();
  const elapsedMoodHours = Math.max(0, Math.floor((Date.now() - savedMoodTimestamp) / MOOD_DECAY_INTERVAL_MS));
  return {
    ...progress,
    ownedItems,
    equippedItems: Array.isArray(progress.equippedItems) ? progress.equippedItems : [],
    decorationPositions: normaliseDecorationPositions(progress.decorationPositions),
    arrangeHintSeen: Boolean(progress.arrangeHintSeen),
    toyDurability: normaliseToyDurability(progress.toyDurability, ownedItems),
    consumables: progress.consumables && typeof progress.consumables === 'object' ? progress.consumables : { 'star-cookie': 2 },
    claimedAffectionLevels: Array.isArray(progress.claimedAffectionLevels) ? progress.claimedAffectionLevels : [],
    hunger: Math.max(8, Math.min(100, progress.hunger - elapsedDays * 12)),
    mood: progress.mood > MOOD_FLOOR
      ? Math.max(MOOD_FLOOR, Math.min(100, progress.mood - elapsedMoodHours * MOOD_DECAY_AMOUNT))
      : progress.mood,
    energy: Math.max(10, Math.min(100, progress.energy - elapsedDays * 10)),
    lastNeedsUpdate: today,
    lastNeedsUpdateAt: savedMoodTimestamp + elapsedMoodHours * MOOD_DECAY_INTERVAL_MS,
  };
}

function normaliseDailyState(saved: Partial<DailyState> | undefined, today: string): DailyState {
  const savedGamePlayCount = typeof saved?.gamePlayCount === 'number'
    ? Math.max(0, Math.min(GAME_DAILY_ATTEMPT_LIMIT, Math.floor(saved.gamePlayCount)))
    : saved?.gameRewardClaimed ? 1 : 0;
  const savedGameBestScore = typeof saved?.gameBestScore === 'number' ? Math.max(0, saved.gameBestScore) : 0;
  const savedGameBestScores = saved?.gameBestScores && typeof saved.gameBestScores === 'object'
    ? {
        starChase: typeof saved.gameBestScores.starChase === 'number' ? Math.max(0, saved.gameBestScores.starChase) : 0,
        obstacleHop: typeof saved.gameBestScores.obstacleHop === 'number' ? Math.max(0, saved.gameBestScores.obstacleHop) : 0,
        cloudHop: typeof saved.gameBestScores.cloudHop === 'number' ? Math.max(0, saved.gameBestScores.cloudHop) : 0,
      }
    : { starChase: savedGameBestScore, obstacleHop: 0, cloudHop: 0 };
  const savedFortuneRewardClaims = saved?.fortuneRewardClaims && typeof saved.fortuneRewardClaims === 'object'
    ? {
        stars: Boolean(saved.fortuneRewardClaims.stars),
        moon: Boolean(saved.fortuneRewardClaims.moon),
        courage: Boolean(saved.fortuneRewardClaims.courage),
      }
    : emptyDaily(today).fortuneRewardClaims;
  return {
    ...emptyDaily(today),
    ...saved,
    gameRewardClaimed: savedGamePlayCount >= GAME_DAILY_ATTEMPT_LIMIT,
    gamePlayCount: savedGamePlayCount,
    gameBestScore: savedGameBestScore,
    gameBestScores: savedGameBestScores,
    fortuneRewardClaims: savedFortuneRewardClaims,
    taskClaims: { ...emptyDaily(today).taskClaims, ...saved?.taskClaims },
    taskGiftClaimed: Boolean(saved?.taskGiftClaimed),
    taskGiftItemId: typeof saved?.taskGiftItemId === 'string' ? saved.taskGiftItemId : null,
  };
}

function normaliseImportedGame(candidate: unknown): GameState {
  if (!candidate || typeof candidate !== 'object') throw new Error('存檔格式不正確');
  const parsed = candidate as Partial<GameState>;
  if (!parsed.pets || typeof parsed.pets !== 'object') throw new Error('找不到寵物存檔');

  const today = localDateKey();
  const defaults = createDefaultGame();
  const pets = Object.fromEntries(PETS.map((pet) => [
    pet.id,
    normalisePetProgress(parsed.pets?.[pet.id], today),
  ])) as Record<PetId, PetProgress>;
  const unlockedPetIds = Array.isArray(parsed.unlockedPetIds)
    ? parsed.unlockedPetIds.filter((id): id is PetId => PETS.some((pet) => pet.id === id))
    : defaults.unlockedPetIds;
  const activePetId = PETS.some((pet) => pet.id === parsed.activePetId) ? parsed.activePetId as PetId : defaults.activePetId;
  const daily = normaliseDailyState(parsed.daily, today);

  return {
    ...defaults,
    ...parsed,
    version: 12,
    onboardingComplete: Boolean(parsed.onboardingComplete),
    ageBand: parsed.ageBand === '7-12' || parsed.ageBand === '13-15' ? parsed.ageBand : null,
    activePetId,
    unlockedPetIds: unlockedPetIds.includes(activePetId) ? unlockedPetIds : [...unlockedPetIds, activePetId],
    coins: typeof parsed.coins === 'number' ? Math.max(0, Math.floor(parsed.coins)) : defaults.coins,
    pets,
    daily: daily.date === today ? daily : emptyDaily(today),
    loginStreak: normaliseLoginStreak(parsed.loginStreak),
    sponsorHistory: Array.isArray(parsed.sponsorHistory) ? parsed.sponsorHistory.slice(0, 20) as SponsorReward[] : [],
  };
}

function createBackupEnvelope(game: GameState): BackupEnvelope {
  return {
    format: 'mistry-pet-save',
    version: 1,
    exportedAt: new Date().toISOString(),
    game,
  };
}

function encodeBackupCode(game: GameState) {
  const bytes = new TextEncoder().encode(JSON.stringify(createBackupEnvelope(game)));
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `${BACKUP_CODE_PREFIX}${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

function decodeBackupInput(input: string) {
  const trimmed = input.trim();
  if (trimmed.startsWith(BACKUP_CODE_PREFIX)) {
    const encoded = trimmed.slice(BACKUP_CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as BackupEnvelope;
    if (parsed.format !== 'mistry-pet-save' || !parsed.game) throw new Error('備份碼格式不正確');
    return parsed.game;
  }

  const parsed = JSON.parse(trimmed) as BackupEnvelope | GameState;
  return parsed && typeof parsed === 'object' && 'game' in parsed && parsed.format === 'mistry-pet-save' ? parsed.game : parsed;
}

function affectionLevel(affection: number) {
  if (affection >= 85) return 4;
  if (affection >= 65) return 3;
  if (affection >= 45) return 2;
  return 1;
}

function pickPhrase(options: string[]) {
  return options[Math.floor(Math.random() * options.length)] ?? '';
}

function getLowGameNeed(progress: PetProgress): CareNeed | null {
  if (progress.hunger < GAME_NEED_THRESHOLD) return 'hunger';
  if (progress.mood < GAME_NEED_THRESHOLD) return 'mood';
  if (progress.energy < GAME_NEED_THRESHOLD) return 'energy';
  return null;
}

function applyAffectionGain(progress: PetProgress, amount: number) {
  const affection = Math.min(99, progress.affection + amount);
  const rewards = AFFECTION_REWARDS.filter((reward) => affection >= reward.threshold && !progress.claimedAffectionLevels.includes(reward.level));
  const rewardCoins = rewards.reduce((total, reward) => total + reward.coins, 0);
  const rewardItemIds = rewards.map((reward) => reward.itemId);
  return {
    progress: {
      ...progress,
      affection,
      ownedItems: [...new Set([...progress.ownedItems, ...rewardItemIds])],
      claimedAffectionLevels: [...new Set([...progress.claimedAffectionLevels, ...rewards.map((reward) => reward.level)])],
    },
    rewardCoins,
    reward: rewards.length > 0 ? { ...rewards[rewards.length - 1], coins: rewardCoins } : null,
  };
}

function loadAndMigrateGame(): GameState {
  const today = localDateKey();
  const defaults = createDefaultGame();

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<GameState>;
      const pets = Object.fromEntries(PETS.map((pet) => [
        pet.id,
        normalisePetProgress(parsed.pets?.[pet.id], today),
      ])) as Record<PetId, PetProgress>;
      const savedDaily = parsed.daily;
      const savedGamePlayCount = typeof savedDaily?.gamePlayCount === 'number'
        ? Math.max(0, Math.min(GAME_DAILY_ATTEMPT_LIMIT, Math.floor(savedDaily.gamePlayCount)))
        : savedDaily?.gameRewardClaimed ? 1 : 0;
      const savedGameBestScore = typeof savedDaily?.gameBestScore === 'number' ? Math.max(0, savedDaily.gameBestScore) : 0;
      const savedGameBestScores = savedDaily?.gameBestScores && typeof savedDaily.gameBestScores === 'object'
        ? {
            starChase: typeof savedDaily.gameBestScores.starChase === 'number' ? Math.max(0, savedDaily.gameBestScores.starChase) : 0,
            obstacleHop: typeof savedDaily.gameBestScores.obstacleHop === 'number' ? Math.max(0, savedDaily.gameBestScores.obstacleHop) : 0,
            cloudHop: typeof savedDaily.gameBestScores.cloudHop === 'number' ? Math.max(0, savedDaily.gameBestScores.cloudHop) : 0,
          }
        : { starChase: savedGameBestScore, obstacleHop: 0, cloudHop: 0 };
      const savedFortuneRewardClaims = savedDaily?.fortuneRewardClaims && typeof savedDaily.fortuneRewardClaims === 'object'
        ? {
            stars: Boolean(savedDaily.fortuneRewardClaims.stars),
            moon: Boolean(savedDaily.fortuneRewardClaims.moon),
            courage: Boolean(savedDaily.fortuneRewardClaims.courage),
          }
        : emptyDaily(today).fortuneRewardClaims;
      const daily = {
        ...emptyDaily(today),
        ...parsed.daily,
        gameRewardClaimed: savedGamePlayCount >= GAME_DAILY_ATTEMPT_LIMIT,
        gamePlayCount: savedGamePlayCount,
        gameBestScore: savedGameBestScore,
        gameBestScores: savedGameBestScores,
        fortuneRewardClaims: savedFortuneRewardClaims,
        taskClaims: { ...emptyDaily(today).taskClaims, ...parsed.daily?.taskClaims },
        taskGiftClaimed: Boolean(parsed.daily?.taskGiftClaimed),
        taskGiftItemId: typeof parsed.daily?.taskGiftItemId === 'string' ? parsed.daily.taskGiftItemId : null,
      };
      return {
        ...defaults,
        ...parsed,
        version: 12,
        pets,
        daily: daily.date === today ? daily : emptyDaily(today),
        loginStreak: normaliseLoginStreak(parsed.loginStreak),
        sponsorHistory: Array.isArray(parsed.sponsorHistory) ? parsed.sponsorHistory.slice(0, 20) : [],
      } as GameState;
    }

    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Record<string, unknown>;
      const legacyDaily = parsed.daily as Partial<DailyState> | undefined;
      defaults.coins = typeof parsed.coins === 'number' ? parsed.coins : defaults.coins;
      defaults.pets['star-cat'] = normalisePetProgress({
        affection: typeof parsed.affection === 'number' ? parsed.affection : 32,
        abilityLevel: typeof parsed.abilityLevel === 'number' ? parsed.abilityLevel : 1,
        bestGameScore: typeof parsed.bestGameScore === 'number' ? parsed.bestGameScore : 0,
        ownedItems: Array.isArray(parsed.ownedItems) ? parsed.ownedItems as string[] : [],
        equippedItems: Array.isArray(parsed.equippedItems) ? parsed.equippedItems as string[] : [],
      }, today);
      if (legacyDaily?.date === today) {
        defaults.daily = {
          ...emptyDaily(today),
          ...legacyDaily,
          sponsorViews: 0,
          taskClaims: { ...emptyDaily(today).taskClaims, ...legacyDaily.taskClaims },
        };
      }
    }
  } catch {
    return { ...defaults, daily: emptyDaily(today) };
  }

  return { ...defaults, daily: emptyDaily(today) };
}

export default function PetDemoPage() {
  const [view, setView] = useState<ViewId>('home');
  const [game, setGame] = useState<GameState>(createDefaultGame);
  const [loaded, setLoaded] = useState(false);
  const [petMotion, setPetMotion] = useState<PetMotion>('idle');
  const [draggingRoomItem, setDraggingRoomItem] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ itemId: string; position: RoomItemPosition } | null>(null);
  const [showArrangeHint, setShowArrangeHint] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundPreferenceLoaded, setSoundPreferenceLoaded] = useState(false);
  const [bgmTrack, setBgmTrack] = useState<PetBgmTrack | null>(null);
  const roomRef = useRef<HTMLElement | null>(null);
  const roomDragRef = useRef<RoomItemDrag | null>(null);
  const [restNow, setRestNow] = useState(() => Date.now());
  const [idleFrameTick, setIdleFrameTick] = useState(0);
  const [petFrameTick, setPetFrameTick] = useState(0);
  const [sleepFrameTick, setSleepFrameTick] = useState(0);
  const [dialogueTick, setDialogueTick] = useState(0);
  const [interactionMessage, setInteractionMessage] = useState('');
  const [interactionFx, setInteractionFx] = useState('');
  const [toast, setToast] = useState('');
  const [selectedDeck, setSelectedDeck] = useState<DeckId>('stars');
  const [fortuneResult, setFortuneResult] = useState('');
  const [fortunePhase, setFortunePhase] = useState<FortuneDrawPhase>('idle');
  const [fortuneCards, setFortuneCards] = useState<FortuneCard[]>([]);
  const [selectedFortuneCard, setSelectedFortuneCard] = useState<number | null>(null);
  const [fortuneRevealOpen, setFortuneRevealOpen] = useState(false);
  const [fortuneClock, setFortuneClock] = useState(() => Date.now());
  const [starterPetId, setStarterPetId] = useState<PetId>('star-cat');
  const [starterAge, setStarterAge] = useState<AgeBand | null>(null);
  const [petSwitcherOpen, setPetSwitcherOpen] = useState(false);
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [sponsorCountdown, setSponsorCountdown] = useState(TEST_AD_SECONDS);
  const [infoModal, setInfoModal] = useState<InfoModal>('none');
  const [parentAnswer, setParentAnswer] = useState('');
  const [parentError, setParentError] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [testModePassword, setTestModePassword] = useState('');
  const [testModeError, setTestModeError] = useState('');
  const [careMode, setCareMode] = useState<CareMode>(null);
  const [shopCategory, setShopCategory] = useState<ShopCategory>('all');
  const [levelReward, setLevelReward] = useState<LevelReward | null>(null);
  const [loginReward, setLoginReward] = useState<LoginReward | null>(null);
  const [backupCode, setBackupCode] = useState('');
  const [restoreCode, setRestoreCode] = useState('');
  const [backupStatus, setBackupStatus] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setGame(loadAndMigrateGame());
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const savedPreference = window.localStorage.getItem(SOUND_PREFERENCE_STORAGE_KEY);
    const timer = window.setTimeout(() => {
      if (savedPreference === 'off') setSoundEnabled(false);
      setSoundPreferenceLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => () => stopPetBgm(), []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }, [game, loaded]);

  useEffect(() => {
    if (!loaded) return;

    const applyHourlyMoodDecay = () => {
      const now = Date.now();
      setGame((current) => {
        const nextPets = { ...current.pets };
        let changed = false;

        for (const pet of PETS) {
          const progress = current.pets[pet.id];
          const timestamp = typeof progress.lastNeedsUpdateAt === 'number' && Number.isFinite(progress.lastNeedsUpdateAt)
            ? progress.lastNeedsUpdateAt
            : now;
          const elapsedHours = Math.max(0, Math.floor((now - timestamp) / MOOD_DECAY_INTERVAL_MS));
          if (elapsedHours === 0) continue;

          changed = true;
          nextPets[pet.id] = {
            ...progress,
            mood: progress.mood > MOOD_FLOOR
              ? Math.max(MOOD_FLOOR, progress.mood - elapsedHours * MOOD_DECAY_AMOUNT)
              : progress.mood,
            lastNeedsUpdateAt: timestamp + elapsedHours * MOOD_DECAY_INTERVAL_MS,
          };
        }

        return changed ? { ...current, pets: nextPets } : current;
      });
    };

    applyHourlyMoodDecay();
    const timer = window.setInterval(applyHourlyMoodDecay, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loaded]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (fortunePhase !== 'opening' && fortunePhase !== 'shuffling') return;
    const timer = window.setTimeout(
      () => setFortunePhase(fortunePhase === 'opening' ? 'shuffling' : 'spread'),
      fortunePhase === 'opening' ? 680 : 3_000,
    );
    return () => window.clearTimeout(timer);
  }, [fortunePhase]);

  useEffect(() => {
    const timer = window.setInterval(() => setFortuneClock(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!showArrangeHint) return;
    const timer = window.setTimeout(() => setShowArrangeHint(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [showArrangeHint]);

  useEffect(() => {
    if (petMotion !== 'idle') return;
    const frameTimer = window.setInterval(() => {
      setIdleFrameTick((current) => (current + 1) % IDLE_FRAME_SEQUENCE.length);
    }, 180);
    return () => window.clearInterval(frameTimer);
  }, [petMotion]);

  useEffect(() => {
    if (petMotion !== 'pet') return;
    const frameTimer = window.setInterval(() => {
      setPetFrameTick((current) => Math.min(current + 1, PET_FRAME_SEQUENCE.length - 1));
    }, 220);
    const resetTimer = window.setTimeout(() => {
      setPetMotion('idle');
      setPetFrameTick(0);
    }, PET_FRAME_SEQUENCE.length * 220 + 320);
    return () => {
      window.clearInterval(frameTimer);
      window.clearTimeout(resetTimer);
    };
  }, [petMotion]);

  useEffect(() => {
    if (petMotion !== 'sleep') return;
    const frameTimer = window.setInterval(() => {
      setSleepFrameTick((current) => (current + 1) % SLEEP_FRAME_SEQUENCE.length);
    }, 420);
    return () => window.clearInterval(frameTimer);
  }, [petMotion]);

  useEffect(() => {
    if (petMotion !== 'feed' && petMotion !== 'play') return;
    const resetTimer = window.setTimeout(() => {
      setPetMotion('idle');
      setInteractionFx('');
    }, 1650);
    return () => window.clearTimeout(resetTimer);
  }, [petMotion]);

  useEffect(() => {
    if (petMotion !== 'idle') return;
    const dialogueTimer = window.setInterval(() => setDialogueTick((current) => current + 1), 9000);
    return () => window.clearInterval(dialogueTimer);
  }, [petMotion]);

  useEffect(() => {
    if (!sponsorOpen || sponsorCountdown <= 0) return;
    const timer = window.setTimeout(() => setSponsorCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [sponsorOpen, sponsorCountdown]);

  const activePet = PETS.find((pet) => pet.id === game.activePetId) ?? PETS[0];
  const activeProgress = game.pets[activePet.id];
  const activeRestingUntil = activeProgress.restingUntil;
  const today = localDateKey();
  const loginClaimedToday = game.daily.date === today && game.daily.checkInClaimed;
  const loginDay = loginDayForClaim(game, today);
  const loginNextBigPrizeDays = loginClaimedToday && loginDay === LOGIN_CYCLE_DAYS
    ? LOGIN_CYCLE_DAYS
    : Math.max(0, LOGIN_CYCLE_DAYS - loginDay);
  const loginBigPrizeText = loginNextBigPrizeDays === 0
    ? '今天就是第 7 天大獎日！'
    : `距離下一個大獎還有 ${loginNextBigPrizeDays} 天`;
  const loginRewardItem = loginReward?.itemId ? SHOP_ITEMS.find((item) => item.id === loginReward.itemId) : null;

  useEffect(() => {
    const image = new window.Image();
    image.decoding = 'sync';
    image.src = FORTUNE_CARD_BACKS[activePet.id];
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [activePet.id]);

  useEffect(() => {
    if (!loaded) return;
    const syncTimer = window.setTimeout(() => {
      const now = Date.now();
      setRestNow(now);
      if (activeRestingUntil > now) {
        setPetMotion((current) => current === 'idle' ? 'sleep' : current);
        setSleepFrameTick(0);
      }
    }, 0);
    if (activeRestingUntil <= Date.now()) return () => window.clearTimeout(syncTimer);
    const timer = window.setInterval(() => setRestNow(Date.now()), 250);
    return () => {
      window.clearTimeout(syncTimer);
      window.clearInterval(timer);
    };
  }, [loaded, activePet.id, activeRestingUntil]);

  const restRemainingMs = Math.max(0, activeProgress.restingUntil - restNow);
  const restRemainingSeconds = Math.ceil(restRemainingMs / 1000);
  const isRestCoolingDown = restRemainingMs > 0;
  const abilityDiscount = (activeProgress.abilityLevel - 1) * 2;
  const repeatFortuneCost = Math.max(4, 10 - abilityDiscount);
  const petLevel = affectionLevel(activeProgress.affection);
  const globalBestStarScore = Math.max(...PETS.map((pet) => game.pets[pet.id].bestGameScore));
  const jumpGameUnlocked = globalBestStarScore >= OBSTACLE_HOP_UNLOCK_SCORE;
  const lowGameNeed = getLowGameNeed(activeProgress);
  const gameCareMessage = useMemo(() => {
    if (lowGameNeed === 'hunger') return pickPhrase(PET_DIALOGUES[activePet.id].hungry);
    if (lowGameNeed === 'mood') return pickPhrase(PET_DIALOGUES[activePet.id].sad);
    if (lowGameNeed === 'energy') return pickPhrase(PET_DIALOGUES[activePet.id].tired);
    return '';
  }, [activePet.id, lowGameNeed]);
  const gameCareNeedLabel = lowGameNeed === 'hunger' ? '飽足'
    : lowGameNeed === 'mood' ? '心情'
      : lowGameNeed === 'energy' ? '活力'
        : '';

  const taskDone = useMemo<Record<TaskId, boolean>>(() => ({
    pet: game.daily.petted,
    feed: game.daily.fedPetIds.includes(game.activePetId),
    play: game.daily.playedPetIds.includes(game.activePetId),
    fortune: game.daily.fortuneCount > 0,
    purchase: game.daily.purchased,
  }), [game.activePetId, game.daily]);

  const showToast = (message: string) => {
    setToast(message);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(18);
  };

  const startBgm = (track: PetBgmTrack) => {
    setBgmTrack(track);
    if (soundEnabled) startPetBgm(track);
  };

  useEffect(() => {
    if (!loaded || !soundPreferenceLoaded || !soundEnabled) return;
    const track = view === 'game' ? (bgmTrack ?? activePet.id) : activePet.id;
    startPetBgm(track);
  }, [activePet.id, bgmTrack, loaded, soundEnabled, soundPreferenceLoaded, view]);

  const playSound = (cue: PetSoundCue) => {
    if (!soundEnabled) return;
    playPetSound(cue);
    if (view !== 'game') startBgm(activePet.id);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    window.localStorage.setItem(SOUND_PREFERENCE_STORAGE_KEY, next ? 'on' : 'off');
    if (next) {
      playPetSound('success');
      const nextTrack = bgmTrack ?? activePet.id;
      setBgmTrack(nextTrack);
      startPetBgm(nextTrack);
    } else {
      stopPetBgm();
    }
    showToast(soundEnabled ? '音效與背景音樂已關閉' : '音效與背景音樂已開啟');
  };

  const updateActiveProgress = (updater: (current: PetProgress) => PetProgress) => {
    setGame((current) => ({
      ...current,
      pets: { ...current.pets, [current.activePetId]: updater(current.pets[current.activePetId]) },
    }));
  };

  const resetRoomLayout = () => {
    if (Object.keys(activeProgress.decorationPositions).length === 0) return showToast('目前就是預設位置喔！');
    updateActiveProgress((current) => ({ ...current, decorationPositions: {} }));
    showToast('已恢復小屋預設位置');
  };

  const switchView = (nextView: ViewId) => {
    if (nextView !== view) playSound('tap');
    if (nextView !== view && nextView !== 'game') startBgm(activePet.id);
    setView(nextView);
    setFortuneResult('');
    setFortuneRevealOpen(false);
  };

  const completeOnboarding = () => {
    if (!starterAge) return showToast('請先選擇年齡範圍');
    setGame((current) => ({
      ...current,
      onboardingComplete: true,
      ageBand: starterAge,
      activePetId: starterPetId,
      unlockedPetIds: current.onboardingComplete
        ? (current.unlockedPetIds.includes(starterPetId) ? current.unlockedPetIds : [...current.unlockedPetIds, starterPetId])
        : [starterPetId],
    }));
    startBgm(starterPetId);
    showToast('歡迎來到你的魔法小屋！');
  };

  const selectOrUnlockPet = (pet: PetDefinition) => {
    const unlocked = testMode || game.unlockedPetIds.includes(pet.id);
    if (unlocked) {
      setGame((current) => ({ ...current, activePetId: pet.id }));
      startBgm(pet.id);
      setPetSwitcherOpen(false);
      setPetMotion(game.pets[pet.id].restingUntil > restNow ? 'sleep' : 'idle');
      setSleepFrameTick(0);
      return showToast(`已來到${pet.name}的${pet.houseName}`);
    }
    if (game.coins < pet.unlockPrice) return showToast(`需要 ${pet.unlockPrice} 星幣才能解鎖`);
    setGame((current) => ({
      ...current,
      coins: current.coins - pet.unlockPrice,
      activePetId: pet.id,
      unlockedPetIds: [...current.unlockedPetIds, pet.id],
    }));
    startBgm(pet.id);
    setPetSwitcherOpen(false);
    showToast(`解鎖${pet.name}與${pet.houseName}！`);
  };

  const petCurrentPet = () => {
    if (petMotion !== 'sleep' && activeProgress.restingUntil > restNow) {
      setPetMotion('sleep');
      setSleepFrameTick(0);
      return showToast(`還要 ${Math.ceil((activeProgress.restingUntil - restNow) / 1000)} 秒才能喚醒，先讓${activePet.name}休息一下吧`);
    }
    if (petMotion === 'sleep') {
      const remainingMs = Math.max(0, activeProgress.restingUntil - Date.now());
      if (remainingMs > 0) {
        return showToast(`還要 ${Math.ceil(remainingMs / 1000)} 秒才能喚醒，先讓${activePet.name}休息一下吧`);
      }
      setPetMotion('idle');
      setSleepFrameTick(0);
      updateActiveProgress((progress) => ({ ...progress, restingUntil: 0 }));
      setInteractionMessage(pickPhrase(PET_DIALOGUES[activePet.id].idle));
      playSound('wake');
      return showToast(`${activePet.name}醒來了，精神滿滿！`);
    }
    if (petMotion === 'feed' || petMotion === 'play') return;
    setPetMotion('pet');
    setPetFrameTick(0);
    setInteractionMessage(pickPhrase(PET_DIALOGUES[activePet.id].pet));
    playSound('pet');
    const affectionGain = applyAffectionGain(activeProgress, 1);
    if (affectionGain.reward) setLevelReward(affectionGain.reward);
    setGame((current) => {
      const progress = current.pets[current.activePetId];
      const gain = applyAffectionGain(progress, 1);
      return {
        ...current,
        coins: current.coins + gain.rewardCoins,
        pets: {
          ...current.pets,
          [current.activePetId]: {
            ...gain.progress,
            mood: Math.min(100, progress.mood + 7),
          },
        },
        daily: { ...current.daily, petted: true },
      };
    });
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(18);
  };

  const toggleRest = () => {
    if (petMotion !== 'sleep' && activeProgress.restingUntil > restNow) {
      setPetMotion('sleep');
      setSleepFrameTick(0);
      return showToast(`還要 ${Math.ceil((activeProgress.restingUntil - restNow) / 1000)} 秒才能喚醒，先讓${activePet.name}休息一下吧`);
    }
    if (petMotion === 'sleep') {
      if (isRestCoolingDown) {
        return showToast(`還要 ${restRemainingSeconds} 秒才能喚醒，先讓${activePet.name}休息一下吧`);
      }
      setPetMotion('idle');
      setSleepFrameTick(0);
      updateActiveProgress((progress) => ({ ...progress, restingUntil: 0 }));
      setInteractionMessage(pickPhrase(PET_DIALOGUES[activePet.id].idle));
      playSound('wake');
      return showToast(`${activePet.name}伸了個懶腰，醒來囉！`);
    }

    const firstRestToday = !game.daily.rested;
    const affectionGain = applyAffectionGain(activeProgress, firstRestToday ? 1 : 0);
    if (affectionGain.reward) setLevelReward(affectionGain.reward);
    setPetMotion('sleep');
    setSleepFrameTick(0);
    playSound('sleep');
    setGame((current) => {
      const progress = current.pets[current.activePetId];
      const firstRest = !current.daily.rested;
      const gain = applyAffectionGain(progress, firstRest ? 1 : 0);
      return {
        ...current,
        coins: current.coins + gain.rewardCoins,
        pets: {
          ...current.pets,
          [current.activePetId]: {
            ...gain.progress,
            mood: Math.min(100, progress.mood + (firstRest ? 5 : 2)),
            energy: Math.min(100, progress.energy + (firstRest ? 28 : 8)),
            restingUntil: Date.now() + REST_DURATION_MS,
          },
        },
        daily: { ...current.daily, rested: true },
      };
    });
    showToast(firstRestToday ? `陪${activePet.name}休息，親密度 +1` : `${activePet.name}安心地睡著了。`);
  };

  const openCare = (mode: Exclude<CareMode, null>) => {
    if (activeProgress.restingUntil > restNow) {
      return showToast(`還要 ${Math.ceil((activeProgress.restingUntil - restNow) / 1000)} 秒才能喚醒，先讓${activePet.name}休息一下吧`);
    }
    if (petMotion === 'sleep') {
      setPetMotion('idle');
      setSleepFrameTick(0);
    }
    setCareMode(mode);
  };

  const feedPet = (item: ShopItem) => {
    const stock = activeProgress.consumables[item.id] ?? 0;
    if (item.kind !== '食物' || stock <= 0) return showToast('背包裡沒有這份食物了');
    const favorite = item.favoriteFor?.includes(activePet.id) ?? false;
    const firstFeedToday = !game.daily.fedPetIds.includes(activePet.id);
    const affectionGain = applyAffectionGain(activeProgress, firstFeedToday ? 1 : 0);
    if (affectionGain.reward) setLevelReward(affectionGain.reward);
    setGame((current) => {
      const progress = current.pets[current.activePetId];
      const gain = applyAffectionGain(progress, current.daily.fedPetIds.includes(current.activePetId) ? 0 : 1);
      return {
        ...current,
        coins: current.coins + gain.rewardCoins,
        pets: {
          ...current.pets,
          [current.activePetId]: {
            ...gain.progress,
            hunger: Math.min(100, progress.hunger + (item.hunger ?? 18) + (favorite ? 5 : 0)),
            mood: Math.min(100, progress.mood + (item.mood ?? 2) + (favorite ? 5 : 0)),
            energy: Math.min(100, progress.energy + (item.energy ?? 0)),
            consumables: { ...progress.consumables, [item.id]: Math.max(0, (progress.consumables[item.id] ?? 0) - 1) },
          },
        },
        daily: {
          ...current.daily,
          fedPetIds: current.daily.fedPetIds.includes(current.activePetId)
            ? current.daily.fedPetIds
            : [...current.daily.fedPetIds, current.activePetId],
        },
      };
    });
    setCareMode(null);
    setView('home');
    setInteractionFx(item.icon);
    setInteractionMessage(pickPhrase(favorite ? PET_DIALOGUES[activePet.id].favoriteFood : PET_DIALOGUES[activePet.id].feed));
    setPetMotion('feed');
    playSound('feed');
    showToast(firstFeedToday ? `餵食完成，親密度 +1` : `${activePet.name}吃得很滿足！`);
  };

  const playWithPet = (item: ShopItem) => {
    if (item.kind !== '玩具' || !activeProgress.ownedItems.includes(item.id)) return showToast('要先擁有這個玩具喔');
    const durability = activeProgress.toyDurability[item.id] ?? item.price;
    if (durability <= 0) return showToast(`${item.name}已經壞掉了，請重新購買一個新的。`);
    if (activeProgress.energy < 10) {
      setInteractionMessage(pickPhrase(PET_DIALOGUES[activePet.id].tired));
      return showToast(`${activePet.name}太累了，先休息一下吧`);
    }
    const favorite = item.favoriteFor?.includes(activePet.id) ?? false;
    const firstPlayToday = !game.daily.playedPetIds.includes(activePet.id);
    const breaksAfterUse = durability === 1;
    const affectionGain = applyAffectionGain(activeProgress, firstPlayToday ? 1 : 0);
    if (affectionGain.reward) setLevelReward(affectionGain.reward);
    setGame((current) => {
      const progress = current.pets[current.activePetId];
      const gain = applyAffectionGain(progress, current.daily.playedPetIds.includes(current.activePetId) ? 0 : 1);
      const nextToyDurability = { ...progress.toyDurability };
      if (breaksAfterUse) delete nextToyDurability[item.id];
      else nextToyDurability[item.id] = Math.max(0, durability - 1);
      return {
        ...current,
        coins: current.coins + gain.rewardCoins,
        pets: {
          ...current.pets,
          [current.activePetId]: {
            ...gain.progress,
            ownedItems: breaksAfterUse ? progress.ownedItems.filter((ownedItemId) => ownedItemId !== item.id) : progress.ownedItems,
            toyDurability: nextToyDurability,
            hunger: Math.max(0, progress.hunger - 5),
            mood: Math.min(100, progress.mood + 22 + (favorite ? 6 : 0)),
            energy: Math.max(0, progress.energy - 10),
          },
        },
        daily: {
          ...current.daily,
          playedPetIds: current.daily.playedPetIds.includes(current.activePetId)
            ? current.daily.playedPetIds
            : [...current.daily.playedPetIds, current.activePetId],
        },
      };
    });
    setCareMode(null);
    setView('home');
    setInteractionFx(item.icon);
    setInteractionMessage(pickPhrase(favorite ? PET_DIALOGUES[activePet.id].favoritePlay : PET_DIALOGUES[activePet.id].play));
    setPetMotion('play');
    playSound('play');
    if (breaksAfterUse) showToast(`${activePet.name}把${item.name}玩壞了！需要重新購買新的玩具。`);
    else showToast(firstPlayToday ? `一起玩耍，親密度 +1 · 耐用度剩 ${durability - 1}` : `${activePet.name}玩得好開心！耐用度剩 ${durability - 1}`);
  };

  const claimCheckIn = () => {
    if (game.daily.checkInClaimed) return showToast('今天已經領過登入星幣囉！');
    const checkInDay = loginDayForClaim(game, today);
    const coins = loginCoinReward(checkInDay);
    const currentProgress = game.pets[game.activePetId];
    const giftItem = checkInDay === 3 || checkInDay === LOGIN_CYCLE_DAYS
      ? pickLoginGift(currentProgress, game.activePetId)
      : undefined;
    const restarted = checkInDay === 1 && Boolean(game.loginStreak.lastDate) && daysBetween(game.loginStreak.lastDate, today) > 1;

    setGame((current) => {
      const progress = current.pets[current.activePetId];
      const giftedProgress = giftItem?.kind === '食物'
        ? {
            ...progress,
            consumables: {
              ...progress.consumables,
              [giftItem.id]: (progress.consumables[giftItem.id] ?? 0) + 1,
            },
          }
        : giftItem
          ? {
              ...progress,
              ownedItems: [...new Set([...progress.ownedItems, giftItem.id])],
              toyDurability: { ...progress.toyDurability, [giftItem.id]: giftItem.price },
            }
          : progress;

      return {
        ...current,
        coins: current.coins + coins,
        pets: { ...current.pets, [current.activePetId]: giftedProgress },
        daily: { ...current.daily, checkInClaimed: true },
        loginStreak: { days: checkInDay, lastDate: today },
      };
    });
    setLoginReward({ day: checkInDay, coins, itemId: giftItem?.id ?? null, restarted });
    showToast(giftItem ? `連續登入第 ${checkInDay} 天：+${coins} 星幣，獲得${giftItem.name}！` : `連續登入第 ${checkInDay} 天：+${coins} 星幣！`);
  };

  const claimTask = (taskId: TaskId) => {
    const task = TASKS.find((item) => item.id === taskId);
    if (!task || !taskDone[taskId] || game.daily.taskClaims[taskId]) return;
    const nextDaily = { ...game.daily, taskClaims: { ...game.daily.taskClaims, [taskId]: true } };
    const result = applyDailyTaskFoodReward({ ...game, coins: game.coins + task.reward }, nextDaily);
    setGame(result.game);
    showToast(result.gift ? `任務完成，獲得 ${task.reward} 星幣與${result.gift.name}！` : `任務完成，獲得 ${task.reward} 星幣！`);
  };

  const drawFortune = () => {
    if (fortunePhase === 'opening' || fortunePhase === 'shuffling' || fortunePhase === 'spread') return;
    const deck = DECKS.find((item) => item.id === selectedDeck) ?? DECKS[0];
    if (!testMode && activeProgress.abilityLevel < deck.level) return showToast(`靈感能力 Lv.${deck.level} 才能使用這副牌`);
    if (!testMode && !isFortuneDeckOpen(deck, new Date(fortuneClock).getHours())) return showToast(`${deck.name}開放時間為${deck.openLabel}`);
    const cost = game.daily.fortuneCount === 0 ? 0 : repeatFortuneCost;
    if (game.coins < cost) return showToast('星幣不夠，再完成幾個任務吧！');
    setFortuneCards(createFortuneCards(selectedDeck, fortuneResult));
    setSelectedFortuneCard(null);
    setFortuneResult('');
    setFortuneRevealOpen(false);
    setFortunePhase('opening');
    setGame((current) => ({
      ...current,
      coins: current.coins - cost,
      daily: { ...current.daily, fortuneCount: current.daily.fortuneCount + 1 },
    }));
    showToast(cost === 0 ? '今日第一次占卜免費！' : `使用 ${cost} 星幣完成占卜`);
  };

  const chooseFortuneCard = (cardId: number) => {
    if (fortunePhase !== 'spread') return;
    const card = fortuneCards.find((item) => item.id === cardId);
    if (!card) return;
    setSelectedFortuneCard(cardId);
    setFortuneResult(card.message);
    setFortunePhase('revealed');
    setFortuneRevealOpen(true);
    const reward = FORTUNE_DRAW_BASE_REWARD + Math.max(0, petLevel - 1);
    const rewardAlreadyClaimed = Boolean(game.daily.fortuneRewardClaims[selectedDeck]);
    setGame((current) => ({
      ...current,
      coins: current.coins + (rewardAlreadyClaimed ? 0 : reward),
      daily: {
        ...current.daily,
        fortuneRewardClaims: rewardAlreadyClaimed
          ? current.daily.fortuneRewardClaims
          : { ...current.daily.fortuneRewardClaims, [selectedDeck]: true },
      },
    }));
    playSound('success');
    showToast(rewardAlreadyClaimed ? '魔法小語揭曉了！這副牌今天的獎勵已領取，其他牌組仍可各自領取' : `魔法小語揭曉了！獲得 +${reward} 星幣`);
  };

  const buyOrEquip = (item: ShopItem) => {
    const owned = activeProgress.ownedItems.includes(item.id);
    if (item.petOnly && !item.petOnly.includes(activePet.id)) return showToast('這是其他寵物的小屋專屬商品');
    if (item.rewardOnly && !owned) return showToast('這是親密度升級才能獲得的紀念品');
    if (item.kind === '食物') {
      if (game.coins < item.price) return showToast('星幣不夠，再完成幾個任務吧！');
      setGame((current) => {
        const progress = current.pets[current.activePetId];
        return {
          ...current,
          coins: current.coins - item.price,
          pets: {
            ...current.pets,
            [current.activePetId]: {
              ...progress,
              consumables: { ...progress.consumables, [item.id]: (progress.consumables[item.id] ?? 0) + 1 },
            },
          },
          daily: { ...current.daily, purchased: true },
        };
      });
      return showToast(`買到${item.name}，已放進食物袋`);
    }

    if (owned) {
      if (item.kind === '玩具') {
        setCareMode('play');
        return showToast(`從背包選擇${item.name}來玩吧！`);
      }
      const equipped = activeProgress.equippedItems.includes(item.id);
      const equippedDecorations = activeProgress.equippedItems.filter((id) => SHOP_ITEMS.find((candidate) => candidate.id === id)?.kind === '裝飾');
      if (!equipped && equippedDecorations.length >= 4) return showToast('房間最多擺放 4 件裝飾，先收起一件吧');
      const shouldShowArrangeHint = !equipped && !activeProgress.arrangeHintSeen;
      updateActiveProgress((current) => ({
        ...current,
        equippedItems: equipped ? current.equippedItems.filter((id) => id !== item.id) : [...current.equippedItems, item.id],
        arrangeHintSeen: current.arrangeHintSeen || shouldShowArrangeHint,
      }));
      if (shouldShowArrangeHint) setShowArrangeHint(true);
      return showToast(equipped ? `已收起${item.name}` : `已把${item.name}放進小屋`);
    }
    const willAutoEquipDecoration = item.kind === '裝飾'
      && activeProgress.equippedItems.filter((id) => SHOP_ITEMS.find((candidate) => candidate.id === id)?.kind === '裝飾').length < 4;
    const shouldShowArrangeHint = willAutoEquipDecoration && !activeProgress.arrangeHintSeen;
    if (game.coins < item.price) return showToast('星幣不夠，再完成幾個任務吧！');
    setGame((current) => {
      const progress = current.pets[current.activePetId];
      return {
        ...current,
        coins: current.coins - item.price,
        pets: {
          ...current.pets,
          [current.activePetId]: {
            ...progress,
            ownedItems: [...progress.ownedItems, item.id],
            arrangeHintSeen: progress.arrangeHintSeen || shouldShowArrangeHint,
            toyDurability: item.kind === '玩具'
              ? { ...progress.toyDurability, [item.id]: item.price }
              : progress.toyDurability,
            equippedItems: item.kind === '裝飾' && progress.equippedItems.filter((id) => SHOP_ITEMS.find((candidate) => candidate.id === id)?.kind === '裝飾').length < 4
              ? [...progress.equippedItems, item.id]
              : progress.equippedItems,
          },
        },
        daily: { ...current.daily, purchased: true },
      };
    });
    if (shouldShowArrangeHint) setShowArrangeHint(true);
    showToast(item.kind === '裝飾' ? `買到${item.name}了！已放進小屋` : `買到${item.name}了！可以一起玩囉`);
  };

  const upgradeAbility = () => {
    if (activeProgress.abilityLevel >= 3) return showToast('占卜靈感已經滿級！');
    const price = activeProgress.abilityLevel * 60;
    if (game.coins < price) return showToast(`需要 ${price} 星幣才能升級`);
    setGame((current) => {
      const progress = current.pets[current.activePetId];
      return {
        ...current,
        coins: current.coins - price,
        pets: {
          ...current.pets,
          [current.activePetId]: { ...progress, abilityLevel: progress.abilityLevel + 1 },
        },
        daily: { ...current.daily, purchased: true },
      };
    });
    showToast('能力升級！新牌組已經解鎖');
  };

  const finishStarChase = (score: number) => {
    const countsForToday = game.daily.gamePlayCount < GAME_DAILY_ATTEMPT_LIMIT;
    const dailyBestBefore = game.daily.gameBestScores.starChase;
    const earnedStars = countsForToday ? Math.max(0, score - dailyBestBefore) : 0;
    setGame((current) => {
      const progress = current.pets[current.activePetId];
      const nextPlayCount = countsForToday
        ? Math.min(GAME_DAILY_ATTEMPT_LIMIT, current.daily.gamePlayCount + 1)
        : current.daily.gamePlayCount;
      return {
        ...current,
        coins: current.coins + earnedStars,
        pets: {
          ...current.pets,
          [current.activePetId]: {
            ...progress,
            bestGameScore: Math.max(progress.bestGameScore, score),
            hunger: Math.max(0, progress.hunger - 4),
            mood: Math.min(100, progress.mood + Math.min(12, Math.max(4, score))),
            energy: Math.max(0, progress.energy - 8),
          },
        },
        daily: {
          ...current.daily,
          gamePlayCount: nextPlayCount,
          gameBestScore: countsForToday ? Math.max(current.daily.gameBestScore, score) : current.daily.gameBestScore,
          gameBestScores: {
            ...current.daily.gameBestScores,
            starChase: countsForToday ? Math.max(current.daily.gameBestScores.starChase, score) : current.daily.gameBestScores.starChase,
          },
          gameRewardClaimed: nextPlayCount >= GAME_DAILY_ATTEMPT_LIMIT,
        },
      };
    });
    if (earnedStars > 0) showToast(`追星星接到 ${score} 顆星星，新增 ${earnedStars} 星幣！`);
    else if (countsForToday) showToast(`接到 ${score} 顆星星，今天最高分仍是 ${dailyBestBefore}！`);
    else showToast('今天前三次成績已記入，仍可繼續挑戰個人紀錄');
  };

  const finishObstacleHop = (distance: number, cleared: number) => {
    const countsForToday = game.daily.gamePlayCount < GAME_DAILY_ATTEMPT_LIMIT;
    const dailyBestBefore = game.daily.gameBestScores.obstacleHop;
    const earnedStars = countsForToday ? Math.max(0, cleared - dailyBestBefore) : 0;
    setGame((current) => {
      const progress = current.pets[current.activePetId];
      const nextPlayCount = countsForToday
        ? Math.min(GAME_DAILY_ATTEMPT_LIMIT, current.daily.gamePlayCount + 1)
        : current.daily.gamePlayCount;
      return {
        ...current,
        coins: current.coins + earnedStars,
        pets: {
          ...current.pets,
          [current.activePetId]: {
            ...progress,
            bestJumpDistance: Math.max(progress.bestJumpDistance, distance),
            hunger: Math.max(0, progress.hunger - 5),
            mood: Math.min(100, progress.mood + Math.min(12, Math.max(4, cleared * 2))),
            energy: Math.max(0, progress.energy - 10),
          },
        },
        daily: {
          ...current.daily,
          gamePlayCount: nextPlayCount,
          gameBestScore: countsForToday ? Math.max(current.daily.gameBestScore, cleared) : current.daily.gameBestScore,
          gameBestScores: {
            ...current.daily.gameBestScores,
            obstacleHop: countsForToday ? Math.max(current.daily.gameBestScores.obstacleHop, cleared) : current.daily.gameBestScores.obstacleHop,
          },
          gameRewardClaimed: nextPlayCount >= GAME_DAILY_ATTEMPT_LIMIT,
        },
      };
    });
    if (earnedStars > 0) showToast(`跳過 ${cleared} 個障礙，新增 ${earnedStars} 星幣！`);
    else if (countsForToday) showToast(`跳過 ${cleared} 個障礙，今天最高分仍是 ${dailyBestBefore}！`);
    else showToast('今天前三次成績已記入，仍可繼續挑戰個人紀錄');
  };

  const finishCloudHop = (score: number) => {
    const countsForToday = game.daily.gamePlayCount < GAME_DAILY_ATTEMPT_LIMIT;
    const dailyBestBefore = game.daily.gameBestScores.cloudHop;
    const earnedStars = countsForToday ? Math.max(0, score - dailyBestBefore) : 0;
    setGame((current) => {
      const progress = current.pets[current.activePetId];
      const nextPlayCount = countsForToday
        ? Math.min(GAME_DAILY_ATTEMPT_LIMIT, current.daily.gamePlayCount + 1)
        : current.daily.gamePlayCount;
      return {
        ...current,
        coins: current.coins + earnedStars,
        pets: {
          ...current.pets,
          [current.activePetId]: {
            ...progress,
            bestCloudScore: Math.max(progress.bestCloudScore, score),
            hunger: Math.max(0, progress.hunger - 4),
            mood: Math.min(100, progress.mood + Math.min(12, Math.max(4, score * 2))),
            energy: Math.max(0, progress.energy - 9),
          },
        },
        daily: {
          ...current.daily,
          gamePlayCount: nextPlayCount,
          gameBestScore: countsForToday ? Math.max(current.daily.gameBestScore, score) : current.daily.gameBestScore,
          gameBestScores: {
            ...current.daily.gameBestScores,
            cloudHop: countsForToday ? Math.max(current.daily.gameBestScores.cloudHop, score) : current.daily.gameBestScores.cloudHop,
          },
          gameRewardClaimed: nextPlayCount >= GAME_DAILY_ATTEMPT_LIMIT,
        },
      };
    });
    if (earnedStars > 0) showToast(`跳上 ${score} 朵雲，新增 ${earnedStars} 星幣！`);
    else if (countsForToday) showToast(`跳上 ${score} 朵雲，今天最高分仍是 ${dailyBestBefore}！`);
    else showToast('今天前三次成績已記入，仍可繼續挑戰個人紀錄');
  };

  const openSponsor = () => {
    if (game.daily.sponsorViews >= SPONSOR_DAILY_LIMIT) return showToast('今天的兩次贊助獎勵已領完');
    setSponsorCountdown(TEST_AD_SECONDS);
    setSponsorOpen(true);
  };

  const claimSponsorReward = () => {
    if (sponsorCountdown > 0 || game.daily.sponsorViews >= SPONSOR_DAILY_LIMIT) return;
    const now = new Date();
    const record: SponsorReward = {
      id: `${now.getTime()}`,
      date: localDateKey(),
      time: now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      reward: SPONSOR_REWARD,
    };
    const nextDaily = { ...game.daily, sponsorViews: game.daily.sponsorViews + 1 };
    const result = applyDailyTaskFoodReward({
      ...game,
      coins: game.coins + SPONSOR_REWARD,
      sponsorHistory: [record, ...game.sponsorHistory].slice(0, 20),
    }, nextDaily);
    setGame(result.game);
    setSponsorOpen(false);
    showToast(result.gift ? `星光贊助獲得 ${SPONSOR_REWARD} 星幣，全勤禮物是${result.gift.name}！` : `星光贊助獲得 ${SPONSOR_REWARD} 星幣！`);
  };

  const verifyParent = () => {
    if (parentAnswer.trim() !== '13') {
      setParentError('答案不正確，請由大人再試一次。');
      return;
    }
    setParentAnswer('');
    setParentError('');
    setInfoModal('parent-center');
  };

  const toggleTestMode = () => {
    if (testMode) {
      setTestMode(false);
      setTestModePassword('');
      setTestModeError('');
      showToast('測試模式已關閉');
      return;
    }
    if (testModePassword.trim() !== '6861') {
      setTestModeError('解鎖測試密碼不正確。');
      return;
    }
    setTestMode(true);
    setTestModePassword('');
    setTestModeError('');
    showToast('測試模式已開啟：全部寵物與牌組均可測試，抽卡不限時');
  };

  const generateBackupCode = () => {
    setBackupCode(encodeBackupCode(game));
    setBackupStatus('備份碼已產生，請完整複製或下載檔案保存。');
  };

  const copyBackupCode = async () => {
    if (!backupCode) return showToast('請先產生備份碼');
    try {
      await navigator.clipboard.writeText(backupCode);
      setBackupStatus('備份碼已複製，可以貼到另一台裝置。');
    } catch {
      setBackupStatus('瀏覽器不允許自動複製，請長按備份碼後選擇複製。');
    }
  };

  const downloadBackupFile = () => {
    const blob = new Blob([JSON.stringify(createBackupEnvelope(game), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mistry-pet-save-${localDateKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setBackupStatus('存檔檔案已下載，請不要刪除這個檔案。');
  };

  const restoreBackup = (input: string) => {
    if (!input.trim()) return setBackupStatus('請先貼上備份碼，或選擇存檔檔案。');
    try {
      const restored = normaliseImportedGame(decodeBackupInput(input));
      setGame(restored);
      setBackupCode('');
      setRestoreCode('');
      setBackupStatus('存檔還原成功！');
      setInfoModal('none');
      setView('home');
      showToast('已還原寵物進度！');
    } catch {
      setBackupStatus('還原失敗，請確認備份碼或檔案完整無誤。');
    }
  };

  const handleBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      restoreBackup(await file.text());
    } catch {
      setBackupStatus('無法讀取這個存檔檔案。');
    }
  };

  const dialogue = PET_DIALOGUES[activePet.id];
  const needsMessage = activeProgress.hunger <= 28
    ? dialogue.hungry
    : activeProgress.energy <= 25
      ? dialogue.tired
      : activeProgress.mood <= 30
        ? dialogue.sad
        : dialogue.idle;
  const petMessage = petMotion === 'sleep'
    ? SLEEP_PHRASES[activePet.id]
    : petMotion !== 'idle' && interactionMessage
      ? interactionMessage
      : needsMessage[dialogueTick % needsMessage.length];
  const selectedDeckSetting = DECKS.find((deck) => deck.id === selectedDeck) ?? DECKS[0];
  const fortuneDeckIsOpen = testMode || isFortuneDeckOpen(selectedDeckSetting, new Date(fortuneClock).getHours());
  const fortuneDrawReward = FORTUNE_DRAW_BASE_REWARD + Math.max(0, petLevel - 1);
  const fortuneRewardClaimedToday = Boolean(game.daily.fortuneRewardClaims[selectedDeck]);
  const dailyLuckyColor = getDailyLuckyColor();
  const fortuneCardCount = 6;
  const revealedFortuneCard = fortuneCards.find((card) => card.id === selectedFortuneCard) ?? null;
  const foodItems = SHOP_ITEMS.filter((item) => item.kind === '食物' && (!item.petOnly || item.petOnly.includes(activePet.id)));
  const taskGiftItem = game.daily.taskGiftItemId ? SHOP_ITEMS.find((item) => item.id === game.daily.taskGiftItemId) : null;
  const ownedToys = SHOP_ITEMS.filter((item) => item.kind === '玩具' && (!item.petOnly || item.petOnly.includes(activePet.id)) && activeProgress.ownedItems.includes(item.id));
  const equippedDecorationCount = activeProgress.equippedItems.filter((id) => SHOP_ITEMS.find((item) => item.id === id)?.kind === '裝飾').length;
  const filteredShopItems = SHOP_ITEMS.filter((item) => {
    if (item.petOnly && !item.petOnly.includes(activePet.id)) return false;
    if (item.rewardOnly && !activeProgress.ownedItems.includes(item.id)) return false;
    if (shopCategory === 'food') return item.kind === '食物';
    if (shopCategory === 'toy') return item.kind === '玩具';
    if (shopCategory === 'decor') return item.kind === '裝飾';
    if (shopCategory === 'bag') return item.kind === '食物'
      ? (activeProgress.consumables[item.id] ?? 0) > 0
      : activeProgress.ownedItems.includes(item.id);
    return true;
  });
  const nextAffectionReward = AFFECTION_REWARDS.find((reward) => activeProgress.affection < reward.threshold);
  const activeIdleFrames = activePet.id === 'star-cat'
    ? HOME_IDLE_FRAMES
    : Array.from({ length: 4 }, (_, index) => `/images/pet-demo/pet-frames/${activePet.id}/idle-${String(index + 1).padStart(2, '0')}.png`);
  const activePetFrames = activePet.id === 'star-cat'
    ? HOME_PET_FRAMES
    : Array.from({ length: 4 }, (_, index) => `/images/pet-demo/pet-frames/${activePet.id}/pet-${String(index + 1).padStart(2, '0')}.png`);
  const activeSleepFrames = Array.from(
    { length: 4 },
    (_, index) => `/images/pet-demo/pet-frames/${activePet.id}/sleep-${String(index + 1).padStart(2, '0')}.png`,
  );
  const activeAllFrames = [...activeIdleFrames, ...activePetFrames, ...activeSleepFrames];
  const activeHomeFrame = petMotion === 'pet'
    ? activePetFrames[PET_FRAME_SEQUENCE[petFrameTick]]
    : petMotion === 'sleep'
      ? activeSleepFrames[SLEEP_FRAME_SEQUENCE[sleepFrameTick]]
      : activeIdleFrames[IDLE_FRAME_SEQUENCE[idleFrameTick]];
  const isSleeping = petMotion === 'sleep';
  const isCareAnimating = petMotion === 'feed' || petMotion === 'play';

  const getRoomItemPosition = (itemId: string) => {
    if (dragPreview?.itemId === itemId) return dragPreview.position;
    return activeProgress.decorationPositions[itemId];
  };

  const beginRoomItemDrag = (itemId: string, event: React.PointerEvent<HTMLSpanElement>) => {
    const room = roomRef.current;
    if (!room) return;
    const roomBounds = room.getBoundingClientRect();
    const itemBounds = event.currentTarget.getBoundingClientRect();
    const originX = ((itemBounds.left + itemBounds.width / 2 - roomBounds.left) / roomBounds.width) * 100;
    const originY = ((itemBounds.top + itemBounds.height / 2 - roomBounds.top) / roomBounds.height) * 100;
    const position = activeProgress.decorationPositions[itemId] ?? { x: originX, y: originY };
    roomDragRef.current = {
      itemId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: position.x,
      originY: position.y,
      position,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingRoomItem(itemId);
    setDragPreview({ itemId, position });
  };

  const moveRoomItem = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = roomDragRef.current;
    const room = roomRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !room) return;
    const roomBounds = room.getBoundingClientRect();
    const nextPosition = {
      x: Math.max(6, Math.min(94, drag.originX + ((event.clientX - drag.startClientX) / roomBounds.width) * 100)),
      y: Math.max(8, Math.min(92, drag.originY + ((event.clientY - drag.startClientY) / roomBounds.height) * 100)),
    } satisfies RoomItemPosition;
    drag.position = nextPosition;
    drag.moved = drag.moved || Math.abs(event.clientX - drag.startClientX) > 3 || Math.abs(event.clientY - drag.startClientY) > 3;
    setDragPreview({ itemId: drag.itemId, position: nextPosition });
  };

  const endRoomItemDrag = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = roomDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    roomDragRef.current = null;
    setDraggingRoomItem(null);
    setDragPreview(null);
    if (!drag.moved) return;
    setGame((current) => {
      const progress = current.pets[current.activePetId];
      return {
        ...current,
        pets: {
          ...current.pets,
          [current.activePetId]: {
            ...progress,
            decorationPositions: { ...progress.decorationPositions, [drag.itemId]: drag.position },
          },
        },
      };
    });
    showToast('裝飾位置已保存！');
  };

  const cancelRoomItemDrag = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = roomDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    roomDragRef.current = null;
    setDraggingRoomItem(null);
    setDragPreview(null);
  };

  if (!loaded) {
    return <main className={styles.page}><div className={styles.loadingCard}>✨ 正在打開魔法小屋…</div></main>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />
      <section className={`${styles.phone} ${view !== 'home' ? styles.phoneFeature : ''}`} aria-label={`${activePet.name}的${activePet.houseName}`}>
        {view === 'home' && <>
        <header className={styles.header}>
          <button type="button" className={styles.petTitle} onClick={() => setPetSwitcherOpen(true)} aria-label="切換寵物與房屋">
            <span>Lv.{petLevel}</span>
            <div><p>{activePet.houseName}</p><h1>{activePet.name}</h1></div>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <div className={styles.headerActions}>
            <button type="button" className={styles.soundToggle} onClick={toggleSound} aria-pressed={soundEnabled} aria-label={soundEnabled ? '關閉音效與背景音樂' : '開啟音效與背景音樂'}>
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button type="button" className={styles.coinPill} onClick={() => switchView('tasks')} aria-label={`目前有 ${game.coins} 星幣，前往任務`}>
              <Sparkles size={15} /> {game.coins}
            </button>
          </div>
        </header>

        <div className={styles.progressRow}>
          <span>親密度 Lv.{petLevel}</span>
          <div><i style={{ width: `${activeProgress.affection}%` }} /></div>
          <strong>{activeProgress.affection}</strong>
        </div>

        <section className={styles.needsStrip} aria-label={`${activePet.name}的生活狀態`}>
          {[
            { key: 'hunger', icon: '🍽️', label: '飽足', value: activeProgress.hunger },
            { key: 'mood', icon: '💗', label: '心情', value: activeProgress.mood },
            { key: 'energy', icon: '⚡', label: '活力', value: activeProgress.energy },
          ].map((need) => (
            <button key={need.key} type="button" className={need.value <= 30 ? styles.needLow : ''} onClick={() => showToast(`${need.label} ${need.value}／100`)}>
              <span>{need.icon} {need.label}</span><b>{need.value}</b><i><em style={{ width: `${need.value}%` }} /></i>
            </button>
          ))}
          <button type="button" className={styles.nextRewardHint} onClick={() => showToast(nextAffectionReward ? `親密度 ${nextAffectionReward.threshold}：${nextAffectionReward.coins} 星幣＋${SHOP_ITEMS.find((item) => item.id === nextAffectionReward.itemId)?.name}` : '已取得所有親密度獎勵！')}>
            {nextAffectionReward ? `🎁 下一獎勵 ${activeProgress.affection}/${nextAffectionReward.threshold}` : '👑 已成為最佳夥伴'}
          </button>
        </section>
        </>}

        <div className={styles.content}>
          {view === 'home' && (
            <section ref={roomRef} className={`${styles.room} ${activePet.id === 'star-cat' ? styles.starCatRoom : styles.completeSceneRoom} ${isSleeping ? styles.roomSleeping : ''}`} data-pet={activePet.id} aria-label={activePet.houseName}>
              <Image src={activePet.roomImage} alt={`${activePet.houseName}的房間`} fill priority sizes="(max-width: 440px) 100vw, 440px" className={styles.completeSceneImage} />
              <div className={styles.roomShade} aria-hidden="true" />
              {showArrangeHint && activeProgress.equippedItems.length > 0 && <span className={styles.arrangeHint} aria-hidden="true">↔ 拖曳裝飾自由布置</span>}
              <div className={styles.sleepVeil} aria-hidden="true"><i /><i /><i /></div>
              <div className={styles.petSpeech} role="status" aria-live="polite">{petMessage}</div>

              <button type="button" className={`${styles.hotspot} ${styles.bedHotspot}`} onClick={toggleRest} disabled={isSleeping && isRestCoolingDown} aria-pressed={isSleeping} aria-label={isSleeping && isRestCoolingDown ? `休息中，還要 ${restRemainingSeconds} 秒才能喚醒` : isSleeping ? `喚醒${activePet.name}` : `讓${activePet.name}休息`}><span>{isSleeping ? '☀️' : '🌙'}</span><b>{isSleeping ? (isRestCoolingDown ? `等 ${restRemainingSeconds}s` : '喚醒') : '休息'}</b></button>
              <button type="button" className={`${styles.hotspot} ${styles.fortuneHotspot}`} onClick={() => switchView('fortune')}><span>🔮</span><b>占卜</b></button>
              <button type="button" className={`${styles.hotspot} ${styles.taskHotspot}`} onClick={() => switchView('tasks')}><span>📋</span><b>任務</b></button>
              <button type="button" className={`${styles.hotspot} ${styles.shopHotspot}`} onClick={() => switchView('shop')}><span>🎁</span><b>商店</b></button>

              <div className={styles.careDock} aria-label="照顧寵物">
                <button type="button" onClick={() => openCare('feed')} disabled={isSleeping}><span>🍪</span><b>餵食</b></button>
                <button type="button" onClick={() => openCare('play')} disabled={isSleeping}><span>🧸</span><b>玩玩具</b></button>
              </div>

              {activeProgress.equippedItems.map((itemId) => {
                const item = SHOP_ITEMS.find((candidate) => candidate.id === itemId);
                if (!item) return null;
                const position = getRoomItemPosition(item.id);
                const positionStyle = position ? {
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  right: 'auto',
                  bottom: 'auto',
                  transform: 'translate(-50%, -50%)',
                } : undefined;
                return <span
                  key={item.id}
                  className={`${styles.roomItem} ${styles[item.id.replaceAll('-', '')]} ${draggingRoomItem === item.id ? styles.roomItemDragging : ''}`}
                  data-art={item.art ? 'image' : 'emoji'}
                  style={positionStyle}
                  onPointerDown={(event) => beginRoomItemDrag(item.id, event)}
                  onPointerMove={moveRoomItem}
                  onPointerUp={endRoomItemDrag}
                  onPointerCancel={cancelRoomItemDrag}
                  aria-label={`${item.name}，可拖曳調整位置`}
                >{item.art ? <Image src={item.art} alt="" fill sizes="100px" className={styles.roomItemArtwork} /> : item.icon}</span>;
              })}

              <span className={styles.petGroundShadow} aria-hidden="true" />
              {isSleeping && <span className={styles.sleepDream} aria-hidden="true"><i>Z</i><i>z</i><i>✦</i></span>}
              {isCareAnimating && <span className={styles.interactionFx} data-motion={petMotion} aria-hidden="true"><i>{interactionFx}</i><i>{petMotion === 'feed' ? '♡' : '✦'}</i><i>{petMotion === 'feed' ? '好吃！' : '再一次！'}</i></span>}
              <button type="button" className={`${styles.homePetButton} ${isCareAnimating ? styles.homePetCareAction : ''}`} data-motion={petMotion} onClick={petCurrentPet} aria-label={isSleeping ? (isRestCoolingDown ? `休息中，還要 ${restRemainingSeconds} 秒才能喚醒${activePet.name}` : `喚醒${activePet.name}`) : `摸摸${activePet.name}的頭`}>
                <span className={`${styles.homePetFrames} ${isSleeping ? styles.homePetSleeping : ''}`}>
                  {activeAllFrames.map((src) => (
                    <Image key={src} src={src} alt={activeHomeFrame === src ? (petMotion === 'pet' ? `正在被摸頭的${activePet.name}` : isSleeping ? `${activePet.name}正在安心睡覺` : `${activePet.name}正在自然呼吸眨眼`) : ''} fill priority sizes="260px" className={`${styles.homePetImage} ${activeHomeFrame === src ? styles.homePetImageActive : ''}`} />
                  ))}
                </span>
                  {petMotion === 'pet' && <span className={styles.hearts} aria-hidden="true"><i>♥</i><i>✦</i><i>♥</i></span>}
              </button>

              {!game.daily.checkInClaimed && <button type="button" className={styles.checkInBubble} onClick={claimCheckIn}><Gift size={17} /><span><b>連續第 {loginDay} 天 · +{loginCoinReward(loginDay)}</b><small>{loginBigPrizeText}</small></span></button>}
            </section>
          )}

          {view === 'fortune' && (
            <section className={styles.panel} aria-labelledby="fortune-title">
              <div className={styles.panelHeading}>
                <div><span>MAGIC MIRROR</span><h2 id="fortune-title">今天的魔法小語</h2></div>
                <div className={styles.abilityBadge}>靈感 Lv.{activeProgress.abilityLevel}</div>
              </div>
              <div className={styles.deckGrid}>
                {DECKS.map((deck) => {
                  const unlocked = testMode || activeProgress.abilityLevel >= deck.level;
                  const rewardClaimed = Boolean(game.daily.fortuneRewardClaims[deck.id]);
                  return (
                    <button key={deck.id} type="button" className={`${styles.deckCard} ${selectedDeck === deck.id ? styles.deckCardActive : ''} ${!unlocked ? styles.deckCardLocked : ''}`} style={{ '--deck-color': deck.color } as React.CSSProperties} onClick={() => {
                      if (!unlocked) return showToast(`升到靈感 Lv.${deck.level} 就能解鎖`);
                      setSelectedDeck(deck.id);
                      setFortunePhase('idle');
                      setFortuneCards([]);
                      setSelectedFortuneCard(null);
                      setFortuneResult('');
                      setFortuneRevealOpen(false);
                    }} aria-pressed={selectedDeck === deck.id}>
                      <span>{unlocked ? deck.icon : <LockKeyhole size={20} />}</span><b>{deck.name}</b><small>{unlocked ? deck.openLabel : `Lv.${deck.level} 解鎖`}</small>{unlocked && <em className={styles.deckCardReward}>{rewardClaimed ? '今日已領獎' : `今日獎勵 +${fortuneDrawReward}`}</em>}
                    </button>
                  );
                })}
              </div>
              <p className={styles.fortuneRewardRule}>三副牌的今日獎勵分開計算：晨光、月亮、勇氣每天各可領一次。</p>
              <div className={styles.fortuneTable} data-pet={activePet.id} data-phase={fortunePhase} data-card-count={fortuneCardCount}>
                <div className={styles.fortuneTableHeading}>
                  <span>✦ {activePet.name}的{selectedDeckSetting.name}卡桌 ✦</span>
                  <small aria-live="polite">
                    {fortunePhase === 'idle' && '按下抽牌，桌上的牌會先扇形展開'}
                    {fortunePhase === 'opening' && '牌卡扇形展開中……'}
                    {fortunePhase === 'shuffling' && '六張牌正在交錯洗牌……'}
                    {fortunePhase === 'shuffling' && '卡牌洗牌中……'}
                    {fortunePhase === 'spread' && '請選一張你最有感覺的牌'}
                    {fortunePhase === 'revealed' && '今天的訊息已揭曉'}
                  </small>
                </div>
                <div className={styles.fortuneCardSpread} role="group" aria-label="六張魔法卡牌">
                  {(fortuneCards.length > 0 ? fortuneCards : Array.from({ length: fortuneCardCount }, (_, index): FortuneCard => ({ id: index, message: '', luckyColorName: dailyLuckyColor.name, luckyColorHex: dailyLuckyColor.hex }))).map((card, index) => {
                    const revealed = fortunePhase === 'revealed' && selectedFortuneCard === card.id;
                    const dimmed = fortunePhase === 'revealed' && !revealed;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        className={`${styles.fortuneCardSlot} ${revealed ? styles.fortuneCardSlotRevealed : ''} ${dimmed ? styles.fortuneCardSlotDimmed : ''}`}
                        style={{ '--card-index': index } as React.CSSProperties}
                        data-revealed={revealed}
                        aria-label={revealed ? `${selectedDeckSetting.name}：${card.message}` : `選擇第 ${index + 1} 張魔法卡牌`}
                        onClick={() => chooseFortuneCard(card.id)}
                        disabled={fortunePhase !== 'spread'}
                      >
                          <span className={styles.fortuneCardInner}>
                            <span className={`${styles.fortuneCardFace} ${styles.fortuneCardBack}`} aria-hidden="true">
                              <Image
                                src={FORTUNE_CARD_BACKS[activePet.id]}
                                alt=""
                                fill
                                sizes="(max-width: 440px) 30vw, 132px"
                                className={styles.fortuneCardBackArtwork}
                                loading="eager"
                                unoptimized
                              />
                              <span className={styles.fortuneCardBackFoil} aria-hidden="true">✦</span>
                            </span>
                          <span className={`${styles.fortuneCardFace} ${styles.fortuneCardFront}`}>
                            <span className={styles.fortuneCardFrontIcon}>{selectedDeckSetting.icon}</span>
                            <span className={styles.fortuneCardFrontTitle}>{selectedDeckSetting.name}</span>
                            <span className={styles.fortuneCardLuckyColor}><i className={styles.fortuneLuckySwatch} style={{ background: card.luckyColorHex }} />{card.luckyColorName}</span>
                            <span className={styles.fortuneCardMessage}>{revealed ? card.message : '選到我了！'}</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <button type="button" className={styles.primaryButton} onClick={drawFortune} disabled={fortunePhase === 'opening' || fortunePhase === 'shuffling' || fortunePhase === 'spread'}>
                <WandSparkles size={18} />
                {!fortuneDeckIsOpen ? `${selectedDeckSetting.openLabel}再來抽卡` : fortunePhase === 'opening' ? '牌卡展開中…' : fortunePhase === 'shuffling' ? '卡牌洗牌中…' : fortunePhase === 'spread' ? '請先選一張卡牌' : fortunePhase === 'revealed' ? '再洗牌抽一張' : game.daily.fortuneCount === 0 ? '免費開始抽卡' : `${repeatFortuneCost} 星幣再抽一次`}
              </button>
              {fortuneRevealOpen && revealedFortuneCard && (
                <div className={styles.fortuneRevealOverlay} role="dialog" aria-modal="true" aria-labelledby="fortune-reveal-title" data-pet={activePet.id}>
                  <button type="button" className={styles.fortuneRevealBackdrop} onClick={() => setFortuneRevealOpen(false)} aria-label="關閉魔法小語" />
                  <article className={styles.fortuneRevealCard}>
                    <button type="button" className={styles.fortuneRevealClose} onClick={() => setFortuneRevealOpen(false)} aria-label="回到牌桌"><X size={18} /></button>
                    <div className={styles.fortuneRevealCrown} aria-hidden="true">✦　✧　✦</div>
                    <span className={styles.fortuneRevealIcon}>{selectedDeckSetting.icon}</span>
                    <span className={styles.fortuneRevealLabel}>{selectedDeckSetting.name}</span>
                    <span className={styles.fortuneRevealLuckyColor}><i className={styles.fortuneRevealSwatch} style={{ background: revealedFortuneCard.luckyColorHex }} />今日幸運色：{revealedFortuneCard.luckyColorName}</span>
                    <h3 id="fortune-reveal-title">給今天的你</h3>
                    <p>{revealedFortuneCard.message}</p>
                    <small>{fortuneRewardClaimedToday ? '今日此牌組獎勵已領取' : `抽卡獎勵 +${fortuneDrawReward} 星幣`}</small>
                    <button type="button" className={styles.secondaryButton} onClick={() => setFortuneRevealOpen(false)}>回到牌桌</button>
                  </article>
                </div>
              )}
            </section>
          )}

          {view === 'tasks' && (
            <section className={styles.panel} aria-labelledby="tasks-title">
              <div className={styles.panelHeading}><div><span>DAILY QUEST</span><h2 id="tasks-title">今天的小任務</h2></div><div className={styles.taskCount}>{Object.values(taskDone).filter(Boolean).length}/{TASKS.length}</div></div>
              <button type="button" className={`${styles.checkInCard} ${game.daily.checkInClaimed ? styles.checkInCardDone : ''}`} onClick={claimCheckIn}><span className={styles.checkInIcon}>🎁</span><span><b>連續登入第 {loginDay} 天</b><small>{game.daily.checkInClaimed ? `今天已領取 · ${loginBigPrizeText}` : `現在領取 ${loginCoinReward(loginDay)} 星幣${loginDay === 3 || loginDay === LOGIN_CYCLE_DAYS ? '＋禮物盒' : ''}`}</small></span><strong>{game.daily.checkInClaimed ? '✓' : `+${loginCoinReward(loginDay)}`}</strong></button>
              <p className={styles.loginStreakStatus} role="status">{game.daily.checkInClaimed ? '今天是' : '今天登入是'}連續第 {loginDay} 天 · {loginBigPrizeText} · 中斷一天會重新開始</p>
              <div className={styles.taskList}>
                {TASKS.map((task) => {
                  const done = taskDone[task.id];
                  const claimed = game.daily.taskClaims[task.id];
                  return <article key={task.id} className={`${styles.taskCard} ${done ? styles.taskCardDone : ''}`}><span className={styles.taskIcon}>{task.icon}</span><div><b>{task.label}</b><small>{claimed ? '獎勵已領取' : done ? '完成！可以領獎' : task.detail}</small></div><button type="button" disabled={!done || claimed} onClick={() => claimTask(task.id)}>{claimed ? '✓' : `+${task.reward}`}</button></article>;
                })}
              </div>

              <article className={styles.sponsorCard}>
                <div className={styles.sponsorIcon}><PlayCircle size={25} /></div>
                <div><span>TEST REWARD</span><b>星光贊助站</b><p>觀看測試贊助內容可獲得 10 星幣，不需點擊廣告。</p></div>
                <button type="button" onClick={openSponsor} disabled={game.daily.sponsorViews >= SPONSOR_DAILY_LIMIT}>{game.daily.sponsorViews >= SPONSOR_DAILY_LIMIT ? '明天再來' : `觀看 +${SPONSOR_REWARD}`}</button>
                <small>今日 {game.daily.sponsorViews}/{SPONSOR_DAILY_LIMIT} 次</small>
              </article>

              <p className={styles.taskGiftStatus}><Gift size={14} />{game.daily.taskGiftClaimed ? `今日全勤獎勵：${taskGiftItem?.name ?? '寵物食物'}` : `完成全部 ${TASKS.length} 項任務並領完 ${SPONSOR_DAILY_LIMIT} 次贊助，可獲得隨機寵物食物`}</p>

              <details className={styles.rewardHistory}>
                <summary>
                  <span className={styles.rewardHistoryTitle}><b>贊助獎勵紀錄</b><small>共 {game.sponsorHistory.length} 筆 · 每日最多 2 次</small></span>
                  <span className={styles.rewardHistoryChevron} aria-hidden="true">⌄</span>
                </summary>
                <div className={styles.rewardHistoryBody}>
                  {game.sponsorHistory.length === 0 ? <p>還沒有紀錄，完成一次測試贊助後會顯示在這裡。</p> : game.sponsorHistory.map((record) => <p key={record.id}><span>{record.date}　{record.time}</span><strong>+{record.reward} 星幣</strong></p>)}
                </div>
              </details>

              <p className={styles.resetNote}><CircleHelp size={14} /> 每天午夜重置任務與贊助次數</p>
              <div className={styles.safetyLinks}><button type="button" onClick={() => setInfoModal('privacy')}><ShieldCheck size={14} /> 隱私與兒童安全</button><button type="button" onClick={() => setInfoModal('parent-gate')}><Users size={14} /> 家長入口</button></div>
            </section>
          )}

          {view === 'shop' && (
            <section className={styles.panel} aria-labelledby="shop-title">
              <div className={styles.panelHeading}><div><span>STAR SHOP</span><h2 id="shop-title">{activePet.name}的商店</h2></div><div className={styles.shopCoins}><Sparkles size={14} /> {game.coins}</div></div>
              <article className={styles.upgradeCard}><div className={styles.upgradeMagic}><WandSparkles size={25} /></div><div><b>占卜靈感 Lv.{activeProgress.abilityLevel}</b><small>只屬於{activePet.name}，降低重抽費用並解鎖牌組。</small></div><button type="button" onClick={upgradeAbility} disabled={activeProgress.abilityLevel >= 3}>{activeProgress.abilityLevel >= 3 ? '滿級' : <><Sparkles size={12} /> {activeProgress.abilityLevel * 60}</>}</button></article>
              <article className={styles.affectionRewardCard}>
                <span>{petLevel >= 4 ? '👑' : '🎁'}</span>
                <div><b>親密度 Lv.{petLevel}</b><small>{nextAffectionReward ? `到 ${nextAffectionReward.threshold} 解鎖 ${SHOP_ITEMS.find((item) => item.id === nextAffectionReward.itemId)?.name}＋${nextAffectionReward.coins} 星幣` : '已取得全部親密度紀念獎勵'}</small></div>
                <strong>{activeProgress.affection}</strong>
              </article>
              <div className={styles.shopTabs} aria-label="商店分類">
                {SHOP_CATEGORIES.map((category) => <button key={category.id} type="button" className={shopCategory === category.id ? styles.shopTabActive : ''} onClick={() => setShopCategory(category.id)} aria-pressed={shopCategory === category.id}><span>{category.icon}</span>{category.label}</button>)}
              </div>
              <div className={styles.arrangementSummary}><span>🏠 小屋布置</span><b>{equippedDecorationCount}/4</b><small>拖曳小屋內的裝飾即可自由調整位置</small>{Object.keys(activeProgress.decorationPositions).length > 0 && <button type="button" onClick={resetRoomLayout}>恢復預設</button>}</div>
              <div className={styles.shopGrid}>
                {filteredShopItems.map((item) => {
                  const owned = activeProgress.ownedItems.includes(item.id);
                  const equipped = activeProgress.equippedItems.includes(item.id);
                  const stock = activeProgress.consumables[item.id] ?? 0;
                  return <article key={item.id} className={`${styles.shopCard} ${item.rewardOnly ? styles.rewardShopCard : ''}`}><span className={`${styles.shopItemIcon} ${item.art ? styles.shopItemArt : ''}`}>{item.art ? <Image src={item.art} alt="" fill sizes="80px" className={styles.shopItemArtwork} /> : item.icon}</span><small>{item.rewardOnly ? '親密度獎勵' : item.kind}{item.kind === '食物' && stock > 0 ? ` · 持有 ${stock}` : ''}{item.kind === '玩具' && owned ? ` · 耐用度 ${activeProgress.toyDurability[item.id] ?? item.price}/${item.price}` : ''}</small><b>{item.name}</b><p>{item.description}</p><div className={styles.shopActions}>
                    {item.kind === '食物' && <><button type="button" onClick={() => buyOrEquip(item)}><Sparkles size={12} /> {item.price} 買一份</button>{stock > 0 && <button type="button" className={styles.shopSecondaryAction} onClick={() => feedPet(item)}>餵食</button>}</>}
                    {item.kind === '玩具' && (owned ? <button type="button" onClick={() => playWithPet(item)}>一起玩</button> : <button type="button" onClick={() => buyOrEquip(item)}><Sparkles size={12} /> {item.price}</button>)}
                    {item.kind === '裝飾' && (owned ? <button type="button" className={equipped ? styles.shopSecondaryAction : ''} onClick={() => buyOrEquip(item)}>{equipped ? '收進背包' : '放進小屋'}</button> : <button type="button" onClick={() => buyOrEquip(item)}><Sparkles size={12} /> {item.price}</button>)}
                  </div></article>;
                })}
                {filteredShopItems.length === 0 && <p className={styles.emptyBag}>背包目前是空的，去其他分類挑選喜歡的東西吧！</p>}
              </div>
            </section>
          )}

          {view === 'game' && (
            <PetGameHub
              bestStarScore={activeProgress.bestGameScore}
              globalBestStarScore={globalBestStarScore}
              bestJumpDistance={activeProgress.bestJumpDistance}
              bestCloudScore={activeProgress.bestCloudScore}
              jumpUnlocked={jumpGameUnlocked}
              dailyGameAttempts={game.daily.gamePlayCount}
              dailyStarBestScore={game.daily.gameBestScores.starChase}
              dailyObstacleBestScore={game.daily.gameBestScores.obstacleHop}
              dailyCloudBestScore={game.daily.gameBestScores.cloudHop}
              rewardAvailable={game.daily.gamePlayCount < GAME_DAILY_ATTEMPT_LIMIT}
              petId={activePet.id}
              petName={activePet.name}
              gameBlocked={Boolean(lowGameNeed)}
              gameBlockNeedLabel={gameCareNeedLabel}
              gameBlockMessage={gameCareMessage}
              onReturnToHome={() => switchView('home')}
              onSound={playSound}
              onBgm={startBgm}
              onFinishStarChase={finishStarChase}
              onFinishObstacleHop={finishObstacleHop}
              onFinishCloudHop={finishCloudHop}
            />
          )}
        </div>

        <nav className={styles.bottomNav} aria-label="主要功能">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" className={view === item.id ? styles.navActive : ''} onClick={() => switchView(item.id)} aria-current={view === item.id ? 'page' : undefined}><Icon size={20} strokeWidth={2.4} /><span>{item.label}</span>{item.id === 'tasks' && game.daily.sponsorViews < SPONSOR_DAILY_LIMIT && <i />}</button>;
          })}
        </nav>
        {toast && <div className={styles.toast} role="status">{toast}</div>}
      </section>

      {!game.onboardingComplete && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
          <section className={`${styles.modalCard} ${styles.onboardingCard}`}>
            <div className={styles.modalEyebrow}><PawPrint size={16} /> 第一次來到魔法小屋</div>
            <h2 id="welcome-title">選一位最喜歡的寵物夥伴</h2>
            <p>第一次選擇的寵物免費入住自己的專屬房屋；其他夥伴包含星星貓，之後都需要 168 星幣解鎖。</p>
            <div className={styles.starterPetGrid}>
              {PETS.map((pet) => <button key={pet.id} type="button" className={starterPetId === pet.id ? styles.starterPetActive : ''} style={{ '--pet-accent': pet.accent } as React.CSSProperties} onClick={() => setStarterPetId(pet.id)}><span className={styles.petPreview}><Image src={pet.image} alt={`${pet.name}的${pet.houseName}`} fill sizes="180px" /></span><b>{pet.emoji} {pet.name}</b><small>{pet.houseName}</small></button>)}
            </div>
            <fieldset className={styles.ageChoice}><legend>請選擇遊玩者年齡</legend><button type="button" className={starterAge === '7-12' ? styles.ageActive : ''} onClick={() => setStarterAge('7-12')}>7–12 歲</button><button type="button" className={starterAge === '13-15' ? styles.ageActive : ''} onClick={() => setStarterAge('13-15')}>13–15 歲</button></fieldset>
            <p className={styles.ageNote}><ShieldCheck size={14} /> 本遊戲僅供 7–15 歲使用，不蒐集生日；所有年齡一律採兒童安全設定。</p>
            <button type="button" className={styles.primaryButton} onClick={completeOnboarding}>和 {PETS.find((pet) => pet.id === starterPetId)?.name} 一起開始</button>
            <button type="button" className={styles.textButton} onClick={() => setInfoModal('privacy')}>先閱讀隱私與家長說明</button>
          </section>
        </div>
      )}

      {petSwitcherOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="pet-switch-title">
          <section className={`${styles.modalCard} ${styles.petSwitcherCard}`}>
            <button type="button" className={styles.modalClose} onClick={() => setPetSwitcherOpen(false)} aria-label="關閉"><X size={19} /></button>
            <div className={styles.modalEyebrow}><PawPrint size={16} /> 寵物與專屬房屋</div><h2 id="pet-switch-title">今天要拜訪誰呢？</h2>
            <div className={styles.petSwitchList}>
              {PETS.map((pet) => {
                const unlocked = testMode || game.unlockedPetIds.includes(pet.id);
                const progress = game.pets[pet.id];
                return <article key={pet.id} style={{ '--pet-accent': pet.accent } as React.CSSProperties}><span className={styles.switchPetImage}><Image src={pet.image} alt="" fill sizes="90px" /></span><div><b>{pet.emoji} {pet.name}</b><small>{pet.houseName} · 親密度 {progress.affection}</small><p>{pet.description}</p></div><button type="button" onClick={() => selectOrUnlockPet(pet)} disabled={game.activePetId === pet.id}>{game.activePetId === pet.id ? '目前' : unlocked ? '前往' : <><LockKeyhole size={12} /> {pet.unlockPrice}</>}</button></article>;
              })}
            </div>
          </section>
        </div>
      )}

      {careMode && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="care-title">
          <section className={`${styles.modalCard} ${styles.careModalCard}`}>
            <button type="button" className={styles.modalClose} onClick={() => setCareMode(null)} aria-label="關閉"><X size={19} /></button>
            <div className={styles.modalEyebrow}><PawPrint size={16} /> {careMode === 'feed' ? '開飯時間' : '一起玩耍'}</div>
            <h2 id="care-title">{careMode === 'feed' ? `想餵${activePet.name}吃什麼？` : `選一個${activePet.name}的玩具`}</h2>
            <p>{careMode === 'feed' ? '喜歡的食物會額外增加心情；每天第一次餵食還會增加親密度。' : '玩耍會提升心情並消耗一些活力；每天第一次玩耍會增加親密度。'}</p>
            <div className={styles.careChoiceList}>
              {(careMode === 'feed'
                ? foodItems.filter((item) => (activeProgress.consumables[item.id] ?? 0) > 0)
                : ownedToys
              ).map((item) => {
                const favorite = item.favoriteFor?.includes(activePet.id);
                return <button key={item.id} type="button" onClick={() => careMode === 'feed' ? feedPet(item) : playWithPet(item)}><span className={`${styles.careChoiceIcon} ${item.art ? styles.careChoiceArt : ''}`}>{item.art ? <Image src={item.art} alt="" fill sizes="42px" className={styles.careChoiceArtwork} /> : item.icon}</span><div><b>{item.name}{favorite ? '　💖 最愛' : ''}</b><small>{careMode === 'feed' ? `持有 ${activeProgress.consumables[item.id] ?? 0} · 飽足 +${(item.hunger ?? 18) + (favorite ? 5 : 0)}` : `耐用度 ${activeProgress.toyDurability[item.id] ?? item.price}/${item.price} · 心情 +${22 + (favorite ? 6 : 0)} · 活力 -10`}</small></div><strong>使用</strong></button>;
              })}
            </div>
            {((careMode === 'feed' && foodItems.every((item) => (activeProgress.consumables[item.id] ?? 0) === 0)) || (careMode === 'play' && ownedToys.length === 0)) && <div className={styles.emptyCare}><span>{careMode === 'feed' ? '🍽️' : '🧸'}</span><p>{careMode === 'feed' ? '食物袋空空的。' : '還沒有可以玩的玩具。'}</p></div>}
            <button type="button" className={styles.secondaryButton} onClick={() => { setCareMode(null); setShopCategory(careMode === 'feed' ? 'food' : 'toy'); switchView('shop'); }}>{careMode === 'feed' ? '前往食物商店' : '前往玩具商店'}</button>
          </section>
        </div>
      )}

      {loginReward && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="login-reward-title">
          <section className={`${styles.modalCard} ${styles.levelRewardCard} ${styles.loginRewardCard}`}>
            <span className={styles.levelRewardGlow} aria-hidden="true">✦</span>
            <div className={styles.levelRewardPet}>{loginReward.day === LOGIN_CYCLE_DAYS ? '🎁' : '✨'}</div>
            <small>7-DAY LOGIN BONUS</small>
            <h2 id="login-reward-title">{loginReward.restarted ? '重新開始也很棒！' : `連續登入第 ${loginReward.day} 天！`}</h2>
            <p>{loginReward.restarted ? '剛剛重新回到登入旅程，今天是新的第 1 天。' : `完成第 ${loginReward.day} 天登入獎勵。`}</p>
            <div className={styles.levelRewardItems}>
              <span>✨ <b>+{loginReward.coins} 星幣</b></span>
              {loginRewardItem && <span><span className={styles.checkInRewardArt}>{loginRewardItem.art ? <Image src={loginRewardItem.art} alt="" fill sizes="46px" /> : loginRewardItem.icon}</span><b>禮物盒 · {loginRewardItem.name}</b></span>}
            </div>
            <p className={styles.loginRewardHint}>{loginReward.day === LOGIN_CYCLE_DAYS ? '七天完成！下一次登入會從第 1 天重新開始。' : `下一個第 7 天大獎還有 ${LOGIN_CYCLE_DAYS - loginReward.day} 天。`}</p>
            <button type="button" className={styles.primaryButton} onClick={() => setLoginReward(null)}>收下登入獎勵</button>
          </section>
        </div>
      )}

      {levelReward && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="level-reward-title">
          <section className={`${styles.modalCard} ${styles.levelRewardCard}`}>
            <span className={styles.levelRewardGlow} aria-hidden="true">✦</span>
            <div className={styles.levelRewardPet}>{activePet.emoji}</div>
            <small>FRIENDSHIP LEVEL UP</small>
            <h2 id="level-reward-title">{levelReward.title}</h2>
            <p>{activePet.name}的親密度升到 Lv.{levelReward.level}！</p>
            <div className={styles.levelRewardItems}><span>✨ <b>{levelReward.coins} 星幣</b></span><span>{SHOP_ITEMS.find((item) => item.id === levelReward.itemId)?.icon} <b>{SHOP_ITEMS.find((item) => item.id === levelReward.itemId)?.name}</b></span></div>
            <button type="button" className={styles.primaryButton} onClick={() => setLevelReward(null)}>收下獎勵</button>
          </section>
        </div>
      )}

      {sponsorOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="sponsor-title">
          <section className={`${styles.modalCard} ${styles.testAdCard}`}>
            <button type="button" className={styles.modalClose} onClick={() => setSponsorOpen(false)} aria-label="關閉測試贊助"><X size={19} /></button>
            <span className={styles.testLabel}>測試廣告 · 不連接正式廣告</span><div className={styles.testAdVisual}>✨<i>★</i><i>✦</i></div><h2 id="sponsor-title">星光贊助站</h2>
            <p>{sponsorCountdown > 0 ? `正在播放安全的模擬內容，${sponsorCountdown} 秒後可領獎。` : '模擬內容播放完成！不需要點擊任何廣告。'}</p>
            <button type="button" className={styles.primaryButton} disabled={sponsorCountdown > 0} onClick={claimSponsorReward}>{sponsorCountdown > 0 ? `請等待 ${sponsorCountdown}` : `領取 ${SPONSOR_REWARD} 星幣`}</button>
          </section>
        </div>
      )}

      {infoModal !== 'none' && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <section className={`${styles.modalCard} ${styles.policyCard}`}>
            <button type="button" className={styles.modalClose} onClick={() => { setInfoModal('none'); setParentAnswer(''); setParentError(''); setTestModePassword(''); setTestModeError(''); }} aria-label="關閉"><X size={19} /></button>
            {infoModal === 'privacy' && <><div className={styles.modalEyebrow}><ShieldCheck size={16} /> 兒童隱私與安全</div><h2>給孩子與家長的說明</h2><div className={styles.policyText}><h3>年齡範圍</h3><p>本體驗為 7–15 歲設計，只記錄年齡區間，不要求生日、姓名、學校、住址或聯絡方式。</p><h3>資料保存</h3><p>寵物進度、星幣與獎勵紀錄只保存在這台裝置的瀏覽器內，不建立公開個人檔案。家長可在家長中心產生備份碼或下載存檔檔案，資料不會自動上傳。</p><h3>廣告與獎勵</h3><p>目前只有測試贊助畫面，不載入正式廣告、不追蹤廣告偏好，也不要求孩子點擊廣告。未來若接入廣告，將只採兒童安全、非個人化設定，並先由家長同意。</p><h3>占卜內容</h3><p>魔法小語是鼓勵與情緒整理，不預測吉凶，也不能取代家長、老師或專業人員的協助。</p></div><button type="button" className={styles.secondaryButton} onClick={() => setInfoModal('parent-gate')}>進入家長入口</button></>}
            {infoModal === 'parent-gate' && <><div className={styles.modalEyebrow}><Users size={16} /> 家長驗證</div><h2>請由大人完成</h2><p>為避免孩子誤入，請回答：8 + 5 = ?</p><input value={parentAnswer} onChange={(event) => setParentAnswer(event.target.value)} inputMode="numeric" aria-label="家長驗證答案" placeholder="輸入答案" />{parentError && <p className={styles.formError}>{parentError}</p>}<button type="button" className={styles.primaryButton} onClick={verifyParent}>驗證並進入</button></>}
            {infoModal === 'parent-center' && <><div className={styles.modalEyebrow}><Users size={16} /> 家長中心</div><h2>目前的兒童安全設定</h2><div className={styles.parentSummary}><p><ShieldCheck size={17} /><span><b>不蒐集個人資料</b><small>只有裝置內的遊戲進度與年齡區間。</small></span></p><p><PlayCircle size={17} /><span><b>僅使用測試贊助</b><small>每天兩次、每次 10 星幣，沒有正式廣告點擊。</small></span></p><p><Sparkles size={17} /><span><b>內容以鼓勵為主</b><small>占卜不談吉凶、不製造恐懼或付費壓力。</small></span></p></div><section className={styles.parentFortuneRules} aria-labelledby="fortune-parent-rules-title"><div className={styles.backupPanelHeading}><span>🔮</span><div><h3 id="fortune-parent-rules-title">魔法小語與牌卡規則</h3><p>這些說明只放在家長入口，遊戲畫面保留給孩子抽卡與閱讀。</p></div></div><ul><li>共 {FORTUNE_MESSAGE_COUNT} 句鼓勵小語；按下抽卡後洗牌，從攤開的牌中選一張。</li><li>晨光小語：早上 06:00–10:00；其中一張小語卡會融合「今日幸運色」提醒。</li><li>月亮小卡：下午 18:00–22:00；勇氣魔法：全天開放。</li><li>每天第一次抽卡免費，之後依寵物能力等級計算費用；抽卡獎勵為 Lv.1 +8，之後每升一級再 +1 星幣。</li></ul></section><section className={styles.backupPanel} aria-labelledby="backup-title"><div className={styles.backupPanelHeading}><span>💾</span><div><h3 id="backup-title">跨裝置存檔</h3><p>備份碼只在裝置上產生，不會上傳；可貼到另一台裝置還原。</p></div></div><div className={styles.backupActions}><button type="button" className={styles.primaryButton} onClick={generateBackupCode}>產生備份碼</button><button type="button" className={styles.secondaryButton} onClick={downloadBackupFile}>下載存檔檔案</button></div>{backupCode && <div className={styles.backupCodeBlock}><label htmlFor="backup-code">備份碼</label><textarea id="backup-code" value={backupCode} readOnly onFocus={(event) => event.currentTarget.select()} /><button type="button" className={styles.secondaryButton} onClick={copyBackupCode}>複製備份碼</button></div>}<label className={styles.restoreLabel} htmlFor="restore-code">還原備份碼<textarea id="restore-code" value={restoreCode} onChange={(event) => setRestoreCode(event.target.value)} placeholder="將另一台裝置的備份碼貼在這裡" /></label><div className={styles.backupActions}><button type="button" className={styles.primaryButton} onClick={() => restoreBackup(restoreCode)}>還原此存檔</button><label className={styles.backupFileButton}><input type="file" accept="application/json,.json" onChange={handleBackupFile} />選擇存檔檔案</label></div>{backupStatus && <p className={styles.backupStatus} role="status">{backupStatus}</p>}</section><section className={styles.backupPanel} aria-labelledby="test-mode-title-new"><div className={styles.backupPanelHeading}><span>🧪</span><div><h3 id="test-mode-title-new">開發測試權限</h3><p>輸入家長提供的測試密碼後，可暫時切換全部寵物、牌組，並忽略牌組開放時間。</p></div></div>{!testMode && <><input className={styles.testModePassword} type="password" inputMode="numeric" maxLength={4} value={testModePassword} onChange={(event) => { setTestModePassword(event.target.value.replace(/\D/g, '').slice(0, 4)); setTestModeError(''); }} placeholder="輸入 4 位數解鎖測試密碼" aria-label="解鎖測試密碼" />{testModeError && <p className={styles.formError}>{testModeError}</p>}</>}<div className={styles.backupActions}><button type="button" className={testMode ? styles.secondaryButton : styles.primaryButton} onClick={toggleTestMode}>{testMode ? '關閉測試模式' : '輸入密碼並解鎖測試'}</button></div>{testMode && <p className={styles.backupStatus} role="status">測試權限已啟用：全部寵物、房屋與牌組可切換，晨光／月亮小語不限開放時段；重新整理頁面後會恢復原本的解鎖狀態。</p>}</section><button type="button" className={styles.secondaryButton} onClick={() => setInfoModal('privacy')}>查看完整隱私說明</button></>}
          </section>
        </div>
      )}
    </main>
  );
}
