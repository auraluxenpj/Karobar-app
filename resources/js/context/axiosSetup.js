import axios from "axios";
import { saveLastVisitedPath } from "../utils/lastVisitedPage.js";

const inflightGetMap = new Map();
const responseCacheMap = new Map();

const LONG_TTL_MS = 60_000; // 60s for session/static config endpoints
const SHORT_TTL_MS = 5_000; // 5s for burst deduplication across components

const LONG_TTL_PATTERNS = [
  /^\/api\/me(\?|$)/,
  /^\/api\/user(\?|$)/,
  /^\/api\/settings(\?|$)/,
  /^\/api\/currency(\?|$)/,
  /^\/api\/sale-system(\?|$)/,
  /^\/api\/theme-settings\/active(\?|$)/,
  /^\/api\/preferences(\?|$)/,
  /^\/api\/license\/status(\?|$)/,
];

function getTtlForUrl(url) {
  if (typeof url !== "string" || !url.startsWith("/api/")) return 0;
  for (const regex of LONG_TTL_PATTERNS) {
    if (regex.test(url)) return LONG_TTL_MS;
  }
  return SHORT_TTL_MS;
}

function stableParamsKey(params) {
  if (!params || typeof params !== "object") return "";
  try {
    const keys = Object.keys(params).sort();
    const normalized = {};
    for (const k of keys) {
      const val = params[k];
      if (val !== undefined) normalized[k] = val;
    }
    return JSON.stringify(normalized);
  } catch {
    return "";
  }
}

function cloneResponse(res) {
  if (!res || typeof res !== "object") return res;
  let clonedData = res.data;
  try {
    if (clonedData !== null && typeof clonedData === "object") {
      clonedData =
        typeof structuredClone === "function"
          ? structuredClone(clonedData)
          : JSON.parse(JSON.stringify(clonedData));
    }
  } catch {
    // Fallback to shallow reference if non-clonable (e.g. Blob)
  }
  return { ...res, data: clonedData };
}

export function clearApiCache(prefix = null) {
  if (!prefix) {
    inflightGetMap.clear();
    responseCacheMap.clear();
    return;
  }
  for (const key of responseCacheMap.keys()) {
    if (key.includes(prefix)) {
      responseCacheMap.delete(key);
    }
  }
}

const SESSION_CONFIG_MUTATION_REGEX =
  /\/api\/(settings|theme-settings|preferences|roles|permissions|users|profile|license|login|logout)/;

function invalidateCacheForMutation(mutationUrl = "") {
  if (!mutationUrl || SESSION_CONFIG_MUTATION_REGEX.test(mutationUrl)) {
    clearApiCache();
    return;
  }
  inflightGetMap.clear();
  for (const key of responseCacheMap.keys()) {
    const parts = key.split("|");
    const cachedUrl = parts[1] || "";
    const isStaticSessionConfig = LONG_TTL_PATTERNS.some((rx) => rx.test(cachedUrl));
    if (!isStaticSessionConfig) {
      responseCacheMap.delete(key);
    }
  }
}

let notifDebounceTimer = null;
let drawerDebounceTimer = null;
let inflightSessionExtend = null;

function dispatchSessionExpiredModal() {
  try {
    window.dispatchEvent(new CustomEvent("karobar:session-expired"));
    if (window.top && window.top !== window) {
      window.top.dispatchEvent(new CustomEvent("karobar:session-expired"));
    }
  } catch {
    // ignore cross-frame dispatch errors
  }
}

function forceLogoutAndRedirect() {
  saveLastVisitedPath(window.location);
  clearApiCache();
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("token_expires_at");
  localStorage.removeItem("karobar_session_prompt_at");
  delete axios.defaults.headers.common["Authorization"];
  if (window.location.pathname !== "/") {
    window.location.assign("/");
  }
}

let isInitialized = false;

export function initAxiosAuth() {
  if (isInitialized) return;
  isInitialized = true;

  axios.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";

  // Wrap axios.get for in-flight deduplication and short-TTL memory caching
  const rawGet = axios.get.bind(axios);
  axios.get = function cachedAxiosGet(url, config) {
    const ttl = getTtlForUrl(url);
    const skipCache =
      !ttl ||
      config?.cache === false ||
      config?.signal ||
      config?.cancelToken ||
      (config?.responseType && config.responseType !== "json");

    if (skipCache) {
      return rawGet(url, config);
    }

    const token = localStorage.getItem("token") || "anon";
    const cacheKey = `${token.slice(-12)}|${url}|${stableParamsKey(config?.params)}`;
    const now = Date.now();

    const cached = responseCacheMap.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return Promise.resolve(cloneResponse(cached.response));
    }

    const existingInflight = inflightGetMap.get(cacheKey);
    if (existingInflight) {
      return existingInflight.then((res) => cloneResponse(res));
    }

    const reqPromise = rawGet(url, config)
      .then((res) => {
        inflightGetMap.delete(cacheKey);
        if (res && res.status >= 200 && res.status < 300) {
          // Bound cache size to prevent memory bloat
          if (responseCacheMap.size > 200) {
            const oldestKey = responseCacheMap.keys().next().value;
            if (oldestKey) responseCacheMap.delete(oldestKey);
          }
          responseCacheMap.set(cacheKey, {
            response: cloneResponse(res),
            expiresAt: Date.now() + ttl,
          });
        }
        return res;
      })
      .catch((err) => {
        inflightGetMap.delete(cacheKey);
        throw err;
      });

    inflightGetMap.set(cacheKey, reqPromise);
    return reqPromise.then((res) => cloneResponse(res));
  };

  // Request interceptor to attach token on every request
  // This ensures the token is always available even if localStorage changes
  axios.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem("token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      const method = (config?.method || "get").toLowerCase();
      const reqUrl = config?.url || "";
      if (
        ["post", "put", "patch", "delete"].includes(method) &&
        !reqUrl.includes("/api/cube/")
      ) {
        invalidateCacheForMutation(reqUrl);
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  axios.interceptors.response.use(
    (r) => {
      try {
        const method = (r?.config?.method || "get").toLowerCase();
        const url = r?.config?.url || "";
        const isCubeEndpoint = url.includes("/api/cube/");
        const cubeDidMutateProducts = Boolean(r?.data?.task_meta?.refresh_products);
        if (
          ["post", "put", "patch", "delete"].includes(method) &&
          (!isCubeEndpoint || cubeDidMutateProducts)
        ) {
          invalidateCacheForMutation(url);
        }
        if (
          ["post", "put", "patch", "delete"].includes(method) &&
          /\/api\/(sale-invoices|purchase-invoices|purchase-orders|sale-returns|purchase-returns|user-demands|stock-adjustments|stock-disposals|stocktake-sessions|batches|products)/.test(
            url
          ) &&
          !url.includes("/notifications/")
        ) {
          if (notifDebounceTimer) window.clearTimeout(notifDebounceTimer);
          notifDebounceTimer = window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("notifications-changed", { detail: { url, method } })
            );
          }, 250);
        }
        if (
          ["post", "put", "patch", "delete"].includes(method) &&
          /\/api\/(sale-invoices|purchase-invoices|sale-returns|purchase-returns|payments|accounts|expenses|cash-drawer)/.test(
            url
          )
        ) {
          if (drawerDebounceTimer) window.clearTimeout(drawerDebounceTimer);
          drawerDebounceTimer = window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
            window.dispatchEvent(new CustomEvent("accounts-changed"));
          }, 200);
        }
      } catch {
        /* ignore event dispatch errors */
      }
      return r;
    },
    (err) => {
      const status = err?.response?.status;
      const url = err?.config?.url || "";

      // Only handle license errors from actual license-protected endpoints
      // Don't redirect for /license/status - let the LicenseContext handle it
      const isLicenseApi = url.includes("/license/");
      const isLicenseStatusEndpoint = url === "/api/license/status";
      const isAuth = url.includes("/login") || url.includes("/user") || url.includes("/me");
      const isCubeApi = url.includes("/api/cube/");

      // Never trigger a full-page browser navigation for background Cube / GuideBot requests;
      // let FeatureGuideBot catch errors and gracefully fall back without refreshing the screen.
      if (isCubeApi) {
        return Promise.reject(err);
      }

      // Only redirect to activate for 402 from protected API endpoints (not status check)
      if (status === 402 && !isLicenseApi && !isLicenseStatusEndpoint && !isAuth) {
        // stop console spam & bounce to activate
        window.location.assign("/activate");
        return Promise.reject(err);
      }

      // When a 401 occurs while logged in, do NOT abruptly close the session or lose unsaved invoice work.
      // Instead, show the "Wait 10 Minutes / Login Now" popup and extend the backend token for 10 minutes
      // so the in-flight request (e.g. saving an invoice) succeeds without data loss.
      if (status === 401 && !url.includes("/login") && !url.includes("/session/extend")) {
        const currentToken = localStorage.getItem("token");
        if (!currentToken || window.location.pathname === "/") {
          forceLogoutAndRedirect();
          return Promise.reject(err);
        }

        // Open the Session Expiry Popup ("Wait 10 Minutes" / "Login Now")
        dispatchSessionExpiredModal();

        if (err.config && !err.config._retriedAfterSessionExtend) {
          err.config._retriedAfterSessionExtend = true;
          if (!inflightSessionExtend) {
            inflightSessionExtend = axios
              .post(
                "/api/session/extend",
                { minutes: 10 },
                { headers: { Authorization: `Bearer ${currentToken}` } }
              )
              .finally(() => {
                inflightSessionExtend = null;
              });
          }

          return inflightSessionExtend
            .then(() => axios.request(err.config))
            .catch((extendErr) => {
              const extStatus = extendErr?.response?.status;
              if (extStatus === 401 || extStatus === 403) {
                forceLogoutAndRedirect();
              }
              return Promise.reject(err);
            });
        }
      }

      return Promise.reject(err);
    }
  );
}
