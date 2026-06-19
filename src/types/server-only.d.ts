// The `server-only` package ships no type declarations. It is a side-effect-only import
// used as a build-time guard against importing server modules into client bundles.
declare module 'server-only'
