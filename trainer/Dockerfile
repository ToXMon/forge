FROM python:3.11-slim

WORKDIR /app

# Install system deps for CUDA/PyTorch
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch with CUDA 12.1 support
RUN pip install --no-cache-dir \
    torch torchvision --index-url https://download.pytorch.org/whl/cu121

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy trainer service code
COPY config.py job_manager.py train_pipeline.py app.py .

# Create output directory for merged GGUF files
RUN mkdir -p /output && chmod 777 /output

EXPOSE 5000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]
