FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt setup.py README.md ./
COPY sentryfl ./sentryfl

RUN pip install --upgrade pip \
    && pip install .

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "from urllib.request import urlopen; urlopen('http://localhost:5000/health', timeout=3)"

CMD ["uvicorn", "sentryfl.api.app:app", "--host", "0.0.0.0", "--port", "5000"]