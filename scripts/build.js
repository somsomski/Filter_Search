#!/usr/bin/env node

import fs from 'fs';

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
