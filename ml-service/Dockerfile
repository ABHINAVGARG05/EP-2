FROM ghcr.io/astral-sh/uv:0.7.3 AS uv

FROM python:3.11-slim AS base

WORKDIR /app

COPY --from=uv /uv /uvx /bin/

COPY requirements.txt .
RUN uv pip install --system \
    --index-url https://pypi.org/simple \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    --index-strategy unsafe-best-match \
    -r requirements.txt

COPY model.py preprocessing.py app.py model.pth scaler.pkl ./

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]