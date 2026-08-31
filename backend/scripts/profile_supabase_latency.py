"""Profile Supabase connection and SQL latency without mutating application data.

The configured database URL is loaded through the backend settings. DML samples
run against a temporary table and are rolled back after each statement.
"""

from __future__ import annotations

import argparse
import statistics
import sys
import time
from dataclasses import dataclass
from urllib.parse import urlsplit
from uuid import uuid4

import psycopg

from voice_backend.config import Settings


@dataclass(frozen=True)
class SampleStats:
    name: str
    values_ms: list[float]

    @property
    def minimum(self) -> float:
        return min(self.values_ms)

    @property
    def median(self) -> float:
        return statistics.median(self.values_ms)

    @property
    def p95(self) -> float:
        ordered = sorted(self.values_ms)
        index = min(len(ordered) - 1, round(0.95 * (len(ordered) - 1)))
        return ordered[index]

    @property
    def maximum(self) -> float:
        return max(self.values_ms)


def elapsed_ms(callback) -> float:
    started = time.perf_counter()
    callback()
    return (time.perf_counter() - started) * 1000


def stats(name: str, values_ms: list[float]) -> SampleStats:
    if not values_ms:
        raise ValueError(f"No samples collected for {name}")
    return SampleStats(name=name, values_ms=values_ms)


def format_stats(result: SampleStats) -> str:
    return (
        f"{result.name:<25}"
        f" min {result.minimum:>8.1f} ms"
        f" median {result.median:>8.1f} ms"
        f" p95 {result.p95:>8.1f} ms"
        f" max {result.maximum:>8.1f} ms"
    )


def run_cold_connection_samples(dsn: str, samples: int) -> tuple[SampleStats, SampleStats]:
    connect_times: list[float] = []
    select_times: list[float] = []

    for _ in range(samples):
        connection: psycopg.Connection | None = None
        try:
            started = time.perf_counter()
            connection = psycopg.connect(dsn, connect_timeout=10)
            connect_times.append((time.perf_counter() - started) * 1000)
            with connection.cursor() as cursor:
                select_times.append(
                    elapsed_ms(lambda: (cursor.execute("SELECT 1"), cursor.fetchone()))
                )
        finally:
            if connection is not None:
                connection.close()

    return stats("cold connect", connect_times), stats("cold SELECT 1", select_times)


def run_warm_query_samples(
    connection: psycopg.Connection,
    statement: str,
    samples: int,
    name: str,
    fetch: bool = False,
) -> SampleStats:
    timings: list[float] = []
    with connection.cursor() as cursor:
        for _ in range(samples):
            connection.execute("BEGIN")
            try:

                def execute() -> None:
                    cursor.execute(statement)
                    if fetch:
                        cursor.fetchone()

                timings.append(elapsed_ms(execute))
            finally:
                connection.rollback()
    return stats(name, timings)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=20, help="Measured samples per operation")
    parser.add_argument("--warmup", type=int, default=3, help="Warmup queries before measurement")
    args = parser.parse_args()

    if args.samples < 5:
        parser.error("--samples must be at least 5")
    if args.warmup < 0:
        parser.error("--warmup cannot be negative")

    settings = Settings()
    dsn = settings.database_dsn
    endpoint = urlsplit(dsn)

    print("Supabase latency profile")
    print(f"environment: {settings.environment}")
    print(f"endpoint: {endpoint.hostname}:{endpoint.port or 5432}/{endpoint.path.lstrip('/')}")
    print(f"samples: {args.samples} measured, {args.warmup} warmup")
    print("credentials: omitted")
    print()

    try:
        cold_connect, cold_select = run_cold_connection_samples(dsn, args.samples)
    except Exception as error:  # pragma: no cover - exercised against an external service
        print(f"Unable to connect to the configured Supabase endpoint: {error}", file=sys.stderr)
        return 1

    print(format_stats(cold_connect))
    print(format_stats(cold_select))

    table_name = f"latency_probe_{uuid4().hex[:12]}"
    create_statement = (
        f"CREATE TEMP TABLE {table_name} "
        "(id INTEGER PRIMARY KEY, value TEXT NOT NULL) ON COMMIT PRESERVE ROWS"
    )
    seed_statement = f"INSERT INTO {table_name} (id, value) VALUES (1, 'seed')"
    insert_statement = f"INSERT INTO {table_name} (id, value) VALUES (2, 'sample')"
    update_statement = f"UPDATE {table_name} SET value = 'updated' WHERE id = 1"
    delete_statement = f"DELETE FROM {table_name} WHERE id = 1"

    with psycopg.connect(dsn, connect_timeout=10) as connection:
        with connection.cursor() as cursor:
            for _ in range(args.warmup):
                cursor.execute("SELECT 1")
                cursor.fetchone()
        connection.commit()

        # CREATE is measured independently. Rollback removes the temp table.
        create_result = run_warm_query_samples(
            connection,
            create_statement,
            args.samples,
            "CREATE TEMP TABLE",
        )

        # Create a durable-in-session fixture once; every measured mutation is
        # rolled back, keeping the same row available for the next sample.
        with connection.cursor() as cursor:
            cursor.execute(create_statement)
            cursor.execute(seed_statement)
        connection.commit()

        insert_result = run_warm_query_samples(
            connection, insert_statement, args.samples, "INSERT temp row"
        )
        update_result = run_warm_query_samples(
            connection, update_statement, args.samples, "UPDATE temp row"
        )
        delete_result = run_warm_query_samples(
            connection, delete_statement, args.samples, "DELETE temp row"
        )
        select_result = run_warm_query_samples(
            connection,
            "SELECT id FROM app_private.calls LIMIT 1",
            args.samples,
            "SELECT app row",
            fetch=True,
        )

    print(format_stats(select_result))
    print(format_stats(create_result))
    print(format_stats(insert_result))
    print(format_stats(update_result))
    print(format_stats(delete_result))
    print()
    print("Interpretation:")
    print(
        "- cold connect includes DNS/TCP/TLS/authentication and the configured Supabase endpoint."
    )
    print("- warm query timings exclude connection acquisition and application ORM/API work.")
    print(
        "- mutation timings are temporary-table statements and are rolled back; no app rows were changed."
    )
    print(
        "- this profiles the configured database endpoint, not a separately configured direct database host."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
