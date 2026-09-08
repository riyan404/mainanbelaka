FROM python:3.12-slim-bookworm

WORKDIR /app

# Install system dependencies for OpenCV headless
RUN apt-get update && \
    apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

# Copy Python project (build context = repo root)
COPY apps/analytics-worker/pyproject.toml ./
COPY apps/analytics-worker/src/ src/

# Install Python dependencies (CPU-only: torch dari index CPU, bukan CUDA default)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir .

# Direktori penyimpanan
RUN mkdir -p /tmp/snapshots /tmp/staff-faces

EXPOSE 9100

CMD ["python", "-m", "src.main"]
