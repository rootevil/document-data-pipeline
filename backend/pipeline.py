import io
import pandas as pd
import pdfplumber

def clean_text_block(raw_text: str) -> str:
    """Removes blank lines and extra spaces from messy text."""
    cleaned_lines = []
    for line in raw_text.splitlines():
        # Collapse multiple spaces into a single space and trim ends
        clean_line = " ".join(line.split())
        if clean_line:  # Skip empty lines
            cleaned_lines.append(clean_line)
    return "\n".join(cleaned_lines)


def clean_cell_value(val):
    """Makes sure spreadsheet values are clean and safe to save as JSON."""
    if pd.isna(val):
        return ""
    if isinstance(val, (int, float)):
        return val
    return " ".join(str(val).split())


def process_document(filename: str, file_bytes: bytes) -> dict:
    """
    Main Data Pipeline:
    1. Detects file type (.pdf, .xlsx, .csv, .txt)
    2. Extracts raw content
    3. Cleans messy spacing/empty rows
    4. Returns a structured dictionary ready for PostgreSQL
    """
    lower_name = filename.lower()

    # --- 1. PDF PIPELINE ---
    if lower_name.endswith(".pdf"):
        pages_data = []
        all_text_parts = []

        # io.BytesIO lets Python read the uploaded file directly from memory
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                raw_page_text = page.extract_text() or ""
                cleaned_page_text = clean_text_block(raw_page_text)
                
                pages_data.append({
                    "page": page_num,
                    "text": cleaned_page_text
                })
                if cleaned_page_text:
                    all_text_parts.append(cleaned_page_text)

        full_cleaned_text = "\n\n".join(all_text_parts)
        if not full_cleaned_text:
            full_cleaned_text = "[No selectable text found — PDF may be a scanned image]"

        return {
            "file_type": "PDF",
            "cleaned_text": full_cleaned_text,
            "structured_data": {
                "total_pages": len(pages_data),
                "pages": pages_data
            }
        }

    # --- 2. EXCEL & CSV PIPELINE ---
    elif lower_name.endswith((".xlsx", ".xls", ".csv")):
        if lower_name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes))
            file_type = "CSV"
        else:
            df = pd.read_excel(io.BytesIO(file_bytes))
            file_type = "Excel"

        # Clean: Drop completely empty rows and completely empty columns
        df = df.dropna(how="all").dropna(axis=1, how="all")

        # Clean: Trim whitespace from column headers
        df.columns = [" ".join(str(col).split()) for col in df.columns]

        # Clean: Normalize every cell so there are no NaN or weird date objects
        cleaned_rows = []
        for _, row in df.iterrows():
            clean_row = {col: clean_cell_value(row[col]) for col in df.columns}
            cleaned_rows.append(clean_row)

        # Create a readable text version of the table for quick viewing
        cleaned_text = df.fillna("").to_string(index=False)

        return {
            "file_type": file_type,
            "cleaned_text": cleaned_text,
            "structured_data": {
                "total_rows": len(cleaned_rows),
                "columns": list(df.columns),
                "rows": cleaned_rows
            }
        }

    # --- 3. PLAIN TEXT PIPELINE ---
    elif lower_name.endswith(".txt"):
        raw_text = file_bytes.decode("utf-8", errors="ignore")
        cleaned_text = clean_text_block(raw_text)
        lines = cleaned_text.splitlines()

        return {
            "file_type": "Text",
            "cleaned_text": cleaned_text,
            "structured_data": {
                "total_lines": len(lines),
                "lines": lines
            }
        }

    else:
        raise ValueError("Unsupported file type. Please upload a PDF, Excel (.xlsx), CSV, or TXT file.")
