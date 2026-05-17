"""
Async SQLAlchemy engine, session factory, and DB lifecycle helpers.

The DATABASE_URL env var typically comes from Railway's ``${{Postgres.DATABASE_URL}}``
reference variable, which resolves to ``postgresql://...``. SQLAlchemy's
``create_async_engine`` interprets that as wanting the sync ``psycopg2`` driver
and crashes with ``No module named 'psycopg2'``. We auto-normalize the URL
to ``postgresql+asyncpg://...`` here so callers can paste any standard
PostgreSQL URL without worrying about driver suffix.
"""

from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from config.settings import settings


def _normalize_async_db_url(url: str) -> str:
    """
    Force any Postgres URL to use the asyncpg driver.

    Accepts:
      - ``postgresql://user:pass@host:port/db``          (Railway reference var)
      - ``postgres://user:pass@host:port/db``            (legacy Heroku style)
      - ``postgresql+asyncpg://user:pass@host:port/db``  (already correct, pass-through)
    Returns the asyncpg-flavored form in every case.
    """
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


engine = create_async_engine(
    _normalize_async_db_url(settings.DATABASE_URL),
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@asynccontextmanager
async def get_session():
    """Yield an async session and guarantee cleanup."""
    session = async_session_factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def init_db():
    """Create all tables defined in models.py (idempotent)."""
    from bot.persistence.models import Base  # local import to avoid circular deps

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
