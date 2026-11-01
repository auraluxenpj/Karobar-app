import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import axios from "axios";

const CurrencyCtx = createContext(null);

const DEFAULT_CURRENCY = {
  currencyCode: "PKR",
  currencySymbol: "Rs.",
  currencyPosition: "before",
  currencyDecimalPlaces: 2,
};

const formatAmount = (val, symbol, position, decimals) => {
  if (val === null || val === undefined || val === "") return "";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(num)) return String(val);

  const formattedNum = num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (!symbol) return formattedNum;
  return position === "after" ? `${formattedNum} ${symbol}` : `${symbol} ${formattedNum}`;
};

const FALLBACK_CONTEXT = {
  ...DEFAULT_CURRENCY,
  loading: false,
  formatCurrency: (val, options = {}) =>
    formatAmount(
      val,
      options.symbol ?? DEFAULT_CURRENCY.currencySymbol,
      options.position ?? DEFAULT_CURRENCY.currencyPosition,
      options.decimals ?? DEFAULT_CURRENCY.currencyDecimalPlaces
    ),
  refreshCurrency: async () => {},
};

const CURRENCY_CACHE_KEY = "karobar_currency_config";

export function CurrencyProvider({ children }) {
  const [config, setConfig] = useState(() => {
    try {
      const raw = localStorage.getItem(CURRENCY_CACHE_KEY);
      if (raw) {
        return { ...DEFAULT_CURRENCY, ...JSON.parse(raw) };
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_CURRENCY;
  });
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const fetchCurrency = useCallback(async () => {
    try {
      // Shares the in-flight deduplicated /api/sale-system request with SaleSystemProvider
      const { data } = await axios.get("/api/sale-system");
      if (!mountedRef.current) return;
      const nextConfig = {
        currencyCode: data?.currency_code || DEFAULT_CURRENCY.currencyCode,
        currencySymbol: data?.currency_symbol || DEFAULT_CURRENCY.currencySymbol,
        currencyPosition: data?.currency_position || DEFAULT_CURRENCY.currencyPosition,
        currencyDecimalPlaces:
          typeof data?.currency_decimal_places === "number"
            ? data.currency_decimal_places
            : DEFAULT_CURRENCY.currencyDecimalPlaces,
      };
      setConfig(nextConfig);
      try {
        localStorage.setItem(CURRENCY_CACHE_KEY, JSON.stringify(nextConfig));
      } catch {
        /* ignore */
      }
    } catch {
      // Keep defaults on error
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchCurrency();

    const handleSettingsChanged = () => {
      fetchCurrency();
    };
    window.addEventListener("settingsChanged", handleSettingsChanged);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("settingsChanged", handleSettingsChanged);
    };
  }, [fetchCurrency]);

  const formatCurrency = useCallback(
    (amount, options = {}) => {
      const sym = options.symbol !== undefined ? options.symbol : config.currencySymbol;
      const pos = options.position !== undefined ? options.position : config.currencyPosition;
      const dec = options.decimals !== undefined ? options.decimals : config.currencyDecimalPlaces;
      return formatAmount(amount, sym, pos, dec);
    },
    [config]
  );

  const value = useMemo(
    () => ({
      ...config,
      loading,
      formatCurrency,
      refreshCurrency: fetchCurrency,
    }),
    [config, loading, formatCurrency, fetchCurrency]
  );

  return <CurrencyCtx.Provider value={value}>{children}</CurrencyCtx.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyCtx);
  return ctx || FALLBACK_CONTEXT;
}
