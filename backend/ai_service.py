from typing import Optional
import numpy as np
import ollama
from pydantic import BaseModel


# Keep schema clean without extra Field metadata so grammar compilation is instant
class DocumentInsights(BaseModel):
    detected_category: str
    party_name: str
    summary: str
    total_amount: Optional[float]
    currency: str
    key_entities: list[str]


def analyze_document(filename: str, cleaned_text: str) -> dict:
    """Uses local Ollama (llama3.2) locked to a fast 4k GPU context window."""
    compact_text = "\n".join(
        " ".join(line.split()) for line in cleaned_text.splitlines() if line.strip()
    )

    prompt = f"""Analyze this document and return JSON with:
- detected_category: best match from "Resume", "Vendor Ledger", "Invoice", "Rent Statement", "Contract", or "Report"
- party_name: main person, company, vendor, or client name
- summary: 2 to 3 informative sentences summarizing the document's key facts, dates, or figures
- total_amount: main total or balance as a plain number if present, otherwise null
- currency: "PKR", "Rs.", "USD", or "Unknown"
- key_entities: list of 4 to 8 specific organizations, skills, banks, or invoice numbers mentioned

Filename: {filename}

Document Content:
{compact_text[:4500]}
"""

    response = ollama.chat(
        model="llama3.2",
        messages=[{"role": "user", "content": prompt}],
        format=DocumentInsights.model_json_schema(),
        options={
            "temperature": 0.1,
            "num_ctx": 4096,      # Keeps model at ~2.5 GB on 100% GPU instead of 18 GB
            "num_predict": 400,   # Caps output length so it never rambles or hangs
        },
    )

    raw_json = response["message"]["content"]
    validated = DocumentInsights.model_validate_json(raw_json)
    return validated.model_dump()


def generate_embedding(text: str) -> list[float]:
    """Uses local Ollama (nomic-embed-text) to turn compact text into a search vector."""
    compact = " ".join(text.split())
    response = ollama.embed(
        model="nomic-embed-text",
        input=compact[:4000],
        options={"num_ctx": 2048},
    )
    return response["embeddings"][0]


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Measures how similar two meaning-vectors are (1.0 = identical, 0.0 = unrelated)."""
    a = np.array(vec_a)
    b = np.array(vec_b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    if norm == 0:
        return 0.0
    return float(np.dot(a, b) / norm)
