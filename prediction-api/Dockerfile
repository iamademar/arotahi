# Serving image for the prediction API.
#
# python:3.11-slim matches the venv the model was trained in. The scikit-learn
# and lightgbm pins in requirements.txt are load-bearing, not cosmetic: the saved
# bundle unpickles estimator objects from those libraries, and a version skew
# either fails to load or, worse, loads and scores differently.
#
# Build context is this directory, not the repo root, so data/ and models/ are
# baked in. They are gitignored but present on the build machine; the image is
# the only thing that carries them to production.
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# lightgbm links against OpenMP at import time and python:3.11-slim does not
# ship it. Without libgomp1 the model unpickle dies with
# "libgomp.so.1: cannot open shared object file".
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first so the layer caches across code changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Layout matters: app/dependencies.py derives SERVICE_ROOT as parents[1] of
# itself and inserts SERVICE_ROOT/vendor on sys.path, so with app/ at /app/app
# the vendored cas_area library must sit at /app/vendor, and data/ and models/
# at /app/data and /app/models. Do not flatten these.
COPY vendor ./vendor
COPY app ./app
COPY data ./data
COPY models ./models

EXPOSE 8000

# --workers 1 is deliberate: each worker loads its own copy of the model and the
# scored year frames (~570 MB peak), so a second worker would not fit the 1 GiB
# container. Scale out with replicas instead.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
