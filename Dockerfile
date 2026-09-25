FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        libportaudio2 \
        portaudio19-dev \
        gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    torch torchvision torchaudio
RUN grep -viE '^\s*(torch|torchvision|torchaudio)([<=>].*)?\s*$' requirements.txt \
    > /tmp/requirements.render.txt \
    && pip install --no-cache-dir -r /tmp/requirements.render.txt \
    && rm -f /tmp/requirements.render.txt

COPY . .

EXPOSE 7860

CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "1", "--threads", "100", "--timeout", "300", "app:app"]
