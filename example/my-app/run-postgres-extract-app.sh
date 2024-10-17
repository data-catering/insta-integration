#!/usr/bin/env bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

echo "Running my-app..."
# Run psql copy commands from Postgres container
docker exec postgres psql -Upostgres -d docker -c "COPY account.balances TO '/tmp/balances.csv' WITH (FORMAT CSV, HEADER);"
docker exec postgres psql -Upostgres -d docker -c "COPY account.transactions TO '/tmp/transactions.csv' WITH (FORMAT CSV, HEADER);"

# Copy files from Postgres container to shared folder
mkdir -p "${SCRIPT_DIR}"/shared/generated
sudo docker cp postgres:/tmp/balances.csv "${SCRIPT_DIR}"/shared/generated/balances.csv
sudo docker cp postgres:/tmp/transactions.csv "${SCRIPT_DIR}"/shared/generated/transactions.csv

echo "Finished running my-app!"