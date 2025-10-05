#!/bin/bash
# Smoke test: Successful lookup request
# Expected: 200 OK with JSON response containing 4 filter sections

echo "Testing successful lookup request..."

# Test 1: Full payload
echo "Test 1: Full payload with hints"
curl -X POST http://localhost:8080/api/lookup \
  -H "Content-Type: application/json" \
  -d '{
    "make": "Peugeot",
    "model": "208",
    "year": 2019,
    "hints": {
      "fuel": "nafta",
      "ac": true,
      "displacement_l": 1.6
    },
    "lang": "es-AR"
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo -e "\n---\n"

# Test 2: Minimal payload
echo "Test 2: Minimal payload"
curl -X POST http://localhost:8080/api/lookup \
  -H "Content-Type: application/json" \
  -d '{
    "make": "Peugeot",
    "model": "208",
    "year": 2019
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo -e "\n---\n"

# Test 3: Health check
echo "Test 3: Health check"
curl -X GET http://localhost:8080/health \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo -e "\nSmoke tests completed!"
