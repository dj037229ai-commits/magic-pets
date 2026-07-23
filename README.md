# MISTRY PETS

獨立的魔法寵物互動網站，包含：

- 四種專屬寵物與配套房屋
- 寵物照顧、親密度、狀態與商店
- 晨光小語、月亮小卡、勇氣魔法抽卡
- 追星星、星野跳跳、雲朵跳躍三款遊戲
- 手機版 PWA manifest 與離線資源快取骨架

## 本機啟動

```bash
npm install
npm run dev
```

開啟 <http://localhost:3000> 即可遊玩。

## 建置檢查

```bash
npm run build
```

## 部署到 GitHub / Vercel

這個資料夾本身就是獨立 Git 專案。建立 GitHub repository 後，將它設為 `origin` 並推送，再於 Vercel 匯入該 repository 即可部署。

遊戲存檔使用瀏覽器 localStorage；換到新的網域後會是新的存檔空間，可用遊戲內的家長入口備份碼／還原功能搬移資料。
