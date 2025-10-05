#!/bin/bash
# Smoke test: Invalid lookup requests
# Expected: 400 Bad Request with error messages

echo "Testing invalid lookup requests..."

# Test 1: Empty make
echo "Test 1: Empty make"
curl -X POST http://localhost:8080/api/lookup \
  -H "Content-Type: application/json" \
  -d '{
    "make": "",
    "model": "208",
    "year": 2019
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo -e "\n---\n"

# Test 2: Missing model
echo "Test 2: Missing model"
curl -X POST http://localhost:8080/api/lookup \
  -H "Content-Type: application/json" \
  -d '{
    "make": "Peugeot",
    "year": 2019
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo -e "\n---\n"

# Test 3: Invalid year (string)
echo "Test 3: Invalid year (string)"
curl -X POST http://localhost:8080/api/lookup \
  -H "Content-Type: application/json" \
  -d '{
    "make": "Peugeot",
    "model": "208",
    "year": "abcd"
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo -e "\n---\n"

# Test 4: Year out of range
echo "Test 4: Year out of range"
curl -X POST http://localhost:8080/api/lookup \
  -H "Content-Type: application/json" \
  -d '{
    "make": "Peugeot",
    "model": "208",
    "year": 1800
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo -e "\n---\n"

# Test 5: Missing year
echo "Test 5: Missing year"
curl -X POST http://localhost:8080/api/lookup \
  -H "Content-Type: application/json" \
  -d '{
    "make": "Peugeot",
    "model": "208"
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo -e "\nInvalid request tests completed!"
