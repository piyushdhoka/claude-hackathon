"""Face biometric service (feature-flagged) — InsightFace ArcFace embeddings.

Used for AUTHORIZED humanitarian reunification, never surveillance:
- produces a 512-d normalized face embedding from a captured photo,
- does 1:N cosine search over stored case embeddings,
- ALWAYS returns ranked candidates for HUMAN confirmation (never auto-confirms).

Privacy by design: the matchable store keeps EMBEDDINGS, not raw images. The
photo is transient (human-confirm only) and purged after reunion.

Everything degrades gracefully: if InsightFace / onnxruntime is not installed or
the model can't load, `model_available()` is False, embed() returns None and
search() returns [] — the rest of the system (Claude-vision visual analysis,
text matching) is unaffected. Enable with FACE_MATCH_ENABLED=true once the model
is present.
"""
from __future__ import annotations

import base64
import logging
from functools import lru_cache
from typing import Any, Optional

from ..config import settings
from ..models import MatchCandidate
from ..registry import store

logger = logging.getLogger("setu.face")

_EMBED_DIM = 512


def enabled() -> bool:
    return bool(settings.face_match_enabled)


@lru_cache(maxsize=1)
def _model() -> Any:
    """Build (once) the InsightFace analyzer, or None if unavailable.

    buffalo_l (ArcFace R50) on the ONNX CPU provider. Auto-downloads on first
    use; pre-download for offline operation. Any failure -> None (graceful).
    """
    try:
        import numpy as np  # noqa: F401  (ensures numpy present before insightface)
        from insightface.app import FaceAnalysis

        app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        app.prepare(ctx_id=-1, det_size=(640, 640))  # ctx_id=-1 -> CPU
        return app
    except Exception as exc:  # not installed / model missing / load error
        logger.warning("Face model unavailable; face matching disabled: %s", exc)
        return None


def model_available() -> bool:
    return _model() is not None


def _decode_image(image_b64: str):
    """Decode a base64 (optionally data-URL) image to a BGR ndarray, or None."""
    try:
        import cv2
        import numpy as np

        if "," in image_b64 and image_b64.strip().startswith("data:"):
            image_b64 = image_b64.split(",", 1)[1]
        raw = base64.b64decode(image_b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception as exc:
        logger.warning("image decode failed: %s", exc)
        return None


def embed(image_b64: str) -> Optional[list[float]]:
    """Return a normalized 512-d face embedding for the largest face, or None."""
    if not enabled():
        return None
    app = _model()
    if app is None:
        return None
    img = _decode_image(image_b64)
    if img is None:
        return None
    try:
        import numpy as np

        faces = app.get(img)
        if not faces:
            return None
        # Largest detected face (closest / most prominent person).
        face = max(faces, key=lambda f: float(
            (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])))
        emb = getattr(face, "normed_embedding", None)
        if emb is None:
            emb = face.embedding / (np.linalg.norm(face.embedding) or 1.0)
        return [float(x) for x in np.asarray(emb, dtype="float32").tolist()]
    except Exception as exc:
        logger.warning("face embed failed: %s", exc)
        return None


def _cosine(a: list[float], b: list[float]) -> float:
    import numpy as np

    va, vb = np.asarray(a, "float32"), np.asarray(b, "float32")
    na, nb = float(np.linalg.norm(va)), float(np.linalg.norm(vb))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


def search(
    image_b64: str,
    case_type: Optional[str] = "missing",
    top_k: int = 5,
) -> list[MatchCandidate]:
    """1:N face search over stored case embeddings. Ranked, for HUMAN confirm.

    Returns [] (gracefully) when disabled, model missing, no face found, or no
    enrolled embeddings exist yet.
    """
    if not enabled():
        return []
    q = embed(image_b64)
    if q is None:
        return []

    results: list[MatchCandidate] = []
    for case in store.iter_cases(case_type):
        emb = case.get("face_embedding")
        if not emb:
            continue
        cos = _cosine(q, emb)
        score = max(0.0, min(1.0, cos)) * 100.0
        results.append(MatchCandidate(
            case_id=case["case_id"],
            score=round(score, 2),
            contributions={"face": round(score, 2)},
            case=store.mask_case(case),
        ))
    results.sort(key=lambda c: (-c.score, c.case_id))
    return results[:top_k]
