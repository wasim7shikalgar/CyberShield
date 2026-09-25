FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    ENABLE_MEDIA_DETECTORS=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        libportaudio2 \
        portaudio19-dev \
        gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.audio.txt .
RUN pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    torch torchvision torchaudio
RUN pip install --no-cache-dir -r requirements.audio.txt

COPY . .

EXPOSE 7860

CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "1", "--threads", "100", "--timeout", "300", "app:app"]
