FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
ENV PORT=8080
# Not a public deploy. Cloud Run: --no-allow-unauthenticated + GROUND_SIDECAR_TOKEN.
CMD ["python", "app.py"]
