CREATE DATABASE docker;
\c docker;
CREATE SCHEMA IF NOT EXISTS account;

CREATE TABLE IF NOT EXISTS account.balances
(
    account_number VARCHAR(20) NOT NULL,
    create_time    TIMESTAMP,
    account_status VARCHAR(20),
    balance        DOUBLE PRECISION,
    PRIMARY KEY (account_number)
);

CREATE TABLE IF NOT EXISTS account.transactions
(
    account_number VARCHAR(20) NOT NULL REFERENCES account.balances (account_number),
    create_time    TIMESTAMP,
    transaction_id VARCHAR(20),
    amount         DOUBLE PRECISION,
    PRIMARY KEY (account_number, create_time, transaction_id)
);