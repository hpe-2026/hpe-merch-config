# Build stage
FROM python:3.11-slim as builder

WORKDIR /app

# Copy requirements first
COPY requirements.txt .

# Install dependencies using pip (no apt-get needed for most packages)
RUN pip install --user --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.11-slim

WORKDIR /app

# Create non-root user
RUN useradd -m -u 1000 appuser

# Copy Python dependencies from builder
COPY --from=builder /root/.local /home/appuser/.local

# Copy application code with correct ownership
COPY --chown=appuser:appuser app ./app
COPY --chown=appuser:appuser requirements.txt .

# Set environment variables
ENV PATH=/home/appuser/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Health check using Python instead of curl (avoids apt-get/proxy issues)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=5)" || exit 1

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Start application
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
