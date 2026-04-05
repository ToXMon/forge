FROM unsloth/unsloth:stable

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy trainer service code
COPY config.py job_manager.py train_pipeline.py app.py .

# Create output directory for merged GGUF files
RUN mkdir -p /output && chmod 777 /output

EXPOSE 5000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]
