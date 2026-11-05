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
import { useAuth } from "./AuthContext.jsx";

const SaleSystemCtx = createContext(null);

/* ─────────────── Shared defaults (single source of truth) ─────────────── */
// Used for initial state, fetch fallbacks AND the no-provider fallback, so
// the three can never drift apart.
const DEFAULT_SALE_SYSTEM = "retail_wholesale"; // retail + wholesale
const DEFAULT_SHOP_TYPE = "pharmacy";
const RETRY_DELAY_MS = 1500;

const noopRefresh = async () => {};

// Module-level fallback returned by useSaleSystem() when the hook is used
// outside <SaleSystemProvider>. Keeping it a constant means the fallback
// object identity is stable across renders, so consumers don't re-render for
// no reason. Falling back (instead of throwing) matches the convention used
// by useTheme()/useLicense() in this codebase.
const FALLBACK_CONTEXT = {
  saleSystem: DEFAULT_SALE_SYSTEM,
  hasRetail: true,
  hasWholesale: true,
  isRetailOnly: false,
  shopType: DEFAULT_SHOP_TYPE,
  isPharmacy: true,
  isGeneralStore: false,
  isSetupCompleted: true,
  loading: false,
  refreshSaleSystem: noopRefresh,
};

export function SaleSystemProvider({ children }) {
  const auth = useAuth();
  const currentToken =
    auth?.token || (typeof window !== "undefined" ? localStorage.getItem("token") : null);

  const [saleSystem, setSaleSystem] = useState(DEFAULT_SALE_SYSTEM);
  const [shopType, setShopType] = useState(DEFAULT_SHOP_TYPE);
  const [isSetupCompleted, setIsSetupCompleted] = useState(true);
  const [loading, setLoading] = useState(true);

  // Concurrency / lifecycle guards:
  // - mountedRef:    never setState (or schedule retries) after unmount
  // - requestIdRef:  only the LATEST request may apply its result, so a slow
  //                  stale response can't overwrite a newer refresh
  // - retryTimerRef: keep a handle on the pending retry so it can be
  //                  cancelled when a newer fetch starts or on unmount
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const retryTimerRef = useRef(null);

  // Memoized so `refreshSaleSystem` keeps a stable identity across renders
  // (consumers can safely list it in useMemo/useCallback dependency arrays).
  const fetchSaleSystem = useCallback(async function fetchSaleSystem(isRetry = false) {
    // This call supersedes any pending retry.
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const activeToken =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!activeToken) {
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;

    try {
      const { data } = await axios.get("/api/sale-system", {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      setSaleSystem(data?.sale_system || DEFAULT_SALE_SYSTEM);
      setShopType(data?.shop_type || DEFAULT_SHOP_TYPE);
      if (typeof data?.is_setup_completed === "boolean") {
        setIsSetupCompleted(data.is_setup_completed);
      }
      setLoading(false);
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      console.error("Failed to fetch sale system setting:", error);
      // Never reset the mode on failure — keep the last known value so a
      // retail-only shop doesn't flip back to showing wholesale actions.
      if (!isRetry) {
        // One retry for transient failures (keeps `loading` true meanwhile)
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          fetchSaleSystem(true);
        }, RETRY_DELAY_MS);
        return;
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (currentToken) {
      setLoading(true);
      fetchSaleSystem();
    } else {
      setLoading(false);
    }

    // Listen for settings changes to refresh sale system setting
    const handleSettingsChange = () => {
      fetchSaleSystem();
    };

    window.addEventListener("settingsChanged", handleSettingsChange);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("settingsChanged", handleSettingsChange);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [currentToken, fetchSaleSystem]);

  // Memoize the context value so consumers only re-render when the actual
  // state changes; the derived flags are computed inside the memo.
  const value = useMemo(
    () => ({
      saleSystem,
      hasRetail: true,
      hasWholesale: saleSystem === "retail_wholesale" || saleSystem === "wholesale",
      isRetailOnly: saleSystem === "retail",
      shopType,
      isPharmacy: shopType === "pharmacy",
      isGeneralStore: shopType === "general_store",
      isSetupCompleted,
      loading,
      refreshSaleSystem: fetchSaleSystem,
    }),
    [saleSystem, shopType, isSetupCompleted, loading, fetchSaleSystem]
  );

  return (
    <SaleSystemCtx.Provider value={value}>
      {children}
    </SaleSystemCtx.Provider>
  );
}

export function useSaleSystem() {
  return useContext(SaleSystemCtx) ?? FALLBACK_CONTEXT;
}
