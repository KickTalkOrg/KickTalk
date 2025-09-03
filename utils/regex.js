// Shared regex utilities
// Escapes special regex characters in a string so it can be used in a RegExp
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Creates a mention regex for a specific username
// Handles username variations (hyphens/underscores interchangeable)
// Uses proper word boundaries to avoid false positives
export function createMentionRegex(username) {
  if (!username) return null;
  
  try {
    const normalizedUsername = username.toLowerCase();
    const bare = normalizedUsername.replace(/[-_]/g, "");
    if (!bare) return null;
    
    const userPattern = bare
      .split("")
      .map((ch) => escapeRegex(ch))
      .join("[-_]?");
    
    // Allow start-of-line or any non-username char before '@'
    // Use negative lookahead to prevent embedding in larger usernames
    return new RegExp(`(?:^|[^A-Za-z0-9_-])@${userPattern}(?![A-Za-z0-9_-])`, "i");
  } catch {
    return null;
  }
}
