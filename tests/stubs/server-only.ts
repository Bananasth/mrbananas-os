// Test stub for the `server-only` package. In a real client bundle, importing
// `server-only` throws at build time; in the Node test runner there is no bundler, so we
// alias it (via vitest.config.ts) to this empty module so server modules can be imported
// and unit-tested.
export {}
