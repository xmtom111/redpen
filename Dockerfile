# Browser demo. Canned rounds need no API key.
# Optional live rounds: pass REDPEN_API_KEY, REDPEN_BASE_URL, and REDPEN_MODEL
# at run time (Hugging Face Space secrets, or docker run -e). Do not bake them
# into the image.
FROM python:3.12-slim

WORKDIR /app

COPY redpen.py AGENTS.md LICENSE NOTICE README.md ./
COPY demo ./demo

RUN pip install --no-cache-dir sympy \
    && adduser --disabled-password --gecos "" redpen \
    && chown -R redpen:redpen /app

USER redpen

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 7860

CMD ["python", "redpen.py", "demo", "--host", "0.0.0.0", "--port", "7860", "--no-open"]
