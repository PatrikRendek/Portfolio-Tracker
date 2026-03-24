# ─── Stage 1: Build React Frontend ──────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Python Runtime ────────────────────────────────────
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Django project
COPY stockproject/ stockproject/
COPY stocks/ stocks/
COPY manage.py .

# Copy built frontend into Django static
COPY --from=frontend-builder /app/frontend/dist /app/staticfiles/frontend

# Collect static files
RUN python manage.py collectstatic --noinput 2>/dev/null || true

EXPOSE 8000

CMD ["gunicorn", "stockproject.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
