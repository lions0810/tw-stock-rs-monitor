import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Filter, RefreshCw, Info, AlertCircle, Loader2, Bell, BellOff, Send } from 'lucide-react';

// 台股產業分類對照
const INDUSTRY_MAP = {
  '01': '水泥工業', '02': '食品工業', '03': '塑膠工業', '04': '紡織纖維',
  '05': '電機機械', '06': '電器電纜', '08': '玻璃陶瓷', '09': '造紙工業',
  '10': '鋼鐵工業', '11': '橡膠工業', '12': '汽車工業', '14': '建材營造',
  '15': '航運業', '16': '觀光事業', '17': '金融保險', '18': '貿易百貨',
  '20': '其他', '21': '化學工業', '22': '生技醫療', '23': '油電燃氣',
  '24': '半導體業', '25': '電腦及週邊', '26': '光電業', '27': '通信網路',
  '28': '電子零組件', '29': '電子通路', '30': '資訊服務', '31': '其他電子'
};

// 從證交所抓取當日資料
const fetchTWSEData = async () => {
  const today = new Date();
  const dateStr = today.getFullYear() + 
    String(today.getMonth() + 1).padStart(2, '0') + 
    String(today.getDate()).padStart(2, '0');
  
  const url = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${dateStr}&type=ALLBUT0999&response=json`;
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.stat !== 'OK') throw new Error('無法取得資料，可能非交易日');
  return data;
};

// 抓取個股歷史資料
const fetchStockHistory = async (stockNo, months = 12) => {
  const prices = [];
  const today = new Date();
  
  for (let i = 0; i <= months; i++) {
    const date = new Date(today);
    date.setMonth(date.getMonth() - i);
    
    const dateStr = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + '01';
    const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${dateStr}&stockNo=${stockNo}&response=json`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.stat === 'OK' && data.data) {
        data.data.forEach(row => {
          const closePrice = parseFloat(row[6].replace(/,/g, ''));
          if (!isNaN(closePrice)) {
            prices.push({
              date: row[0],
              price: closePrice
            });
          }
        });
      }
    } catch (e) {
      console.log(`無法取得 ${stockNo} 月份資料`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return prices.sort((a, b) => {
    const dateA = a.date.split('/').map(Number);
    const dateB = b.date.split('/').map(Number);
    return dateA[0] - dateB[0] || dateA[1] - dateB[1] || dateA[2] - dateB[2];
  });
};

// 計算期間報酬率
const calculateReturn = (prices, days) => {
  if (!prices || prices.length < 2) return 0;
  
  const latest = prices[prices.length - 1].price;
  const targetIndex = Math.max(0, prices.length - days - 1);
  const past = prices[targetIndex].price;
  
  return ((latest - past) / past) * 100;
};

// 計算威廉歐尼爾 RS Rating
const calculateRSRating = (stockReturn, allReturns) => {
  const betterThan = allReturns.filter(r => r < stockReturn).length;
  return Math.round((betterThan / allReturns.length) * 99);
};

const TWStockRSMonitor = () => {
  const [stocks, setStocks] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [selectedIndustry, setSelectedIndustry] = useState('全部');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 10000 });
  const [period, setPeriod] = useState('3個月');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showInfo, setShowInfo] = useState(true);
  const [showTelegramSetup, setShowTelegramSetup] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [watchList, setWatchList] = useState([]);
  const [alertConditions, setAlertConditions] = useState({
    rsThreshold: 80,
    priceChangeThreshold: 5
  });

  useEffect(() => {
    loadRealStockData();
    // 從 localStorage 載入設定
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

  const loadRealStockData = async () => {
    setLoading(true);
    setError(null);
    setLoadingProgress(0);
    
    try {
      setLoadingProgress(10);
      const todayData = await fetchTWSEData();
      
      if (!todayData.data9 || todayData.data9.length === 0) {
        throw new Error('今日可能非交易日，請稍後再試');
      }
      
      setLoadingProgress(30);
      
      const stockList = todayData.data9.map(row => {
        const code = row[0].trim();
        const name = row[1].trim();
        const closePrice = parseFloat(row[8].replace(/,/g, '') || 0);
        const change = parseFloat(row[10].replace(/,/g, '') || 0);
        const changePercent = parseFloat(row[11].replace(/,/g, '') || 0);
        const volume = parseFloat(row[2].replace(/,/g, '') || 0);
        const industryCode = code.substring(0, 2);
        
        return {
          code,
          name,
          price: closePrice,
          change,
          changePercent,
          volume,
          industry: INDUSTRY_MAP[industryCode] || '其他',
          hasDetailData: false,
          returns: {
            week1: changePercent,
            month1: changePercent * 4,
            month3: changePercent * 12,
            month6: changePercent * 24,
            year1: changePercent * 48
          }
        };
      }).filter(stock => stock.price > 0 && stock.code.length === 4);
      
      setLoadingProgress(100);
      setStocks(stockList);
      
    } catch (err) {
      console.error('載入資料失敗:', err);
      setError(err.message || '無法載入台股資料');
    } finally {
      setLoading(false);
    }
  };

  const loadDetailData = async () => {
    if (filteredStocks.length === 0) return;
    
    setLoadingDetail(true);
    const topStocks = filteredStocks.slice(0, 50);
    let processed = 0;
    
    for (const stock of topStocks) {
      try {
        const history = await fetchStockHistory(stock.code, 12);
        
        if (history.length > 0) {
          const returns = {
            week1: calculateReturn(history, 5),
            month1: calculateReturn(history, 22),
            month3: calculateReturn(history, 66),
            month6: calculateReturn(history, 132),
            year1: calculateReturn(history, 264)
          };
          
          setStocks(prev => prev.map(s => 
            s.code === stock.code 
              ? { ...s, returns, hasDetailData: true, history }
              : s
          ));
        }
        
        processed++;
        setLoadingProgress(Math.round((processed / topStocks.length) * 100));
        
      } catch (e) {
        console.log(`無法載入 ${stock.code} 詳細資料`);
      }
    }
    
    setLoadingDetail(false);
  };

  const filterStocks = () => {
    let filtered = [...stocks];

    if (selectedIndustry !== '全部') {
      filtered = filtered.filter(s => s.industry === selectedIndustry);
    }

    filtered = filtered.filter(s => s.price >= priceRange.min && s.price <= priceRange.max);

    if (searchTerm) {
      filtered = filtered.filter(s => 
        s.code.includes(searchTerm) || s.name.includes(searchTerm)
      );
    }

    const periodMap = {
      '1週': 'week1',
      '1個月': 'month1',
      '3個月': 'month3',
      '6個月': 'month6',
      '1年': 'year1'
    };
    
    const key = periodMap[period];
    const allReturns = filtered.map(s => s.returns[key]);
    
    filtered = filtered.map(stock => ({
      ...stock,
      rsRating: calculateRSRating(stock.returns[key], allReturns),
      currentReturn: stock.returns[key]
    })).sort((a, b) => b.rsRating - a.rsRating);

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
      alert('請先設定 Telegram Bot Token 和 Chat ID');
      setShowTelegramSetup(true);
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: message,
          parse_mode: 'HTML'
        })
      });

      const data = await response.json();
      
      if (data.ok) {
        alert('✅ Telegram 通知已發送！');
        return true;
      } else {
        alert('❌ 發送失敗：' + (data.description || '請檢查 Token 和 Chat ID'));
        return false;
      }
    } catch (error) {
      console.error('發送通知失敗:', error);
      alert('❌ 發送失敗，請檢查網路連線');
      return false;
    }
  };

  const checkAndNotify = () => {
    const alerts = [];
    
    watchList.forEach(watchStock => {
      const current = stocks.find(s => s.code === watchStock.code);
      if (!current) return;
      
      if (current.rsRating >= alertConditions.rsThreshold) {
        alerts.push(`📈 <b>${current.name}(${current.code})</b>\nRS Rating: ${current.rsRating}\n股價: $${current.price.toFixed(2)}`);
      }
      
      if (Math.abs(current.changePercent) >= alertConditions.priceChangeThreshold) {
        const emoji = current.changePercent > 0 ? '🔴' : '🟢';
        alerts.push(`${emoji} <b>${current.name}(${current.code})</b>\n漲跌: ${current.changePercent.toFixed(2)}%\n股價: $${current.price.toFixed(2)}`);
      }
    });
    
    if (alerts.length > 0) {
      const message = '🔔 <b>台股警示通知</b>\n\n' + alerts.join('\n\n');
      sendTelegramMessage(message);
    } else {
      alert('目前沒有符合條件的警示');
    }
  };

  const sendTopStocks = () => {
    const top10 = filteredStocks.slice(0, 10);
    let message = '📊 <b>台股 RS Rating Top 10</b>\n';
    message += `<i>${period} 排名</i>\n\n`;
    
    top10.forEach((stock, index) => {
      message += `${index + 1}. <b>${stock.name}(${stock.code})</b>\n`;
      message += `   RS: ${stock.rsRating} | 股價: $${stock.price.toFixed(2)}\n`;
      message += `   報酬: ${stock.currentReturn >= 0 ? '+' : ''}${stock.currentReturn.toFixed(2)}%\n\n`;
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
                  <h3 className="font-bold text-lg mb-1">✨ 已串接真實台股資料 + Telegram 通知！</h3>
                  <p className="text-sm text-blue-100">
                    資料來源：台灣證券交易所。支援完整歷史資料分析與 Telegram Bot 警示通知。
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
                <p className="text-gray-600 text-sm mt-1">威廉歐尼爾方法 · 完整歷史資料 · Telegram 通知</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTelegramSetup(!showTelegramSetup)}
                className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
              >
                <Send className="w-4 h-4" />
                Telegram
              </button>
              <button
                onClick={loadRealStockData}
                disabled={loading}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
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
              <h4 className="font-semibold text-blue-900 mb-2">📝 如何設定 Telegram Bot：</h4>
              <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                <li>
                  <strong>建立 Bot：</strong>
                  <ul className="ml-6 mt-1 space-y-1">
                    <li>• 在 Telegram 搜尋 <code className="bg-blue-100 px-1 rounded">@BotFather</code></li>
                    <li>• 發送 <code className="bg-blue-100 px-1 rounded">/newbot</code></li>
                    <li>• 設定 Bot 名稱和使用者名稱</li>
                    <li>• 複製取得的 <strong>Bot Token</strong></li>
                  </ul>
                </li>
                <li>
                  <strong>取得 Chat ID：</strong>
                  <ul className="ml-6 mt-1 space-y-1">
                    <li>• 搜尋並開啟你剛建立的 Bot</li>
                    <li>• 發送任意訊息給 Bot（例如：<code className="bg-blue-100 px-1 rounded">/start</code>）</li>
                    <li>• 在瀏覽器開啟：<code className="bg-blue-100 px-1 rounded text-xs">https://api.telegram.org/bot你的TOKEN/getUpdates</code></li>
                    <li>• 找到 <code className="bg-blue-100 px-1 rounded">"chat":{"id":數字}</code>，複製該數字</li>
                  </ul>
                </li>
              </ol>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Bot Token</label>
                <input
                  type="text"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder="例如：123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  className="w-full border rounded-lg px-3 py-2 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Chat ID</label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="例如：123456789"
                  className="w-full border rounded-lg px-3 py-2 font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">最高股價</label>
                  <input type="number" value={priceRange.max} onChange={(e) => setPriceRange({...priceRange, max: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">搜尋股票代號或名稱</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="例如：2330 或 台積電"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
              <div className="bg-white rounded-lg shadow p-3 md:p-4">
                <p className="text-xs md:text-sm text-gray-600">符合條件</p>
                <p className="text-xl md:text-2xl font-bold text-indigo-600">{filteredStocks.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-3 md:p-4">
                <p className="text-xs md:text-sm text-gray-600">RS ≥ 80 (強勢)</p>
                <p className="text-xl md:text-2xl font-bold text-green-600">
                  {filteredStocks.filter(s => s.rsRating >= 80).length}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow p-3 md:p-4">
                <p className="text-xs md:text-sm text-gray-600">RS 60-79 (中強)</p>
                <p className="text-xl md:text-2xl font-bold text-blue-600">
                  {filteredStocks.filter(s => s.rsRating >= 60 && s.rsRating < 80).length}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow p-3 md:p-4">
                <p className="text-xs md:text-sm text-gray-600">平均 RS</p>
                <p className="text-xl md:text-2xl font-bold text-gray-800">
                  {filteredStocks.length > 0 
                    ? Math.round(filteredStocks.reduce((sum, s) => sum + s.rsRating, 0) / filteredStocks.length)
                    : 0}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
                    <tr>
                      <th className="px-3 md:px-4 py-3 text-left text-sm">排名</th>
                      <th className="px-3 md:px-4 py-3 text-left text-sm">代號</th>
                      <th className="px-3 md:px-4 py-3 text-left text-sm">名稱</th>
                      <th className="px-3 md:px-4 py-3 text-left text-sm hidden md:table-cell">產業</th>
                      <th className="px-3 md:px-4 py-3 text-right text-sm">股價</th>
                      <th className="px-3 md:px-4 py-3 text-center text-sm">RS</th>
                      <th className="px-3 md:px-4 py-3 text-right text-sm hidden sm:table-cell">報酬率</th>
                      <th className="px-3 md:px-4 py-3 text-center text-sm">監控</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStocks.slice(0, 100).map((stock, index) => (
                      <tr key={stock.code} className="border-b hover:bg-gray-50">
                        <td className="px-3 md:px-4 py-3">
                          <span className="font-semibold text-gray-700 text-sm">#{index + 1}</span>
                        </td>
                        <td className="px-3 md:px-4 py-3 font-mono text-sm font-semibold">{stock.code}</td>
                        <td className="px-3 md:px-4 py-3 text-sm">{stock.name}</td>
                        <td className="px-3 md:px-4 py-3 hidden md:table-cell">
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs">{stock.industry}</span>
                        </td>
                        <td className="px-3 md:px-4 py-3 text-right font-semibold text-sm">${stock.price.toFixed(2)}</td>
                        <td className="px-3 md:px-4 py-3 text-center">
                          <span className={`px-2 md:px-3 py-1 rounded-full text-xs md:text-sm font-bold ${getRSBgColor(stock.rsRating)} ${getRSColor(stock.rsRating)}`}>
                            {stock.rsRating}
                          </span>
                          {stock.hasDetailData && <span className="text-xs text-green-600 ml-1">✓</span>}
                        </td>
                        <td className={`px-3 md:px-4 py-3 text-right font-semibold text-sm hidden sm:table-cell ${stock.currentReturn >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {stock.currentReturn >= 0 ? '+' : ''}{stock.currentReturn.toFixed(2)}%
                        </td>
                        <td className="px-3 md:px-4 py-3 text-center">
                          {watchList.find(s => s.code === stock.code) ? (
                            <button onClick={() => removeFromWatchList(stock.code)} className="text-yellow-600 hover:text-yellow-800">
                              <Bell className="w-4 h-4" />
                            </button>
                          ) : (
                            <button onClick={() => addToWatchList(stock)} className="text-gray-400 hover:text-indigo-600">
                              <BellOff className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {filteredStocks.length > 100 && (
                <div className="bg-gray-50 px-4 py-3 text-center text-sm text-gray-600">
                  顯示前 100 筆，共 {filteredStocks.length} 筆符合條件
                </div>
              )}
              
              {filteredStocks.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg">查無符合條件的股票</p>
                  <p className="text-sm mt-2">請調整篩選條件</p>
                </div>
              )}
            </div>
          </>
        )}

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">💡 使用說明</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• 資料來源：台灣證券交易所公開資訊，每日盤後更新</li>
            <li>• RS Rating：相對強度評分 0-99，數字越高代表相對表現越強</li>
            <li>• RS ≥ 80：強勢股，表現優於 80% 以上的股票</li>
            <li>• Telegram 通知：設定 Bot 後可接收即時警示</li>
            <li>• 點擊鈴鐺圖示將股票加入監控清單</li>
            <li>• 週末及國定假日證交所無資料，請於交易日使用</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TWStockRSMonitor; font-medium mb-2">RS 警示門檻</label>
                  <input
                    type="number"
                    value={alertConditions.rsThreshold}
                    onChange={(e) => setAlertConditions({...alertConditions, rsThreshold: Number(e.target.value)})}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">漲跌幅警示 (%)</label>
                  <input
                    type="number"
                    value={alertConditions.priceChangeThreshold}
                    onChange={(e) => setAlertConditions({...alertConditions, priceChangeThreshold: Number(e.target.value)})}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button onClick={saveTelegramSettings} className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
                  💾 儲存設定
                </button>
                <button onClick={() => sendTelegramMessage('✅ 測試通知成功！\n您的 Telegram Bot 已正確設定。')} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                  🧪 測試通知
                </button>
                <button onClick={checkAndNotify} className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700">
                  🔔 檢查警示
                </button>
                <button onClick={sendTopStocks} className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">
                  📊 發送 Top 10
                </button>
              </div>
            </div>

            {watchList.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold mb-2">📌 監控清單 ({watchList.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {watchList.map(stock => (
                    <span key={stock.code} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                      {stock.name} ({stock.code})
                      <button onClick={() => removeFromWatchList(stock.code)} className="text-red-600 hover:text-red-800 font-bold">×</button>
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
              <div>
                <h3 className="font-semibold text-red-800">載入失敗</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {stocks.length > 0 && (
          <>
            {!loadingDetail && filteredStocks.length > 0 && (
              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold">📊 載入完整歷史資料</h3>
                    <p className="text-sm text-purple-100 mt-1">取得更準確的 RS Rating 計算（前50檔股票，需要數分鐘）</p>
                  </div>
                  <button
                    onClick={loadDetailData}
                    className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-semibold hover:bg-purple-50"
                  >
                    開始載入
                  </button>
                </div>
              </div>
            )}

            {loadingDetail && (
              <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                  <span className="text-gray-700 font-medium">正在載入歷史資料... 這需要幾分鐘</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-purple-600 h-2 rounded-full transition-all" style={{ width: `${loadingProgress}%` }} />
                </div>
                <p className="text-sm text-gray-500 mt-2">已處理 {Math.round(loadingProgress)}%</p>
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
                  <select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500">
                    <option>1週</option>
                    <option>1個月</option>
                    <option>3個月</option>
                    <option>6個月</option>
                    <option>1年</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">產業</label>
                  <select value={selectedIndustry} onChange={(e) => setSelectedIndustry(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500">
                    {industries.map(ind => <option key={ind}>{ind}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">最低股價</label>
                  <input type="number" value={priceRange.min} onChange={(e) => setPriceRange({...priceRange, min: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                </div>

                <div>
                  <label className="block text-sm
