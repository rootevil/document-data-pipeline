from typing import Any
from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

import models
from database import engine, SessionLocal
from pipeline import process_document
from ai_service import analyze_document, generate_embedding, cosine_similarity

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class DocumentResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    category: str
    cleaned_text: str
    structured_data: dict[str, Any]
    ai_insights: dict[str, Any]
    model_config = ConfigDict(from_attributes=True)

class SearchResult(BaseModel):
    document: DocumentResponse
    similarity_score: float

@app.get("/")
def home():
    return {"message": "AI Document Pipeline API is running!"}

@app.get("/api/documents", response_model=list[DocumentResponse])
def get_documents(db: Session = Depends(get_db)):
    return db.query(models.Document).order_by(models.Document.id.desc()).all()

@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
    return {"deleted_id": doc_id}

@app.post("/api/documents/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    category: str = Form("Auto"),
    db: Session = Depends(get_db)
):
    file_bytes = await file.read()
    filename = file.filename or "untitled"

    # 1. Deterministic Pipeline: Extract -> Clean -> Structure
    try:
        pipeline_result = process_document(filename, file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File parsing failed: {str(e)}")

    # 2. AI Pipeline: Classify, Extract Insights & Generate Rich Search Embedding
    try:
        insights = analyze_document(filename, pipeline_result["cleaned_text"])
        entities_str = ", ".join(insights.get("key_entities", []))
        searchable_text = (
            f"Filename: {filename}. "
            f"Category: {insights.get('detected_category', '')}. "
            f"Party: {insights.get('party_name', '')}. "
            f"Entities: {entities_str}. "
            f"Summary: {insights.get('summary', '')}. "
            f"Content: {pipeline_result['cleaned_text']}"
        )
        embedding_vector = generate_embedding(searchable_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI processing failed: {str(e)}")

    final_category = insights.get("detected_category", category) if category == "Auto" else category

    # 3. Save everything to PostgreSQL
    new_doc = models.Document(
        filename=filename,
        file_type=pipeline_result["file_type"],
        category=final_category,
        cleaned_text=pipeline_result["cleaned_text"],
        structured_data=pipeline_result["structured_data"],
        ai_insights=insights,
        embedding=embedding_vector,
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    return new_doc

@app.get("/api/search", response_model=list[SearchResult])
def search_documents(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Hybrid search: combines semantic vector similarity with exact keyword/entity matching."""
    query_vector = generate_embedding(q)
    query_terms = [term.lower() for term in q.split() if len(term) > 1]
    all_docs = db.query(models.Document).all()

    scored_results = []
    for doc in all_docs:
        if not doc.embedding:
            continue

        # Base semantic score (0.0 to 1.0)
        semantic_score = cosine_similarity(query_vector, doc.embedding)

        # Keyword & entity match boost
        haystack = f"{doc.filename} {doc.category} {doc.ai_insights} {doc.cleaned_text}".lower()
        keyword_hits = sum(1 for term in query_terms if term in haystack)
        keyword_boost = (keyword_hits / len(query_terms)) * 0.35 if query_terms else 0.0

        final_score = min(1.0, semantic_score + keyword_boost)

        # Only return genuinely relevant matches
        if final_score >= 0.42:
            scored_results.append({"document": doc, "similarity_score": round(final_score, 4)})

    scored_results.sort(key=lambda x: x["similarity_score"], reverse=True)
    return scored_results
