import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Filter, RefreshCw, Info } from 'lucide-react';

// 模擬台股資料（實際應用需串接真實API）
const generateMockStocks = () => {
  const industries = ['半導體', '電子零組件', '金融保險', '塑膠', '食品', '鋼鐵', '汽車', '生技醫療', '航運', '營建'];
  const stocks = [];
  
  for (let i = 0; i < 150; i++) {
    const basePrice = Math.random() * 500 + 20;
    const industry = industries[Math.floor(Math.random() * industries.length)];
    
    // 模擬不同週期的價格變化
    const priceChanges = {
      week1: (Math.random() - 0.5) * 20,
      week4: (Math.random() - 0.5) * 30,
      week12: (Math.random() - 0.5) * 50,
      week26: (Math.random() - 0.5) * 80,
      week52: (Math.random() - 0.5) * 120
    };
    
    stocks.push({
      code: (2300 + i).toString(),
      name: `${industry}股${i + 1}`,
      industry: industry,
      price: parseFloat(basePrice.toFixed(2)),
      priceChanges: priceChanges
    });
  }
  
  return stocks;
};

// 計算威廉歐尼爾 RS Rating (0-99)
const calculateRSRating = (stock, period, allStocks) => {
  const periodMap = {
    '1週': 'week1',
    '1個月': 'week4',
    '3個月': 'week12',
    '6個月': 'week26',
    '1年': 'week52'
  };
  
  const key = periodMap[period];
  const stockReturn = stock.priceChanges[key];
  
  // 計算該股票表現優於多少百分比的股票
  const betterThan = allStocks.filter(s => s.priceChanges[key] < stockReturn).length;
  const rsRating = Math.round((betterThan / allStocks.length) * 99);
  
  return Math.max(0, Math.min(99, rsRating));
};

const TWStockRSMonitor = () => {
  const [stocks, setStocks] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [selectedIndustry, setSelectedIndustry] = useState('全部');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 1000 });
  const [period, setPeriod] = useState('3個月');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDeployInfo, setShowDeployInfo] = useState(true);

  useEffect(() => {
    loadStocks();
  }, []);

  useEffect(() => {
    filterStocks();
  }, [stocks, selectedIndustry, priceRange, period, searchTerm]);

  const loadStocks = () => {
    setLoading(true);
    setTimeout(() => {
      const mockStocks = generateMockStocks();
      setStocks(mockStocks);
      setLoading(false);
    }, 500);
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

    filtered = filtered.map(stock => ({
      ...stock,
      rsRating: calculateRSRating(stock, period, stocks)
    })).sort((a, b) => b.rsRating - a.rsRating);

    setFilteredStocks(filtered);
  };

  const industries = ['全部', ...new Set(stocks.map(s => s.industry))];

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
        {/* 部署提示 */}
        {showDeployInfo && (
          <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg shadow-lg p-4 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <Info className="w-6 h-6 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg mb-1">🚀 已準備好部署到 Vercel！</h3>
                  <p className="text-sm text-purple-100">
                    此程式已包含完整的 Vercel 部署設定檔。目前使用模擬資料，可串接真實台股 API。
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDeployInfo(false)}
                className="text-white hover:text-purple-200 text-xl"
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
                <p className="text-gray-600 text-sm mt-1">基於威廉歐尼爾方法計算相對強度評分 (0-99)</p>
              </div>
            </div>
            <button
              onClick={loadStocks}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              重新整理
            </button>
          </div>
        </div>

        {/* 篩選區 */}
        <div className="bg-white rounded-lg shadow-lg p-4 md:p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-800">篩選條件</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 計算週期 */}
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

            {/* 產業 */}
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

            {/* 最低股價 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">最低股價</label>
              <input
                type="number"
                value={priceRange.min}
                onChange={(e) => setPriceRange({ ...priceRange, min: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* 最高股價 */}
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

          {/* 搜尋 */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">搜尋股票代號或名稱</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="輸入股票代號或名稱..."
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
                  <th className="px-3 md:px-4 py-3 text-right text-sm hidden sm:table-cell">報酬</th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.slice(0, 50).map((stock, index) => {
                  const periodMap = {
                    '1週': 'week1',
                    '1個月': 'week4',
                    '3個月': 'week12',
                    '6個月': 'week26',
                    '1年': 'week52'
                  };
                  const returnPct = stock.priceChanges[periodMap[period]];
                  
                  return (
                    <tr key={stock.code} className="border-b hover:bg-gray-50">
                      <td className="px-3 md:px-4 py-3">
                        <span className="font-semibold text-gray-700 text-sm">#{index + 1}</span>
                      </td>
                      <td className="px-3 md:px-4 py-3 font-mono text-sm">{stock.code}</td>
                      <td className="px-3 md:px-4 py-3 text-sm">{stock.name}</td>
                      <td className="px-3 md:px-4 py-3 hidden md:table-cell">
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                          {stock.industry}
                        </span>
                      </td>
                      <td className="px-3 md:px-4 py-3 text-right font-semibold text-sm">${stock.price}</td>
                      <td className="px-3 md:px-4 py-3 text-center">
                        <span className={`px-2 md:px-3 py-1 rounded-full text-xs md:text-sm font-bold ${getRSBgColor(stock.rsRating)} ${getRSColor(stock.rsRating)}`}>
                          {stock.rsRating}
                        </span>
                      </td>
                      <td className={`px-3 md:px-4 py-3 text-right font-semibold text-sm hidden sm:table-cell ${returnPct >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {filteredStocks.length > 50 && (
            <div className="bg-gray-50 px-4 py-3 text-center text-sm text-gray-600">
              顯示前 50 筆，共 {filteredStocks.length} 筆符合條件
            </div>
          )}
          
          {filteredStocks.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg">查無符合條件的股票</p>
              <p className="text-sm mt-2">請調整篩選條件</p>
            </div>
          )}
        </div>

        {/* 說明 */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">RS Rating 說明</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• RS Rating 範圍 0-99，數字越高代表相對表現越強</li>
            <li>• RS ≥ 80：強勢股，表現優於 80% 以上的股票</li>
            <li>• RS 60-79：中強勢股，適合持續觀察</li>
            <li>• RS &lt; 40：弱勢股，相對表現較差</li>
            <li>• 本系統目前使用模擬資料展示功能</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TWStockRSMonitor;