from sqlalchemy import JSON, MetaData, Text, event
from sqlalchemy.dialects import postgresql

DATABASE_SCHEMA = "app_private"
POSTGRES_SEARCH_PATH = f"{DATABASE_SCHEMA},public"

metadata = MetaData()
json_document_type = JSON().with_variant(postgresql.JSONB(astext_type=Text()), "postgresql")


def build_engine_connect_args(database_url: str) -> dict[str, object]:
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}
    if database_url.startswith("postgresql"):
        return {"options": f"-csearch_path={POSTGRES_SEARCH_PATH}"}
    return {}


def version_table_schema(database_url: str) -> str | None:
    if database_url.startswith("postgresql"):
        return DATABASE_SCHEMA
    return None


def inspection_schema(database_url: str) -> str | None:
    return version_table_schema(database_url)


def configure_engine(engine, database_url: str) -> None:
    """Configure search_path once for each physical database connection.

    The pool checkout hook used previously repeated this round trip for every
    request. A connect hook preserves the schema isolation while only running
    when SQLAlchemy opens a new physical connection.
    """
    if not database_url.startswith("postgresql"):
        return

    @event.listens_for(engine, "connect")
    def _set_search_path(dbapi_connection, _connection_record) -> None:
        previous_autocommit = dbapi_connection.autocommit
        cursor = dbapi_connection.cursor()
        try:
            # Keep the session setting after SQLAlchemy rolls back a request.
            dbapi_connection.autocommit = True
            cursor.execute(f"SET search_path TO {POSTGRES_SEARCH_PATH}")
        finally:
            cursor.close()
            dbapi_connection.autocommit = previous_autocommit
