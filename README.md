# 台灣股市 RS Rating 監控系統

基於威廉歐尼爾方法的台股相對強度監控工具

## 功能特色

- ✅ 威廉歐尼爾 RS Rating 計算（0-99 評分）
- ✅ 自訂計算週期（1週 ~ 1年）
- ✅ 產業分類篩選
- ✅ 股價範圍篩選
- ✅ 即時排名顯示
- ✅ 響應式設計，支援手機/平板

## 技術棧

- React 18
- Vite
- Tailwind CSS
- Lucide React Icons

## 安裝與執行

\`\`\`bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev

# 建置專案
npm run build

# 預覽建置結果
npm run preview
\`\`\`

## 部署到 Vercel

\`\`\`bash
# 使用 Vercel CLI
npm install -g vercel
vercel

# 或直接連結 GitHub Repository 到 Vercel
\`\`\`

## RS Rating 說明

- **RS ≥ 80**: 強勢股，表現優於 80% 以上的股票
- **RS 60-79**: 中強勢股，適合持續觀察
- **RS 40-59**: 中性
- **RS < 40**: 弱勢股，相對表現較差

## 注意事項

目前使用模擬資料展示功能，實際應用需串接真實台股 API。

## License

MIT