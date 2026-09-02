import '@testing-library/jest-dom/vitest'

// jsdom does not implement matchMedia, and MotionConfig reads it to detect the
// reduced-motion preference. Without this every component test that renders a
// motion element throws before its first assertion.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
