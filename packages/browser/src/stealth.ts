// ---------------------------------------------------------------------------
// Stealth options & injection script
// ---------------------------------------------------------------------------

/** Configuration controlling stealth / anti-detection behaviour. */
export interface StealthOptions {
  /** Master switch — when false, no stealth measures are applied. */
  enabled: boolean;
  /** Override navigator.webdriver → false. */
  hideWebdriver: boolean;
  /** Override navigator.plugins → non‑empty array. */
  spoofPlugins: boolean;
  /** Override navigator.languages → ['zh-CN','en-US']. */
  spoofLanguages: boolean;
  /** Randomise viewport size slightly on each navigation. */
  randomizeViewport: boolean;
  /** Enable broadly‑used evasion helper (clears __webdriver_* etc.). */
  evadeDetection: boolean;
}

/** Safe defaults — conservative but effective. */
export const DEFAULT_STEALTH_OPTIONS: StealthOptions = {
  enabled: true,
  hideWebdriver: true,
  spoofPlugins: true,
  spoofLanguages: true,
  randomizeViewport: false,
  evadeDetection: true,
};

/**
 * JavaScript string that is injected into every page context to
 * hide Playwright/automation fingerprints.
 *
 * The script is a self‑executing function so it runs immediately
 * and can be easily stringified / passed to page.addInitScript().
 */
export const STEALTH_INJECT_SCRIPT = /* javascript */ `
;(function stealthInject() {
  // 1. Hide navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
    configurable: true,
  });

  // 2. Spoof plugins — non‑empty array
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const arr = [
        { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohnciefmlbmh' },
        { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' },
      ];
      arr.item = (i) => arr[i] || null;
      arr.namedItem = (n) => arr.find((p) => p.name === n) || null;
      arr.refresh = () => {};
      return arr;
    },
    configurable: true,
  });

  // 3. Spoof languages
  Object.defineProperty(navigator, 'languages', {
    get: () => ['zh-CN', 'en-US', 'en'],
    configurable: true,
  });
  Object.defineProperty(navigator, 'language', {
    get: () => 'zh-CN',
    configurable: true,
  });

  // 4. Fake window.chrome
  Object.defineProperty(window, 'chrome', {
    get: () => ({
      runtime: {},
      loadTimes: () => {},
      csi: () => {},
      app: {},
    }),
    configurable: true,
  });

  // 5. Fake hardwareConcurrency
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    get: () => 8,
    configurable: true,
  });

  // 6. Remove automation markers
  delete window.__webdriver_evaluate;
  delete window.__selenium_evaluate;
  delete window.__webdriver_script_function;
  delete window.__webdriver_script_func;
  delete window.__webdriver_script_fn;
  delete window.__fxdriver_evaluate;
  delete window.__driver_unwrapped;
  delete window.__webdriver_unwrapped;
  delete window.__selenium_unwrapped;
  delete window.__fxdriver_unwrapped;
  delete document.__webdriver_evaluate;
  delete document.__selenium_evaluate;
  delete document.__webdriver_script_function;
  delete document.__webdriver_script_func;
  delete document.__webdriver_script_fn;
  delete document.__fxdriver_evaluate;
  delete document.__driver_unwrapped;
  delete document.__webdriver_unwrapped;
  delete document.__selenium_unwrapped;
  delete document.__fxdriver_unwrapped;

  // 7. Override permissions API
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = function(parameters) {
    if (parameters.name === 'notifications') {
      return Promise.resolve({ state: Notification.permission });
    }
    return originalQuery.call(this, parameters);
  };
})();
`;
