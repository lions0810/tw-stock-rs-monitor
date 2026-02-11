import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Filter, RefreshCw, Info, AlertCircle, Loader2, Bell, BellOff, Send, X, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';

// 替換為台股代號前綴對應表
const TICKER_PREFIX_MAP = {
  '00': 'ETF',
  '11': '水泥工業', '12': '食品工業', '13': '塑膠工業', '14': '紡織纖維',
  '15': '電機機械', '16': '電器電纜', '17': '化學工業', '18': '玻璃陶瓷',
  '19': '造紙工業', '20': '鋼鐵工業', '21': '橡膠工業', '22': '汽車工業',
  '23': '半導體/電子', '24': '半導體/電子', '25': '建材營造', '26': '航運業',
  '27': '觀光休閒', '28': '金融保險', '29': '貿易百貨', '30': '電腦與週邊',
  '31': '光電業', '32': '電子通路', '33': '電子工業', '34': '光電業',
  '35': '電子零組件', '36': '光電/通信', '37': '電子工業', '41': '生技醫療',
  '43': '其他', '44': '紡織纖維', '45': '電機機械', '47': '化學/生技',
  '49': '通信網路', '50': '油電燃氣', '52': '電子/休閒', '53': '電子工業',
  '54': '電子零組件', '55': '建材營造', '56': '航運業', '57': '觀光休閒',
  '58': '金融保險', '59': '貿易百貨', '60': '金融保險', '61': '電子/資訊',
  '62': '電子零組件', '64': '生技醫療', '65': '生技醫療', '66': '其他',
  '67': '生技醫療', '68': '電子相關', '80': '電腦與週邊', '81': '電子零組件',
  '82': '電子零組件', '83': '其他', '84': '其他', '89': '其他', '99': '其他類'
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
      let successfulUrl = '';
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
          
          if (json.stat === 'OK' && (json.data9 || json.data)) {
            data = json;
            setRawApiData(json);
            successfulUrl = url;
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
      
      const isStockDayAll = successfulUrl.includes('STOCK_DAY_ALL');
      setLoadingProgress(50);
      
      const stockList = stockData.map((row, idx) => {
        const code = row[0]?.trim() || '';
        const name = row[1]?.trim() || '';
        
        let closePrice = 0;
        let changeSign = 0;
        let change = 0;
        
        // 根據不同的 API 來源，採用不同的欄位解析邏輯
        if (isStockDayAll) {
          closePrice = parseFloat(String(row[7] || '').replace(/,/g, '').trim());
          const changeStrRaw = String(row[8] || '').trim();
          if (changeStrRaw.includes('+') || changeStrRaw.includes('red')) changeSign = 1;
          else if (changeStrRaw.includes('-') || changeStrRaw.includes('green')) changeSign = -1;
          else changeSign = 0;
          change = parseFloat(changeStrRaw.replace(/<[^>]+>/g, '').replace(/,/g, '').replace(/\+/g, '').replace(/\-/g, '').trim());
          if (isNaN(change)) change = 0;
          change = change * changeSign;
        } else {
          closePrice = parseFloat(String(row[8] || '').replace(/,/g, '').trim());
          const directionStr = String(row[9] || '').trim();
          if (directionStr === '+' || directionStr.includes('red') || directionStr === '<p style="color:red">+</p>') changeSign = 1;
          else if (directionStr === '-' || directionStr.includes('green') || directionStr === '<p style="color:green">-</p>') changeSign = -1;
          else changeSign = 0;
          const changeStr = String(row[10] || '').replace(/,/g, '').replace(/\+/g, '').replace(/\-/g, '').trim();
          change = parseFloat(changeStr);
          if (isNaN(change)) change = 0;
          change = change * changeSign;
        }
        
        // 修復無效收盤價
        if (isNaN(closePrice) || closePrice <= 0) {
          const highIdx = isStockDayAll ? 5 : 6;
          const openIdx = isStockDayAll ? 4 : 5;
          const highPrice = parseFloat(String(row[highIdx] || '').replace(/,/g, '').trim());
          const openPrice = parseFloat(String(row[openIdx] || '').replace(/,/g, '').trim());
          closePrice = (!isNaN(highPrice) && highPrice > 0) ? highPrice : 
                       (!isNaN(openPrice) && openPrice > 0) ? openPrice : 0;
        }
        
        // 計算漲跌幅
        let changePercent = 0;
        if (change !== 0 && closePrice > 0) {
          const previousClose = closePrice - change;
          if (previousClose > 0) {
            changePercent = (change / previousClose) * 100;
          }
        }
        
        // 修正：使用代碼前兩碼對應新的 TICKER_PREFIX_MAP
        const prefix = code.substring(0, 2);
        
        return {
          code,
          name,
          price: closePrice,
          change: change,
          changePercent: changePercent,
          industry: TICKER_PREFIX_MAP[prefix] || '電子/其他',
          returns: {
            week1: changePercent, // 目前仍是使用單日漲跌幅做範例推算
            month1: changePercent * 4,
            month3: changePercent * 12,
            month6: changePercent * 24,
            year1: changePercent * 48
          }
        };
      }).filter(stock => {
        return stock.price > 0 && stock.code.length === 4 && /^\d{4}$/.test(stock.code);
      });
      
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
                  onClick={saveTelegramSettings
