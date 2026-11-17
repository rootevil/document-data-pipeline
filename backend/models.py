from sqlalchemy import Column, Integer, String, Text, JSON
from database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    category = Column(String, default="General")
    cleaned_text = Column(Text, nullable=False)
    structured_data = Column(JSON, nullable=False)
    ai_insights = Column(JSON, nullable=False)
    embedding = Column(JSON, nullable=True)
