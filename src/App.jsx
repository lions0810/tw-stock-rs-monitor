import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Filter, RefreshCw, Info, AlertCircle, Loader2, Bell, BellOff, Send } from 'lucide-react';

const INDUSTRY_MAP = {
  '01': '水泥工業', '02': '食品工業', '03': '塑膠工業', '04': '紡織纖維',
  '05': '電機機械', '06': '電器電纜', '08': '玻璃陶瓷', '09': '造紙工業',
  '10': '鋼鐵工業', '11': '橡膠工業', '12': '汽車工業', '14': '建材營造',
  '15': '航運業', '16': '觀光事業', '17': '金融保險', '18': '貿易百貨',
  '20': '其他', '21': '化學工業', '22': '生技醫療', '23': '油電燃氣',
  '24': '半導體業', '25': '電腦及週邊', '26': '光電業', '27': '通信網路',
  '28': '電子零組件', '29': '電子通路', '30': '資訊服務', '31': '其他電子'
};

const TWStockRSMonitor = () => {
  const [stocks, setStocks] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [selectedIndustry, setSelectedIndustry] = useState('全部');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 10000 });
  const [period, setPeriod] = useState('3個月');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showInfo, setShowInfo] = useState(true);
  const [showTelegramSetup, setShowTelegramSetup] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [watchList, setWatchList] = useState([]);
  const [useRealData, setUseRealData] = useState(true);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [rawApiData, setRawApiData] = useState(null);

  useEffect(() => {
    loadStockData();
    const savedBotToken = localStorage.getItem('telegramBotToken');
    const savedChatId = localStorage.getItem('telegramChatId');
    const savedWatchList = localStorage.getItem('watchList');
    if (savedBotToken) setTelegramBotToken(savedBotToken);
    if (savedChatId) setTelegramChatId(savedChatId);
    if (savedWatchList) setWatchList(JSON.parse(savedWatchList));
  }, []);

  useEffect(() => {
    filterStocks();
  }, [stocks, selectedIndustry, priceRange, period, searchTerm]);

  const loadStockData = async () => {
    if (useRealData) {
      loadRealStockData();
    } else {
      loadMockData();
    }
  };

  const loadMockData = () => {
    setLoading(true);
    setError(null);
    setLoadingProgress(0);
    
    setTimeout(() => {
      const industries = Object.values(INDUSTRY_MAP);
      const mockStocks = [];
      
      for (let i = 0; i < 150; i++) {
        const code = (2300 + i).toString();
        const industry = industries[Math.floor(Math.random() * industries.length)];
        const basePrice = Math.random() * 500 + 20;
        const changePercent = (Math.random() - 0.5) * 10;
        
        mockStocks.push({
          code,
          name: `${industry.substring(0, 2)}股${i + 1}`,
          price: parseFloat(basePrice.toFixed(2)),
          changePercent,
          industry,
          returns: {
            week1: changePercent,
            month1: changePercent * 4,
            month3: changePercent * 12,
            month6: changePercent * 24,
            year1: changePercent * 48
          }
        });
      }
      
      setLoadingProgress(100);
      setStocks(mockStocks);
      setLoading(false);
    }, 500);
  };

  const loadRealStockData = async () => {
    setLoading(true);
    setError(null);
    setLoadingProgress(0);
    try {
      setLoadingProgress(10);
      const today = new Date();
      const dateStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
      
      // 嘗試不同的 API 端點
      let data = null;
      let urls = [
        `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${dateStr}&type=ALLBUT0999&response=json`,
        `https://www.twse.com.tw/exchangeReport/MI_INDEX?date=${dateStr}&type=ALLBUT0999&response=json`,
        `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?date=${dateStr}&response=json`
      ];
      
      for (let url of urls) {
        try {
          console.log('嘗試 API:', url);
          const response = await fetch(url);
          const json = await response.json();
          console.log('API 回應:', json);
          
          if (json.stat === 'OK' && (json.data9 || json.data)) {
            data = json;
            setRawApiData(json); // 儲存原始資料供檢視
            break;
          }
        } catch (e) {
          console.log('API 失敗:', e);
          continue;
        }
      }
      
      if (!data || (data.stat !== 'OK')) {
        throw new Error(`API 回應異常。狀態: ${data?.stat || '無回應'}，請稍後再試或使用模擬資料`);
      }
      
      const stockData = data.data9 || data.data;
      if (!stockData || stockData.length === 0) {
        throw new Error('今日盤後資料尚未更新，通常於下午 4:30 後更新，請稍後再試');
      }
      
      setLoadingProgress(30);
      const stockList = stockData.map(row => {
        const code = row[0].trim();
        const name = row[1].trim();
        
        // 嘗試找到正確的收盤價欄位
        // 證交所格式: [0]代號 [1]名稱 [2]成交股數 [3]成交筆數 [4]成交金額 [5]開盤 [6]最高 [7]最低 [8]收盤
        // 但有時格式會變，所以我們多試幾個
        let closePrice = 0;
        let changePercent = 0;
        
        // 嘗試不同的欄位位置
        const possiblePriceFields = [8, 6, 5, 4]; // 收盤價可能的位置
        for (let index of possiblePriceFields) {
          const price = parseFloat(String(row[index]).replace(/,/g, '').replace(/[+\-]/g, '') || 0);
          // 台股股價通常在 10-2000 之間
          if (price >= 1 && price <= 10000) {
            closePrice = price;
            break;
          }
        }
        
        // 漲跌幅通常在 [9] 或 [10] 或 [11]
        const possibleChangeFields = [9, 10, 11];
        for (let index of possibleChangeFields) {
          const change = parseFloat(String(row[index]).replace(/,/g, '').replace(/%/g, '') || 0);
          if (Math.abs(change) <= 100) { // 漲跌幅通常不會超過 100%
            changePercent = change;
            break;
          }
        }
        
        const industryCode = code.substring(0, 2);
        
        console.log(`${code} ${name}: 收盤=${closePrice}, 漲跌幅=${changePercent}%, 原始資料=`, row);
        
        return {
          code, name, 
          price: closePrice, 
          changePercent,
          industry: INDUSTRY_MAP[industryCode] || '其他',
          returns: { 
            week1: changePercent, 
            month1: changePercent * 4, 
            month3: changePercent * 12, 
            month6: changePercent * 24, 
            year1: changePercent * 48 
          }
        };
      }).filter(stock => stock.price > 0 && stock.code.length === 4);
      
      if (stockList.length === 0) {
        throw new Error('無有效股票資料，請稍後再試或切換模擬資料');
      }
      
      setLoadingProgress(100);
      setStocks(stockList);
      console.log('成功載入股票數量:', stockList.length);
    } catch (err) {
      console.error('載入失敗詳情:', err);
      setError(err.message || '無法載入台股資料，請檢查網路或稍後再試');
      // 自動切換到模擬資料
      setUseRealData(false);
      setTimeout(() => loadMockData(), 1000);
    } finally {
      setLoading(false);
    }
  };

  const filterStocks = () => {
    let filtered = [...stocks];
    if (selectedIndustry !== '全部') {
      filtered = filtered.filter(s => s.industry === selectedIndustry);
    }
    filtered = filtered.filter(s => s.price >= priceRange.min && s.price <= priceRange.max);
    if (searchTerm) {
      filtered = filtered.filter(s => s.code.includes(searchTerm) || s.name.includes(searchTerm));
    }
    const periodMap = { '1週': 'week1', '1個月': 'month1', '3個月': 'month3', '6個月': 'month6', '1年': 'year1' };
    const key = periodMap[period];
    const allReturns = filtered.map(s => s.returns[key]);
    filtered = filtered.map(stock => {
      const betterThan = allReturns.filter(r => r < stock.returns[key]).length;
      const rsRating = Math.round((betterThan / allReturns.length) * 99);
      return { ...stock, rsRating, currentReturn: stock.returns[key] };
    }).sort((a, b) => b.rsRating - a.rsRating);
    setFilteredStocks(filtered);
  };

  const saveTelegramSettings = () => {
    if (!telegramBotToken || !telegramChatId) {
      alert('請填寫完整的 Bot Token 和 Chat ID');
      return;
    }
    localStorage.setItem('telegramBotToken', telegramBotToken);
    localStorage.setItem('telegramChatId', telegramChatId);
    alert('Telegram 設定已儲存！');
    setShowTelegramSetup(false);
  };

  const addToWatchList = (stock) => {
    if (!watchList.find(s => s.code === stock.code)) {
      const newList = [...watchList, stock];
      setWatchList(newList);
      localStorage.setItem('watchList', JSON.stringify(newList));
    }
  };

  const removeFromWatchList = (code) => {
    const newList = watchList.filter(s => s.code !== code);
    setWatchList(newList);
    localStorage.setItem('watchList', JSON.stringify(newList));
  };

  const sendTelegramMessage = async (message) => {
    if (!telegramBotToken || !telegramChatId) {
      alert('請先設定 Telegram Bot');
      setShowTelegramSetup(true);
      return;
    }
    try {
      const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: telegramChatId, text: message, parse_mode: 'HTML' })
      });
      const data = await response.json();
      if (data.ok) {
        alert('✅ 通知已發送！');
      } else {
        alert('❌ 發送失敗：' + (data.description || '請檢查設定'));
      }
    } catch (error) {
      alert('❌ 發送失敗');
    }
  };

  const sendTopStocks = () => {
    const top10 = filteredStocks.slice(0, 10);
    let message = `📊 <b>台股 RS Rating Top 10</b>\n<i>${period} 排名</i>\n\n`;
    top10.forEach((stock, index) => {
      message += `${index + 1}. <b>${stock.name}(${stock.code})</b>\n   RS: ${stock.rsRating} | NT$ ${stock.price.toFixed(2)}\n   報酬: ${stock.currentReturn >= 0 ? '+' : ''}${stock.currentReturn.toFixed(2)}%\n\n`;
    });
    sendTelegramMessage(message);
  };

  const industries = ['全部', ...new Set(stocks.map(s => s.industry))].sort();

  const getRSColor = (rating) => {
    if (rating >= 80) return 'text-green-600 font-bold';
    if (rating >= 60) return 'text-blue-600';
    if (rating >= 40) return 'text-gray-600';
    return 'text-red-600';
  };

  const getRSBgColor = (rating) => {
    if (rating >= 80) return 'bg-green-100';
    if (rating >= 60) return 'bg-blue-100';
    if (rating >= 40) return 'bg-gray-100';
    return 'bg-red-100';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {showInfo && (
          <div className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg shadow-lg p-4 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <Info className="w-6 h-6 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg mb-1">✨ 台股 RS Rating 監控 + Telegram 通知！</h3>
                  <p className="text-sm text-blue-100">
                    {useRealData 
                      ? '資料來源：台灣證券交易所（交易日盤後更新）' 
                      : '⚠️ 目前使用模擬資料，點擊上方切換按鈕使用真實資料'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowInfo(false)} className="text-white hover:text-blue-200 text-xl">×</button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-4 md:p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-indigo-600 flex-shrink-0" />
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">台灣股市 RS Rating 監控系統</h1>
                <p className="text-gray-600 text-sm mt-1">威廉歐尼爾方法 · Telegram 通知</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowTelegramSetup(!showTelegramSetup)} className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
                <Send className="w-4 h-4" />
                Telegram
              </button>
              <button onClick={() => setShowDebugInfo(!showDebugInfo)} className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300">
                {showDebugInfo ? '隱藏' : '顯示'}除錯
              </button>
              <button 
                onClick={() => {
                  setUseRealData(!useRealData);
                  setTimeout(() => loadStockData(), 100);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${useRealData ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}
              >
                {useRealData ? '真實資料' : '模擬資料'}
              </button>
              <button onClick={loadStockData} disabled={loading} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                重新整理
              </button>
            </div>
          </div>
        </div>

        {showTelegramSetup && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-500" />
              Telegram Bot 設定
            </h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h4 className="font-semibold text-blue-900 mb-2">📝 設定步驟：</h4>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>在 Telegram 搜尋 @BotFather，發送 /newbot</li>
                <li>複製 Bot Token</li>
                <li>開啟您的 Bot，發送 /start</li>
                <li>瀏覽器開啟：https://api.telegram.org/bot您的TOKEN/getUpdates</li>
                <li>找到 chat id 數字</li>
              </ol>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Bot Token</label>
                <input type="text" value={telegramBotToken} onChange={(e) => setTelegramBotToken(e.target.value)} placeholder="123456:ABC-DEF..." className="w-full border rounded-lg px-3 py-2 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Chat ID</label>
                <input type="text" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} placeholder="123456789" className="w-full border rounded-lg px-3 py-2 font-mono text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={saveTelegramSettings} className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">💾 儲存</button>
                <button onClick={() => sendTelegramMessage('✅ 測試通知成功！')} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">🧪 測試</button>
                <button onClick={sendTopStocks} className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">📊 Top 10</button>
              </div>
            </div>
            {watchList.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold mb-2">監控清單 ({watchList.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {watchList.map(stock => (
                    <span key={stock.code} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                      {stock.name} ({stock.code})
                      <button onClick={() => removeFromWatchList(stock.code)} className="text-red-600 font-bold">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              <span className="text-gray-700 font-medium">正在載入台股資料...</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${loadingProgress}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-800">載入失敗</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <p className="text-sm text-red-600 mt-2">已自動切換至模擬資料模式</p>
                <button 
                  onClick={() => {
                    setError(null);
                    setUseRealData(true);
                    loadStockData();
                  }}
                  className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700"
                >
                  重試真實資料
                </button>
              </div>
            </div>
          </div>
        )}

        {stocks.length > 0 && (
          <>
            {showDebugInfo && rawApiData && (
              <div className="bg-gray-900 text-green-400 rounded-lg p-4 mb-6 font-mono text-xs overflow-x-auto">
                <h3 className="text-white font-bold mb-2">🔍 API 原始資料（除錯用）</h3>
                <div className="mb-2">
                  <strong className="text-yellow-400">API 類型:</strong> {Array.isArray(rawApiData) ? 'OpenAPI (JSON物件陣列)' : '舊版API'}
                </div>
                <div className="mb-2">
                  <strong className="text-yellow-400">第一筆資料:</strong>
                  <pre>{JSON.stringify(rawApiData?.[0], null, 2)}</pre>
                </div>
                <div>
                  <strong className="text-yellow-400">解析結果 (台積電 2330):</strong>
                  <pre>{JSON.stringify(stocks.find(s => s.code === '2330'), null, 2)}</pre>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-lg p-4 md:p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-5 h-5 text-gray-600" />
                <h2 className="text-xl font-semibold text-gray-800">篩選條件</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">計算週期</label>
                  <select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                    <option>1週</option>
                    <option>1個月</option>
                    <option>3個月</option>
                    <option>6個月</option>
                    <option>1年</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">產業</label>
                  <select value={selectedIndustry} onChange={(e) => setSelectedIndustry(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                    {industries.map(ind => <option key={ind}>{ind}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">最低股價</label>
                  <input type="number" value={priceRange.min} onChange={(e) => setPriceRange({...priceRange, min: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">最高股價</label>
                  <input type="number" value={priceRange.max} onChange={(e) => setPriceRange({...priceRange, max: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">搜尋</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="代號或名稱" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-white rounded-lg shadow p-3">
                <p className="text-xs text-gray-600">符合條件</p>
                <p className="text-2xl font-bold text-indigo-600">{filteredStocks.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-3">
                <p className="text-xs text-gray-600">RS ≥ 80</p>
                <p className="text-2xl font-bold text-green-600">{filteredStocks.filter(s => s.rsRating >= 80).length}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-3">
                <p className="text-xs text-gray-600">RS 60-79</p>
                <p className="text-2xl font-bold text-blue-600">{filteredStocks.filter(s => s.rsRating >= 60 && s.rsRating < 80).length}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-3">
                <p className="text-xs text-gray-600">平均 RS</p>
                <p className="text-2xl font-bold text-gray-800">{filteredStocks.length > 0 ? Math.round(filteredStocks.reduce((sum, s) => sum + s.rsRating, 0) / filteredStocks.length) : 0}</p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
                    <tr>
                      <th className="px-3 py-3 text-left text-sm">排名</th>
                      <th className="px-3 py-3 text-left text-sm">代號 / 名稱</th>
                      <th className="px-3 py-3 text-left text-sm hidden md:table-cell">產業</th>
                      <th className="px-3 py-3 text-right text-sm">股價 (NT$)</th>
                      <th className="px-3 py-3 text-center text-sm">RS</th>
                      <th className="px-3 py-3 text-right text-sm hidden sm:table-cell">報酬</th>
                      <th className="px-3 py-3 text-center text-sm">監控</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStocks.slice(0, 100).map((stock, index) => (
                      <tr key={stock.code} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-3"><span className="font-semibold text-gray-700 text-sm">#{index + 1}</span></td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <span className="font-mono text-sm font-bold text-indigo-600">{stock.code}</span>
                            <span className="text-sm text-gray-700">{stock.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell"><span className="px-2 py-1 bg-gray-100 rounded text-xs">{stock.industry}</span></td>
                        <td className="px-3 py-3 text-right font-semibold text-sm">NT$ {stock.price.toFixed(2)}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${getRSBgColor(stock.rsRating)} ${getRSColor(stock.rsRating)}`}>{stock.rsRating}</span>
                        </td>
                        <td className={`px-3 py-3 text-right font-semibold text-sm hidden sm:table-cell ${stock.currentReturn >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {stock.currentReturn >= 0 ? '+' : ''}{stock.currentReturn.toFixed(2)}%
                        </td>
                        <td className="px-3 py-3 text-center">
                          {watchList.find(s => s.code === stock.code) ? (
                            <button onClick={() => removeFromWatchList(stock.code)} className="text-yellow-600 hover:text-yellow-800"><Bell className="w-4 h-4" /></button>
                          ) : (
                            <button onClick={() => addToWatchList(stock)} className="text-gray-400 hover:text-indigo-600"><BellOff className="w-4 h-4" /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredStocks.length > 100 && (
                <div className="bg-gray-50 px-4 py-3 text-center text-sm text-gray-600">顯示前 100 筆，共 {filteredStocks.length} 筆</div>
              )}
              {filteredStocks.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-500"><p className="text-lg">查無符合條件的股票</p></div>
              )}
            </div>
          </>
        )}

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">💡 使用說明</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• 資料來源：{useRealData ? '台灣證券交易所（交易日盤後更新）' : '模擬資料（用於測試功能）'}</li>
            <li>• RS Rating：0-99 評分，數字越高表現越強</li>
            <li>• Telegram：設定後可接收通知</li>
            <li>• 點擊鈴鐺加入監控清單</li>
            {useRealData && <li>• ⚠️ 週末及國定假日證交所無資料，可切換模擬資料測試</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TWStockRSMonitor;
