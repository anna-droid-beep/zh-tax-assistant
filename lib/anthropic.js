// lib/anthropic.js
//
// Superseded by lib/providers/ (Claude is now one of several selectable AI
// providers - see lib/providers/anthropic.js). Kept only as a re-export so
// nothing breaks if something still imports this path directly; nothing in
// this extension does anymore.

export * from "./providers/anthropic.js";
export { MissingApiKeyError } from "./errors.js";
