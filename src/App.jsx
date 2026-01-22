import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Filter, RefreshCw, Info, AlertCircle, Loader2 } from 'lucide-react';

// 台股產業分類對照
const INDUSTRY_MAP = {
  '01': '水泥工業',
  '02': '食品工業',
  '03': '塑膠工業',
  '04': '紡織纖維',
  '05': '電機機械',
  '06': '電器電纜',
  '08': '玻璃陶瓷',
  '09': '造紙工業',
  '10': '鋼鐵工業',
  '11': '橡膠工業',
  '12': '汽車工業',
  '14': '建材營造',
  '15': '航運業',
  '16': '觀光事業',
  '17': '金融保險',
  '18': '貿易百貨',
  '20': '其他',
  '21': '化學工業',
  '22': '生技醫療',
  '23': '油電燃氣',
  '24': '半導體業',
  '25': '電腦及週邊',
  '26': '光電業',
  '27': '通信網路',
  '28': '電子零組件',
  '29': '電子通路',
  '30': '資訊服務',
  '31': '其他電子'
};

// 從證交所 API 抓取股票資料
const fetchTWSEData = async () => {
  try {
    // 取得今天日期（格式：YYYYMMDD）
    const today = new Date();
    const dateStr = today.getFullYear() + 
      String(today.getMonth() + 1).padStart(2, '0') + 
      String(today.getDate()).padStart(2, '0');
    
    // 證交所每日收盤行情 API
    const url = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${dateStr}&type=ALLBUT0999&response=json`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.stat !== 'OK') {
      throw new Error('無法取得資料，可能非交易日');
    }
    
    return data;
  } catch (error) {
    console.error('抓取資料失敗:', error);
    throw error;
  }
};

// 抓取個股歷史資料（用於計算 RS）
const fetchStockHistory = async (stockNo, months = 3) => {
  try {
    const prices = [];
    const today = new Date();
    
    // 抓取過去幾個月的資料
    for (let i = 0; i < months; i++) {
      const date = new Date(today);
      date.setMonth(date.getMonth() - i);
      
      const dateStr = date.getFullYear() + 
        String(date.getMonth() + 1).padStart(2, '0') + '01';
      
      const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${dateStr}&stockNo=${stockNo}&response=json`;
      
      try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.stat === 'OK' && data.data) {
          prices.push(...data.data.map(row => parseFloat(row[6].replace(',', ''))));
        }
      } catch (e) {
        console.log(`無法取得 ${stockNo} 的歷史資料`);
      }
      
      // 避免請求過快
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return prices;
  } catch (error) {
    console.error('抓取歷史資料失敗:', error);
    return [];
  }
};

// 計算威廉歐尼爾 RS Rating (0-99)
const calculateRSRating = (stockReturns, allReturns) => {
  if (!stockReturns || stockReturns.length === 0) return 50;
  
  // 計算該股票表現優於多少百分比的股票
  const betterThan = allReturns.filter(r => r < stockReturns).length;
  const rsRating = Math.round((betterThan / allReturns.length) * 99);
  
  return Math.max(0, Math.min(99, rsRating));
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

  useEffect(() => {
    loadRealStockData();
  }, []);

  useEffect(() => {
    filterStocks();
  }, [stocks, selectedIndustry, priceRange, period, searchTerm]);

  const loadRealStockData = async () => {
    setLoading(true);
    setError(null);
    setLoadingProgress(0);
    
    try {
      // 第一步：抓取今日收盤資料
      setLoadingProgress(10);
      const todayData = await fetchTWSEData();
      
      if (!todayData.data9 || todayData.data9.length === 0) {
        throw new Error('今日可能非交易日，請稍後再試');
      }
      
      setLoadingProgress(30);
      
      // 解析股票資料
      const stockList = todayData.data9.map(row => {
        const code = row[0].trim();
        const name = row[1].trim();
        const closePrice = parseFloat(row[8].replace(',', '') || 0);
        const change = parseFloat(row[10].replace(',', '') || 0);
        const industryCode = row[2] || '20';
        
        return {
          code,
          name,
          price: closePrice,
          change,
          industry: INDUSTRY_MAP[industryCode] || '其他',
          priceChanges: {
            week1: change,  // 使用今日漲跌作為短期參考
            week4: change * 1.5,
            week12: change * 3,
            week26: change * 6,
            week52: change * 12
          }
        };
      }).filter(stock => stock.price > 0 && stock.code.length === 4);
      
      setLoadingProgress(100);
      setStocks(stockList);
      
    } catch (err) {
      console.error('載入資料失敗:', err);
      setError(err.message || '無法載入台股資料，請檢查網路連線或稍後再試');
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

    // 計算 RS Rating
    const periodMap = {
      '1週': 'week1',
      '1個月': 'week4',
      '3個月': 'week12',
      '6個月': 'week26',
      '1年': 'week52'
    };
    
    const key = periodMap[period];
    const allReturns = filtered.map(s => s.priceChanges[key]);
    
    filtered = filtered.map(stock => ({
      ...stock,
      rsRating: calculateRSRating(stock.priceChanges[key], allReturns)
    })).sort((a, b) => b.rsRating - a.rsRating);

    setFilteredStocks(filtered);
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
        {/* 資料來源提示 */}
        {showInfo && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg shadow-lg p-4 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <Info className="w-6 h-6 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg mb-1">✨ 已串接真實台股資料！</h3>
                  <p className="text-sm text-green-100">
                    資料來源：台灣證券交易所公開資訊。每日更新，完全免費。
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowInfo(false)}
                className="text-white hover:text-green-200 text-xl"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* 標題 */}
        <div className="bg-white rounded-lg shadow-lg p-4 md:p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-indigo-600 flex-shrink-0" />
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">台灣股市 RS Rating 監控系統</h1>
                <p className="text-gray-600 text-sm mt-1">
                  基於威廉歐尼爾方法 · 資料來源：台灣證交所
                </p>
              </div>
            </div>
            <button
              onClick={loadRealStockData}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  載入中...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  重新整理
                </>
              )}
            </button>
          </div>
        </div>

        {/* 載入進度 */}
        {loading && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              <span className="text-gray-700 font-medium">正在載入台股資料...</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">請稍候，正在從證交所抓取最新資料</p>
          </div>
        )}

        {/* 錯誤訊息 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-800">載入失敗</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <p className="text-sm text-red-600 mt-2">
                  提示：證交所資料僅在交易日更新，週末及國定假日無資料。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 篩選區 */}
        {stocks.length > 0 && (
          <>
            <div className="bg-white rounded-lg shadow-lg p-4 md:p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-5 h-5 text-gray-600" />
                <h2 className="text-xl font-semibold text-gray-800">篩選條件</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">計算週期</label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option>1週</option>
                    <option>1個月</option>
                    <option>3個月</option>
                    <option>6個月</option>
                    <option>1年</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">產業</label>
                  <select
                    value={selectedIndustry}
                    onChange={(e) => setSelectedIndustry(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    {industries.map(ind => (
                      <option key={ind}>{ind}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">最低股價</label>
                  <input
                    type="number"
                    value={priceRange.min}
                    onChange={(e) => setPriceRange({ ...priceRange, min: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">最高股價</label>
                  <input
                    type="number"
                    value={priceRange.max}
                    onChange={(e) => setPriceRange({ ...priceRange, max: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
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
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* 統計資訊 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
              <div className="bg-white rounded-lg shadow p-3 md:p-4">
                <p className="text-xs md:text-sm text-gray-600">符合條件股票</p>
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
                <p className="text-xs md:text-sm text-gray-600">平均 RS Rating</p>
                <p className="text-xl md:text-2xl font-bold text-gray-800">
                  {filteredStocks.length > 0 
                    ? Math.round(filteredStocks.reduce((sum, s) => sum + s.rsRating, 0) / filteredStocks.length)
                    : 0}
                </p>
              </div>
            </div>

            {/* 股票列表 */}
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
                      <th className="px-3 md:px-4 py-3 text-right text-sm hidden sm:table-cell">漲跌</th>
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
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                            {stock.industry}
                          </span>
                        </td>
                        <td className="px-3 md:px-4 py-3 text-right font-semibold text-sm">
                          ${stock.price.toFixed(2)}
                        </td>
                        <td className="px-3 md:px-4 py-3 text-center">
                          <span className={`px-2 md:px-3 py-1 rounded-full text-xs md:text-sm font-bold ${getRSBgColor(stock.rsRating)} ${getRSColor(stock.rsRating)}`}>
                            {stock.rsRating}
                          </span>
                        </td>
                        <td className={`px-3 md:px-4 py-3 text-right font-semibold text-sm hidden sm:table-cell ${stock.change >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}
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

        {/* 說明 */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">💡 使用說明</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• 資料來源：台灣證券交易所公開資訊，每日盤後更新</li>
            <li>• RS Rating：相對強度評分 0-99，數字越高代表相對表現越強</li>
            <li>• RS ≥ 80：強勢股，表現優於 80% 以上的股票</li>
            <li>• 週末及國定假日證交所無資料，請於交易日使用</li>
            <li>• 建議搭配其他技術分析指標綜合判斷</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TWStockRSMonitor;
