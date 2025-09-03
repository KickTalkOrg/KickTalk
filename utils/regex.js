// Shared regex utilities
// Escapes special regex characters in a string so it can be used in a RegExp
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
