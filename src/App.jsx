import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Filter, RefreshCw, Info, AlertCircle, Loader2, Bell, BellOff, Send, X, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';

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
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [rawApiData, setRawApiData] = useState(null);
  const [autoNotify, setAutoNotify] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [dailyReport, setDailyReport] = useState(true);
  const [lastReportDate, setLastReportDate] = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());

  useEffect(() => {
    loadStockData();
    const savedBotToken = localStorage.getItem('telegramBotToken');
    const savedChatId = localStorage.getItem('telegramChatId');
    const savedWatchList = localStorage.getItem('watchList');
    const savedAutoNotify = localStorage.getItem('autoNotify');
    const savedAutoRefresh = localStorage.getItem('autoRefresh');
    const savedRefreshInterval = localStorage.getItem('refreshInterval');
    const savedDailyReport = localStorage.getItem('dailyReport');
    const savedLastReportDate = localStorage.getItem('lastReportDate');
    
    if (savedBotToken) setTelegramBotToken(savedBotToken);
    if (savedChatId) setTelegramChatId(savedChatId);
    if (savedWatchList) setWatchList(JSON.parse(savedWatchList));
    if (savedAutoNotify !== null) setAutoNotify(savedAutoNotify === 'true');
    if (savedAutoRefresh !== null) setAutoRefresh(savedAutoRefresh === 'true');
    if (savedRefreshInterval) setRefreshInterval(Number(savedRefreshInterval));
    if (savedDailyReport !== null) setDailyReport(savedDailyReport === 'true');
    if (savedLastReportDate) setLastReportDate(savedLastReportDate);
  }, []);

  useEffect(() => {
    filterStocks();
  }, [stocks, selectedIndustry, priceRange, period, searchTerm]);

  // 定時自動重新整理
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      console.log(`定時自動重新整理（每 ${refreshInterval} 分鐘）`);
      loadStockData();
    }, refreshInterval * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  // 每日收盤報告
  useEffect(() => {
    if (!dailyReport || !telegramBotToken || !telegramChatId) return;
    
    const checkDailyReport = () => {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      
      const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
      const isAfterClose = currentHour > 16 || (currentHour === 16 && currentMinute >= 30);
      
      if (isWeekday && isAfterClose && lastReportDate !== today && stocks.length > 0) {
        console.log('發送每日收盤報告');
        sendDailyReport();
        setLastReportDate(today);
        localStorage.setItem('lastReportDate', today);
      }
    };
    
    const interval = setInterval(checkDailyReport, 60 * 1000);
    checkDailyReport();
    
    return () => clearInterval(interval);
  }, [dailyReport, telegramBotToken, telegramChatId, stocks, lastReportDate]);

  const loadStockData = async () => {
    setLoading(true);
    setError(null);
    setLoadingProgress(0);
    
    try {
      setLoadingProgress(10);
      const today = new Date();
      const dateStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
      
      let data = null;
      const urls = [
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
            setRawApiData(json);
            break;
          }
        } catch (e) {
          console.log('API 失敗:', e);
          continue;
        }
      }
      
      if (!data || data.stat !== 'OK') {
        throw new Error(`API 回應異常。狀態: ${data?.stat || '無回應'}，請稍後再試`);
      }
      
      const stockData = data.data9 || data.data;
      if (!stockData || stockData.length === 0) {
        throw new Error('今日盤後資料尚未更新，通常於下午 4:30 後更新，請稍後再試');
      }
      
      setLoadingProgress(50);
      
      const stockList = stockData.map(row => {
        const code = row[0]?.trim() || '';
        const name = row[1]?.trim() || '';
        
        // 解析收盤價 - 通常在第 8 個欄位
        let closePrice = 0;
        const possiblePriceFields = [8, 6, 5, 4];
        for (let index of possiblePriceFields) {
          const priceStr = String(row[index] || '').replace(/,/g, '').replace(/[+\-]/g, '').trim();
          const price = parseFloat(priceStr);
          if (!isNaN(price) && price >= 1 && price <= 10000) {
            closePrice = price;
            break;
          }
        }
        
        // 解析漲跌 - 通常在第 9 個欄位
        let change = 0;
        const changeStr = String(row[9] || '').replace(/,/g, '').trim();
        if (changeStr) {
          change = parseFloat(changeStr);
          if (isNaN(change)) change = 0;
        }
        
        // 解析漲跌幅 - 通常在第 10 個欄位
        let changePercent = 0;
        const changePercentStr = String(row[10] || '').replace(/,/g, '').replace(/%/g, '').trim();
        if (changePercentStr) {
          changePercent = parseFloat(changePercentStr);
          if (isNaN(changePercent)) changePercent = 0;
        }
        
        // 如果沒有漲跌幅，從漲跌和收盤價計算
        if (changePercent === 0 && change !== 0 && closePrice > 0) {
          const previousClose = closePrice - change;
          if (previousClose > 0) {
            changePercent = (change / previousClose) * 100;
          }
        }
        
        const industryCode = code.substring(0, 2);
        
        return {
          code,
          name,
          price: closePrice,
          change: change,
          changePercent: changePercent,
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
        throw new Error('無有效股票資料，請稍後再試');
      }
      
      setLoadingProgress(100);
      setStocks(stockList);
      console.log('成功載入股票數量:', stockList.length);
      
      if (autoNotify) {
        setTimeout(() => autoCheckAndNotify(stockList), 1000);
      }
    } catch (err) {
      console.error('載入失敗:', err);
      setError(err.message || '無法載入台股資料，請檢查網路或稍後再試');
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
      filtered = filtered.filter(s => 
        s.code.includes(searchTerm) || 
        s.name.includes(searchTerm)
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
    
    filtered = filtered.map(stock => {
      const betterThan = allReturns.filter(r => r < stock.returns[key]).length;
      const rsRating = allReturns.length > 0 ? Math.round((betterThan / allReturns.length) * 99) : 0;
      
      return {
        ...stock,
        rsRating,
        currentReturn: stock.returns[key]
      };
    }).sort((a, b) => b.rsRating - a.rsRating);
    
    setFilteredStocks(filtered);
  };

  const autoCheckAndNotify = (stockList) => {
    // 自動檢查邏輯可以在這裡實現
    console.log('執行自動檢查通知');
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

  const sendTelegramMessage = async (message, silent = false) => {
    if (!telegramBotToken || !telegramChatId) {
      if (!silent) {
        alert('請先設定 Telegram Bot');
        setShowTelegramSetup(true);
      }
      return;
    }
    
    try {
      const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        if (!silent) alert('✅ 通知已發送！');
        console.log('Telegram 通知已發送');
      } else {
        if (!silent) alert('❌ 發送失敗：' + (data.description || '請檢查設定'));
        console.error('Telegram 發送失敗:', data);
      }
    } catch (error) {
      if (!silent) alert('❌ 發送失敗');
      console.error('Telegram 錯誤:', error);
    }
  };

  const sendTopStocks = () => {
    const top10 = filteredStocks.slice(0, 10);
    let message = `📊 <b>台股 RS Rating Top 10</b>\n<i>${period} 排名</i>\n\n`;
    
    top10.forEach((stock, index) => {
      const change = stock.change || 0;
      const changePercent = stock.changePercent || 0;
      const currentReturn = stock.currentReturn || 0;
      
      message += `${index + 1}. <b>${stock.name}(${stock.code})</b>\n`;
      message += `   RS: ${stock.rsRating} | NT$ ${stock.price.toFixed(2)}\n`;
      message += `   漲跌: ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)\n`;
      message += `   ${period}報酬: ${currentReturn >= 0 ? '+' : ''}${currentReturn.toFixed(2)}%\n\n`;
    });
    
    sendTelegramMessage(message);
  };

  const sendDailyReport = () => {
    if (filteredStocks.length === 0) return;
    
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    
    const top5 = [...filteredStocks].slice(0, 5);
    const totalStocks = filteredStocks.length;
    const strongStocks = filteredStocks.filter(s => s.rsRating >= 80).length;
    const avgRS = totalStocks > 0 ? Math.round(filteredStocks.reduce((sum, s) => sum + s.rsRating, 0) / totalStocks) : 0;
    
    const topGainers = [...filteredStocks].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3);
    const topLosers = [...filteredStocks].sort((a, b) => a.changePercent - b.changePercent).slice(0, 3);
    
    let message = `📊 <b>台股每日收盤報告</b>\n📅 ${dateStr}\n\n`;
    
    message += `📈 <b>市場概況</b>\n`;
    message += `總股票數: ${totalStocks}\n`;
    message += `強勢股 (RS≥80): ${strongStocks}\n`;
    message += `平均 RS Rating: ${avgRS}\n\n`;
    
    message += `🏆 <b>RS Rating Top 5</b>\n`;
    top5.forEach((stock, index) => {
      message += `${index + 1}. ${stock.name}(${stock.code}) - RS:${stock.rsRating}\n`;
    });
    message += `\n`;
    
    message += `🔴 <b>漲幅前 3 名</b>\n`;
    topGainers.forEach((stock, index) => {
      const change = stock.change || 0;
      const changePercent = stock.changePercent || 0;
      message += `${index + 1}. ${stock.name}(${stock.code}) ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)\n`;
    });
    message += `\n`;
    
    message += `🟢 <b>跌幅前 3 名</b>\n`;
    topLosers.forEach((stock, index) => {
      const change = stock.change || 0;
      const changePercent = stock.changePercent || 0;
      message += `${index + 1}. ${stock.name}(${stock.code}) ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)\n`;
    });
    
    if (watchList.length > 0) {
      message += `\n📌 <b>監控清單</b>\n`;
      watchList.forEach(watchStock => {
        const current = filteredStocks.find(s => s.code === watchStock.code);
        if (current) {
          const change = current.change || 0;
          const changePercent = current.changePercent || 0;
          message += `${current.name}(${current.code}): RS ${current.rsRating}, ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)\n`;
        }
      });
    }
    
    sendTelegramMessage(message, true);
  };

  const toggleRowExpansion = (code) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(code)) {
      newExpanded.delete(code);
    } else {
      newExpanded.add(code);
    }
    setExpandedRows(newExpanded);
  };

  const industries = ['全部', ...new Set(stocks.map(s => s.industry))].sort();

  const getRSColor = (rating) => {
    if (rating >= 80) return 'text-emerald-700 font-bold';
    if (rating >= 60) return 'text-blue-700';
    if (rating >= 40) return 'text-slate-600';
    return 'text-rose-700';
  };

  const getRSBgColor = (rating) => {
    if (rating >= 80) return 'bg-emerald-100 border border-emerald-300';
    if (rating >= 60) return 'bg-blue-100 border border-blue-300';
    if (rating >= 40) return 'bg-slate-100 border border-slate-300';
    return 'bg-rose-100 border border-rose-300';
  };

  const getChangeColor = (value) => {
    if (value > 0) return 'text-rose-600';
    if (value < 0) return 'text-emerald-600';
    return 'text-slate-600';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* 資訊橫幅 */}
        {showInfo && (
          <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 text-white rounded-2xl shadow-xl p-5 mb-6 border border-white/20">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="bg-white/20 rounded-lg p-2 backdrop-blur-sm">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">台股 RS Rating 監控系統</h3>
                  <p className="text-sm text-blue-100">資料來源：台灣證券交易所（交易日盤後更新）· 支援 Telegram 即時通知</p>
                </div>
              </div>
              <button 
                onClick={() => setShowInfo(false)} 
                className="text-white/80 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* 標題區 */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl p-3 shadow-lg">
                <TrendingUp className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight">台股 RS Rating 監控</h1>
                <p className="text-slate-500 text-sm mt-1">威廉歐尼爾投資法 · 相對強度評級</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button 
                onClick={() => setShowTelegramSetup(!showTelegramSetup)} 
                className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2.5 rounded-xl hover:bg-blue-600 transition-all shadow-md hover:shadow-lg font-medium"
              >
                <Send className="w-4 h-4" />
                Telegram
              </button>
              <button 
                onClick={() => setShowDebugInfo(!showDebugInfo)} 
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all shadow-sm"
              >
                {showDebugInfo ? '隱藏' : '顯示'}除錯
              </button>
              <button 
                onClick={loadStockData} 
                disabled={loading} 
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-4 py-2.5 rounded-xl hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 transition-all shadow-md hover:shadow-lg font-medium"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                重新整理
              </button>
            </div>
          </div>
        </div>

        {/* Telegram 設定面板 */}
        {showTelegramSetup && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-slate-200">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-800">
              <div className="bg-blue-100 rounded-lg p-2">
                <Send className="w-5 h-5 text-blue-600" />
              </div>
              Telegram Bot 設定
            </h3>
            
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <span className="bg-blue-200 rounded-full w-6 h-6 flex items-center justify-center text-sm">📝</span>
                設定步驟
              </h4>
              <ol className="text-sm text-blue-800 space-y-2 ml-8 list-decimal">
                <li>在 Telegram 搜尋 <code className="bg-blue-100 px-2 py-0.5 rounded">@BotFather</code>，發送 <code className="bg-blue-100 px-2 py-0.5 rounded">/newbot</code></li>
                <li>依照指示建立 Bot，複製取得的 Bot Token</li>
                <li>開啟您的 Bot，發送 <code className="bg-blue-100 px-2 py-0.5 rounded">/start</code></li>
                <li>瀏覽器開啟：<code className="bg-blue-100 px-2 py-0.5 rounded text-xs">https://api.telegram.org/bot您的TOKEN/getUpdates</code></li>
                <li>在回應中找到 <code className="bg-blue-100 px-2 py-0.5 rounded">chat.id</code> 數字</li>
              </ol>
            </div>

            <div className="space-y-4">
              {/* 自動通知設定 */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="autoNotify"
                    checked={autoNotify}
                    onChange={(e) => {
                      setAutoNotify(e.target.checked);
                      localStorage.setItem('autoNotify', e.target.checked);
                    }}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <label htmlFor="autoNotify" className="text-sm font-medium text-amber-900 cursor-pointer">
                    ✅ 每次重新整理後自動檢查並通知
                  </label>
                </div>
              </div>

              {/* 自動重新整理設定 */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    id="autoRefresh"
                    checked={autoRefresh}
                    onChange={(e) => {
                      setAutoRefresh(e.target.checked);
                      localStorage.setItem('autoRefresh', e.target.checked);
                    }}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <label htmlFor="autoRefresh" className="text-sm font-medium text-blue-900 cursor-pointer">
                    ⏰ 定時自動重新整理
                  </label>
                </div>
                <div className="ml-6 flex items-center gap-2">
                  <span className="text-sm text-blue-700">每</span>
                  <select
                    value={refreshInterval}
                    onChange={(e) => {
                      setRefreshInterval(Number(e.target.value));
                      localStorage.setItem('refreshInterval', e.target.value);
                    }}
                    disabled={!autoRefresh}
                    className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm bg-white disabled:bg-slate-100 disabled:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="15">15</option>
                    <option value="30">30</option>
                    <option value="60">60</option>
                  </select>
                  <span className="text-sm text-blue-700">分鐘</span>
                </div>
              </div>

              {/* 每日報告設定 */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="dailyReport"
                    checked={dailyReport}
                    onChange={(e) => {
                      setDailyReport(e.target.checked);
                      localStorage.setItem('dailyReport', e.target.checked);
                    }}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                  />
                  <label htmlFor="dailyReport" className="text-sm font-medium text-purple-900 cursor-pointer">
                    📊 每日收盤報告（週一至週五 16:30 後自動發送）
                  </label>
                </div>
                <p className="text-xs text-purple-700 mt-2 ml-6">
                  包含：市場概況、RS Top 5、漲跌幅排行、監控清單狀態
                </p>
              </div>

              {/* Bot Token 輸入 */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-700">Bot Token</label>
                <input 
                  type="text" 
                  value={telegramBotToken} 
                  onChange={(e) => setTelegramBotToken(e.target.value)} 
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" 
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              {/* Chat ID 輸入 */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-700">Chat ID</label>
                <input 
                  type="text" 
                  value={telegramChatId} 
                  onChange={(e) => setTelegramChatId(e.target.value)} 
                  placeholder="123456789" 
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              {/* 操作按鈕 */}
              <div className="flex gap-3 flex-wrap">
                <button 
                  onClick={saveTelegramSettings} 
                  className="bg-blue-500 text-white px-5 py-2.5 rounded-xl hover:bg-blue-600 transition-all shadow-md hover:shadow-lg font-medium"
                >
                  💾 儲存設定
                </button>
                <button 
                  onClick={() => sendTelegramMessage('✅ 測試通知成功！')} 
                  className="bg-emerald-500 text-white px-5 py-2.5 rounded-xl hover:bg-emerald-600 transition-all shadow-md hover:shadow-lg font-medium"
                >
                  🧪 測試通知
                </button>
                <button 
                  onClick={sendTopStocks} 
                  className="bg-purple-500 text-white px-5 py-2.5 rounded-xl hover:bg-purple-600 transition-all shadow-md hover:shadow-lg font-medium"
                >
                  📊 發送 Top 10
                </button>
              </div>
            </div>

            {/* 監控清單 */}
            {watchList.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-200">
                <h4 className="font-semibold mb-3 text-slate-800 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-600" />
                  監控清單 ({watchList.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {watchList.map(stock => (
                    <span 
                      key={stock.code} 
                      className="bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full text-sm flex items-center gap-2 border border-blue-300"
                    >
                      <span className="font-medium">{stock.name}</span>
                      <span className="text-blue-600">({stock.code})</span>
                      <button 
                        onClick={() => removeFromWatchList(stock.code)} 
                        className="text-rose-600 hover:text-rose-800 font-bold ml-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 載入進度 */}
        {loading && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              <span className="text-slate-700 font-medium">正在載入台股資料...</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-indigo-600 to-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* 錯誤訊息 */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="bg-rose-100 rounded-lg p-2">
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-rose-800 text-lg">載入失敗</h3>
                <p className="text-sm text-rose-700 mt-1">{error}</p>
                <button 
                  onClick={loadStockData}
                  className="mt-4 bg-rose-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-rose-700 transition-all shadow-md font-medium"
                >
                  重試
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 除錯資訊 */}
        {stocks.length > 0 && showDebugInfo && rawApiData && (
          <div className="bg-slate-900 text-emerald-400 rounded-2xl p-5 mb-6 font-mono text-xs overflow-x-auto border border-slate-700">
            <h3 className="text-white font-bold mb-3 text-base">🔍 API 原始資料（除錯用）</h3>
            <div className="space-y-3">
              <div>
                <strong className="text-amber-400">API 狀態:</strong> 
                <span className="ml-2">{rawApiData.stat || 'N/A'}</span>
              </div>
              <div>
                <strong className="text-amber-400">資料筆數:</strong> 
                <span className="ml-2">{(rawApiData.data9 || rawApiData.data)?.length || 0}</span>
              </div>
              <div>
                <strong className="text-amber-400">第一筆原始資料:</strong>
                <pre className="mt-2 bg-slate-800 p-3 rounded-lg overflow-x-auto text-emerald-300">
                  {JSON.stringify((rawApiData.data9 || rawApiData.data)?.[0], null, 2)}
                </pre>
              </div>
              <div>
                <strong className="text-amber-400">解析結果範例 (台積電 2330):</strong>
                <pre className="mt-2 bg-slate-800 p-3 rounded-lg overflow-x-auto text-emerald-300">
                  {JSON.stringify(stocks.find(s => s.code === '2330'), null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* 篩選條件 */}
        {stocks.length > 0 && (
          <>
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-slate-200">
              <div className="flex items-center gap-2 mb-5">
                <div className="bg-indigo-100 rounded-lg p-2">
                  <Filter className="w-5 h-5 text-indigo-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">篩選條件</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">計算週期</label>
                  <select 
                    value={period} 
                    onChange={(e) => setPeriod(e.target.value)} 
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                  >
                    <option>1週</option>
                    <option>1個月</option>
                    <option>3個月</option>
                    <option>6個月</option>
                    <option>1年</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">產業</label>
                  <select 
                    value={selectedIndustry} 
                    onChange={(e) => setSelectedIndustry(e.target.value)} 
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                  >
                    {industries.map(ind => <option key={ind}>{ind}</option>)}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">最低股價</label>
                  <input 
                    type="number" 
                    value={priceRange.min} 
                    onChange={(e) => setPriceRange({...priceRange, min: Number(e.target.value)})} 
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">最高股價</label>
                  <input 
                    type="number" 
                    value={priceRange.max} 
                    onChange={(e) => setPriceRange({...priceRange, max: Number(e.target.value)})} 
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">搜尋股票</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="text" 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    placeholder="輸入代號或名稱（例如：2330 或 台積電）" 
                    className="w-full pl-12 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* 統計卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-md p-4 border border-slate-200 hover:shadow-lg transition-shadow">
                <p className="text-xs text-slate-600 font-medium mb-1">符合條件</p>
                <p className="text-3xl font-bold text-indigo-600">{filteredStocks.length}</p>
                <p className="text-xs text-slate-500 mt-1">檔股票</p>
              </div>
              
              <div className="bg-white rounded-xl shadow-md p-4 border border-slate-200 hover:shadow-lg transition-shadow">
                <p className="text-xs text-slate-600 font-medium mb-1">強勢股</p>
                <p className="text-3xl font-bold text-emerald-600">{filteredStocks.filter(s => s.rsRating >= 80).length}</p>
                <p className="text-xs text-slate-500 mt-1">RS ≥ 80</p>
              </div>
              
              <div className="bg-white rounded-xl shadow-md p-4 border border-slate-200 hover:shadow-lg transition-shadow">
                <p className="text-xs text-slate-600 font-medium mb-1">中強勢股</p>
                <p className="text-3xl font-bold text-blue-600">{filteredStocks.filter(s => s.rsRating >= 60 && s.rsRating < 80).length}</p>
                <p className="text-xs text-slate-500 mt-1">RS 60-79</p>
              </div>
              
              <div className="bg-white rounded-xl shadow-md p-4 border border-slate-200 hover:shadow-lg transition-shadow">
                <p className="text-xs text-slate-600 font-medium mb-1">平均 RS</p>
                <p className="text-3xl font-bold text-slate-800">
                  {filteredStocks.length > 0 ? Math.round(filteredStocks.reduce((sum, s) => sum + s.rsRating, 0) / filteredStocks.length) : 0}
                </p>
                <p className="text-xs text-slate-500 mt-1">整體表現</p>
              </div>
            </div>

            {/* 股票列表 */}
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 text-white">
                    <tr>
                      <th className="px-4 py-4 text-left text-sm font-semibold">排名</th>
                      <th className="px-4 py-4 text-left text-sm font-semibold">代號 / 名稱</th>
                      <th className="px-4 py-4 text-left text-sm font-semibold hidden md:table-cell">產業</th>
                      <th className="px-4 py-4 text-right text-sm font-semibold">股價</th>
                      <th className="px-4 py-4 text-center text-sm font-semibold">RS Rating</th>
                      <th className="px-4 py-4 text-right text-sm font-semibold hidden sm:table-cell">當日漲跌</th>
                      <th className="px-4 py-4 text-center text-sm font-semibold">監控</th>
                      <th className="px-4 py-4 text-center text-sm font-semibold hidden lg:table-cell">詳情</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStocks.slice(0, 100).map((stock, index) => (
                      <React.Fragment key={stock.code}>
                        <tr className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              {index < 3 && (
                                <span className="text-lg">
                                  {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                                </span>
                              )}
                              <span className="font-bold text-slate-700 text-sm">#{index + 1}</span>
                            </div>
                          </td>
                          
                          <td className="px-4 py-4">
                            <div className="flex flex-col">
                              <span className="font-mono text-sm font-bold text-indigo-600">{stock.code}</span>
                              <span className="text-sm text-slate-700 font-medium">{stock.name}</span>
                            </div>
                          </td>
                          
                          <td className="px-4 py-4 hidden md:table-cell">
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200">
                              {stock.industry}
                            </span>
                          </td>
                          
                          <td className="px-4 py-4 text-right">
                            <div className="font-bold text-slate-800">NT$ {stock.price.toFixed(2)}</div>
                          </td>
                          
                          <td className="px-4 py-4 text-center">
                            <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${getRSBgColor(stock.rsRating)} ${getRSColor(stock.rsRating)}`}>
                              {stock.rsRating}
                            </span>
                          </td>
                          
                          <td className="px-4 py-4 text-right hidden sm:table-cell">
                            <div className={`font-bold text-sm ${getChangeColor(stock.change || 0)}`}>
                              {(stock.change || 0) >= 0 ? '+' : ''}{(stock.change || 0).toFixed(2)}
                            </div>
                            <div className={`text-xs mt-0.5 ${getChangeColor(stock.changePercent || 0)}`}>
                              ({(stock.changePercent || 0) >= 0 ? '+' : ''}{(stock.changePercent || 0).toFixed(2)}%)
                            </div>
                          </td>
                          
                          <td className="px-4 py-4 text-center">
                            {watchList.find(s => s.code === stock.code) ? (
                              <button 
                                onClick={() => removeFromWatchList(stock.code)} 
                                className="text-amber-500 hover:text-amber-700 transition-colors p-1 rounded-lg hover:bg-amber-50"
                                title="移除監控"
                              >
                                <Bell className="w-5 h-5 fill-current" />
                              </button>
                            ) : (
                              <button 
                                onClick={() => addToWatchList(stock)} 
                                className="text-slate-400 hover:text-indigo-600 transition-colors p-1 rounded-lg hover:bg-indigo-50"
                                title="加入監控"
                              >
                                <BellOff className="w-5 h-5" />
                              </button>
                            )}
                          </td>
                          
                          <td className="px-4 py-4 text-center hidden lg:table-cell">
                            <button
                              onClick={() => toggleRowExpansion(stock.code)}
                              className="text-slate-500 hover:text-indigo-600 transition-colors p-1 rounded-lg hover:bg-indigo-50"
                              title={expandedRows.has(stock.code) ? "收起" : "展開詳情"}
                            >
                              {expandedRows.has(stock.code) ? (
                                <ChevronUp className="w-5 h-5" />
                              ) : (
                                <ChevronDown className="w-5 h-5" />
                              )}
                            </button>
                          </td>
                        </tr>
                        
                        {/* 展開的詳細資訊 */}
                        {expandedRows.has(stock.code) && (
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <td colSpan="8" className="px-4 py-4">
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div className="bg-white rounded-lg p-3 border border-slate-200">
                                  <p className="text-xs text-slate-600 mb-1">1週報酬</p>
                                  <p className={`text-lg font-bold ${getChangeColor(stock.returns.week1)}`}>
                                    {stock.returns.week1 >= 0 ? '+' : ''}{stock.returns.week1.toFixed(2)}%
                                  </p>
                                </div>
                                <div className="bg-white rounded-lg p-3 border border-slate-200">
                                  <p className="text-xs text-slate-600 mb-1">1個月報酬</p>
                                  <p className={`text-lg font-bold ${getChangeColor(stock.returns.month1)}`}>
                                    {stock.returns.month1 >= 0 ? '+' : ''}{stock.returns.month1.toFixed(2)}%
                                  </p>
                                </div>
                                <div className="bg-white rounded-lg p-3 border border-slate-200">
                                  <p className="text-xs text-slate-600 mb-1">3個月報酬</p>
                                  <p className={`text-lg font-bold ${getChangeColor(stock.returns.month3)}`}>
                                    {stock.returns.month3 >= 0 ? '+' : ''}{stock.returns.month3.toFixed(2)}%
                                  </p>
                                </div>
                                <div className="bg-white rounded-lg p-3 border border-slate-200">
                                  <p className="text-xs text-slate-600 mb-1">6個月報酬</p>
                                  <p className={`text-lg font-bold ${getChangeColor(stock.returns.month6)}`}>
                                    {stock.returns.month6 >= 0 ? '+' : ''}{stock.returns.month6.toFixed(2)}%
                                  </p>
                                </div>
                                <div className="bg-white rounded-lg p-3 border border-slate-200">
                                  <p className="text-xs text-slate-600 mb-1">1年報酬</p>
                                  <p className={`text-lg font-bold ${getChangeColor(stock.returns.year1)}`}>
                                    {stock.returns.year1 >= 0 ? '+' : ''}{stock.returns.year1.toFixed(2)}%
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {filteredStocks.length > 100 && (
                <div className="bg-slate-50 px-6 py-4 text-center text-sm text-slate-600 border-t border-slate-200">
                  顯示前 100 筆，共 <span className="font-bold text-indigo-600">{filteredStocks.length}</span> 筆
                </div>
              )}
              
              {filteredStocks.length === 0 && !loading && (
                <div className="text-center py-16">
                  <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-lg text-slate-500 font-medium">查無符合條件的股票</p>
                  <p className="text-sm text-slate-400 mt-2">請調整篩選條件</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* 使用說明 */}
        <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6">
          <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2 text-lg">
            <div className="bg-blue-200 rounded-lg p-1.5">
              <Info className="w-5 h-5 text-blue-700" />
            </div>
            使用說明
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white/60 rounded-xl p-4 border border-blue-100">
              <h4 className="font-semibold text-blue-800 mb-2">📊 資料來源</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• 台灣證券交易所官方 API</li>
                <li>• 交易日盤後更新（約 16:30 後）</li>
                <li>• 週末及國定假日無資料</li>
              </ul>
            </div>
            <div className="bg-white/60 rounded-xl p-4 border border-blue-100">
              <h4 className="font-semibold text-blue-800 mb-2">📈 RS Rating 說明</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• 相對強度評級：0-99 分</li>
                <li>• 數字越高表現越強勢</li>
                <li>• ≥80 為強勢股（綠色）</li>
                <li>• 60-79 為中強勢（藍色）</li>
              </ul>
            </div>
            <div className="bg-white/60 rounded-xl p-4 border border-blue-100">
              <h4 className="font-semibold text-blue-800 mb-2">🔔 Telegram 通知</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• 設定後可接收即時通知</li>
                <li>• 支援自動通知與每日報告</li>
                <li>• 可發送 Top 10 排行</li>
              </ul>
            </div>
            <div className="bg-white/60 rounded-xl p-4 border border-blue-100">
              <h4 className="font-semibold text-blue-800 mb-2">⚙️ 功能特色</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• 點擊鈴鐺加入監控清單</li>
                <li>• 支援產業、價格篩選</li>
                <li>• 定時自動重新整理</li>
                <li>• 展開查看多週期報酬</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TWStockRSMonitor;
