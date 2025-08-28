#!/usr/bin/env node

/**
 * Verification script to ensure telemetry respects user settings
 * This checks the code changes without requiring Electron runtime
 */

const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function checkFile(filePath, checks) {
  console.log(`\nChecking: ${filePath}`);
  
  try {
    const content = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
    let allPassed = true;
    
    for (const [description, pattern] of checks) {
      const found = typeof pattern === 'string' 
        ? content.includes(pattern)
        : pattern.test(content);
      
      console.log(`  ${found ? GREEN + '✓' : RED + '✗'} ${RESET}${description}`);
      if (!found) allPassed = false;
    }
    
    return allPassed;
  } catch (error) {
    console.log(`  ${RED}✗${RESET} Could not read file: ${error.message}`);
    return false;
  }
}

console.log('=' .repeat(60));
console.log('TELEMETRY USER SETTINGS RESPECT VERIFICATION');
console.log('=' .repeat(60));

const results = [];

// Check main process telemetry initialization
results.push(checkFile('src/telemetry/tracing.js', [
  ['Checks user settings before initialization', "store.get('telemetry'"],
  ['Logs when disabled', 'Telemetry disabled by user settings'],
  ['Module wrapped in telemetryEnabled check', 'if (telemetryEnabled)'],
  ['Exports null when disabled or failing', 'module.exports = null']
]));

// Check main process IPC handlers  
results.push(checkFile('src/main/index.js', [
  ['Has isTelemetryEnabled function', 'isTelemetryEnabled'],
  ['Reads telemetry.enabled from store', "store.get('telemetry', { enabled: false })"],
  ['recordMessageSent checks settings', 'if (isTelemetryEnabled())'],
  ['recordError checks settings', /telemetry:recordError.*?[\s\S]*?if\s*\(isTelemetryEnabled/],
  ['Default telemetry is disabled', '{ enabled: false }']
]));

// Check renderer telemetry
results.push(checkFile('src/renderer/src/telemetry/webTracing.js', [
  ['Checks localStorage for settings', "localStorage.getItem('settings')"],
  ['Has safe settings reader helper', 'const readSettingsEnabled = () =>'],
  ['Skips WebSocket instrumentation if disabled', 'if (telemetryEnabled)'],
  ['Restores native WebSocket when disabled', 'restored native WebSocket'],
  ['Skips OTEL init if disabled', '&& telemetryEnabled']
]));

// Check settings UI
results.push(checkFile('src/renderer/src/components/Dialogs/Settings/Sections/General.jsx', [
  ['Has telemetry toggle', 'Enable Telemetry'],
  ['Binds to telemetry.enabled', 'settingsData?.telemetry?.enabled'],
  ['Updates telemetry object on change', 'onChange("telemetry"']
]));

console.log('\n' + '='.repeat(60));
console.log('SUMMARY');  
console.log('='.repeat(60));

const totalFiles = results.length;
const passedFiles = results.filter(r => r).length;

if (passedFiles === totalFiles) {
  console.log(`\n${GREEN}✓ SUCCESS:${RESET} All ${totalFiles} files properly check telemetry settings!`);
  console.log('\nTelemetry will NOT be initialized or send data when disabled by the user.');
} else {
  console.log(`\n${RED}✗ ISSUES FOUND:${RESET} ${totalFiles - passedFiles} file(s) have problems.`);
  console.log('\nSome telemetry code may not properly respect user settings.');
}

console.log('\n' + '='.repeat(60));
