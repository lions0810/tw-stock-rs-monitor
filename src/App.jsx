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
      let successfulUrl = ''; // 新增：記錄哪個 API 成功
      const urls = [
        `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${dateStr}&type=ALLBUT0999&response=json`,
        `
