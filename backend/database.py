from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Connects to your local PostgreSQL database using your Mac username (bilal)
DATABASE_URL = "postgresql://bilal@localhost:5432/doc_portal"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
