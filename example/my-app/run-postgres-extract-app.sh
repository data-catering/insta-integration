#!/usr/bin/env bash

echo "Running my-app..."
# Run psql copy commands from Postgres container
docker exec postgres psql -Upostgres -d docker -c "COPY account.balances TO '/tmp/balances.csv' WITH (FORMAT CSV, HEADER);"
docker exec postgres psql -Upostgres -d docker -c "COPY account.transactions TO '/tmp/transactions.csv' WITH (FORMAT CSV, HEADER);"

# Copy files from Postgres container to shared folder
mkdir -p /tmp/insta-integration/shared/generated
docker cp postgres:/tmp/balances.csv /tmp/insta-integration/shared/generated/balances.csv
docker cp postgres:/tmp/transactions.csv /tmp/insta-integration/shared/generated/transactions.csv

echo "Finished running my-app!"