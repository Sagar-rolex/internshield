FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend_fastapi/requirements.txt ./backend_fastapi/requirements.txt
RUN pip install --no-cache-dir -r backend_fastapi/requirements.txt

COPY . .

CMD ["sh", "-c", "exec uvicorn backend_fastapi.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
