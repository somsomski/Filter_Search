#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Copy public directory if it exists first
if (fs.existsSync('public')) {
  console.log('Copying public directory to dist/public...');
  // Use cp command for cross-platform copying
  try {
    if (process.platform === 'win32') {
      execSync('xcopy /E /I /Y public dist\\public', { stdio: 'inherit' });
    } else {
      execSync('cp -r public dist/public', { stdio: 'inherit' });
    }
    console.log('Public directory copied successfully!');
  } catch (error) {
    console.error('Failed to copy public directory:', error.message);
    process.exit(1);
  }
}

console.log('Checking pre-compiled JavaScript files...');

try {
  // Check if dist directory exists and has the required files
  if (!fs.existsSync('dist')) {
    console.error('dist directory not found!');
    process.exit(1);
  }

  const requiredFiles = [
    'dist/src/server.js',
    'dist/src/db.js',
    'dist/src/formatter.js',
    'dist/src/lookup.js',
    'dist/src/routes.js',
    'dist/src/types.js'
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      console.error(`Required file ${file} not found!`);
      process.exit(1);
    }
  }
  
  console.log('All required files found! Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
