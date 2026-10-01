"""
@file knowledge_base.py
@description RAG pipeline — embed query → vector search → return context.

Storage backends (in priority order):
  1. Pinecone (production) — PINECONE_API_KEY + PINECONE_INDEX_NAME set
  2. Local in-memory store (development / testing) — zero dependencies

Knowledge domains indexed:
  - OCPP fault codes (auto-diagnosis)
  - UK electricity tariff data (Octopus Agile rate windows)
  - Charger brand manuals (EO, Rolec, Andersen, Ohme, Zappi, Wallbox)
  - UK EV regulations (BS EN 61851, PAS 1899:2022, OZEV)
  - Platform FAQs and support docs
  - Community troubleshooting guides

Embedding model: text-embedding-3-small (1536 dims, cost-efficient)

@module apps/ai-service/core/rag
@version 0.1.0
@since 2026-09-25
@author Zipgrid Engineering
"""

from __future__ import annotations

import os
from typing import Any

import structlog
from openai import AsyncOpenAI

log = structlog.get_logger(__name__)

# ── Seed knowledge (in-memory fallback) ──────────────────────
# These entries bootstrap the local dev store so the agent gives
# sensible answers immediately without Pinecone.

_SEED_KNOWLEDGE: list[dict[str, str]] = [
    {
        "id": "ocpp_001",
        "text": (
            "OCPP fault code ConnectorLockFailure: The connector lock mechanism failed. "
            "Common causes: debris in connector, mechanical wear. "
            "Resolution: power-cycle the charger, inspect connector for damage. "
            "If fault persists after reboot, contact manufacturer support."
        ),
        "category": "ocpp_faults",
    },
    {
        "id": "ocpp_002",
        "text": (
            "OCPP fault code EVCommunicationError: The charger cannot communicate with the EV. "
            "Common causes: pilot signal fault, cable damage. "
            "Resolution: unplug and re-plug the cable, try a different cable if available."
        ),
        "category": "ocpp_faults",
    },
    {
        "id": "ocpp_003",
        "text": (
            "OCPP fault code HighTemperature: Internal charger temperature exceeds safe threshold. "
            "Resolution: ensure ventilation around charger, check ambient temperature. "
            "Stop session immediately. Do not restart until charger has cooled."
        ),
        "category": "ocpp_faults",
    },
    {
        "id": "ocpp_004",
        "text": (
            "OCPP fault code GroundFailure: Earth fault detected on electrical supply. "
            "Safety critical — stop all sessions immediately. "
            "Do not restart. Contact a certified electrician (NICEIC/NAPIT registered)."
        ),
        "category": "ocpp_faults",
    },
    {
        "id": "tariff_001",
        "text": (
            "Octopus Agile tariff: half-hourly electricity rates tracking the wholesale market. "
            "Cheapest windows are typically overnight 00:00–06:00 and sometimes mid-morning 10:00–12:00. "
            "Rates can go negative during high renewable generation. "
            "Plunge pricing (< 0p/kWh) occurs 5–15% of hours. "
            "Best strategy: charge overnight, avoid 16:00–21:00 peak hours."
        ),
        "category": "tariffs",
    },
    {
        "id": "tariff_002",
        "text": (
            "Octopus Go tariff: fixed overnight cheap rate (typically 7.5p/kWh) from 00:30–04:30. "
            "Day rate is higher (~24p/kWh). "
            "Best for predictable overnight charging. Cheaper than Agile for high-consumption users."
        ),
        "category": "tariffs",
    },
    {
        "id": "brand_001",
        "text": (
            "EO Charging (EO Mini Pro 2/3): OCPP 1.6J compatible. "
            "Factory reset: hold button for 15 seconds until LED flashes red. "
            "Re-pair: open EO app → Add charger → scan QR on back panel. "
            "Typical fault: offline after power cut — simply power cycle."
        ),
        "category": "charger_manuals",
    },
    {
        "id": "brand_002",
        "text": (
            "Wallbox Pulsar Plus: OCPP 1.6J via myWallbox cloud or direct OCPP. "
            "To configure direct OCPP: Settings → Advanced → OCPP → enter Central System URL. "
            "Max charge rate: 7.4kW single-phase, 22kW three-phase. "
            "Common issue: drops offline after firmware update — restart via app."
        ),
        "category": "charger_manuals",
    },
    {
        "id": "brand_003",
        "text": (
            "Zappi (myenergi): solar divert mode charges EV from excess solar generation. "
            "Three modes: Fast (grid only), Eco (solar priority + grid top-up), Eco+ (solar only). "
            "OCPP not natively supported on gen1 — requires myenergi hub for integration. "
            "Hub firmware v5.x adds OCPP 1.6J support."
        ),
        "category": "charger_manuals",
    },
    {
        "id": "regulation_001",
        "text": (
            "UK BS EN 61851-1: Standard for EV conductive charging systems. "
            "Requires Mode 2 or Mode 3 charging for public/semi-public installations. "
            "All new installations must include RCD Type A protection minimum. "
            "OZEV (Office for Zero Emission Vehicles) grant requires OZEV-approved installer."
        ),
        "category": "regulations",
    },
    {
        "id": "regulation_002",
        "text": (
            "PAS 1899:2022: UK smart EV charging standard. "
            "All new charge points >3.5kW must support smart charging with demand response. "
            "Requires off-peak default charging mode. "
            "Applies to domestic and workplace installations from June 2022."
        ),
        "category": "regulations",
    },
    {
        "id": "faq_001",
        "text": (
            "How does Zipgrid pricing work? "
            "Hosts set their own rates: per kWh, per hour, per session, or hybrid. "
            "Zipgrid takes a 15% platform fee. "
            "Payment is authorised at booking time and captured when your session ends. "
            "Final charge is based on actual energy delivered (per kWh listings) or actual time."
        ),
        "category": "platform_faq",
    },
    {
        "id": "faq_002",
        "text": (
            "What is the Zipgrid arrival PIN? "
            "A 6-digit PIN is generated when your booking is confirmed. "
            "Use it at the charger for manual unlock, or show the QR code from your booking screen. "
            "The PIN is only revealed for confirmed bookings — not pending ones."
        ),
        "category": "platform_faq",
    },
    {
        "id": "faq_003",
        "text": (
            "Idle fee / overstay fee: If your EV stays connected after charging completes, "
            "hosts can charge an idle fee (typically 10p/min). "
            "You receive a push notification when charging finishes. "
            "The idle fee starts after a 5-minute grace period."
        ),
        "category": "platform_faq",
    },
]


# ── In-memory vector store (dev fallback) ─────────────────────


class InMemoryStore:
    """
    Simple cosine-similarity vector store for development.
    Embeddings computed on-demand and cached.
    Not suitable for production — use Pinecone.
    """

    def __init__(self) -> None:
        self._entries: list[dict[str, Any]] = []
        self._embeddings: list[list[float]] = []
        self._seeded = False

    def _cosine(self, a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        mag_a = sum(x * x for x in a) ** 0.5
        mag_b = sum(x * x for x in b) ** 0.5
        if mag_a == 0 or mag_b == 0:
            return 0.0
        return dot / (mag_a * mag_b)

    async def seed(self, client: AsyncOpenAI) -> None:
        if self._seeded:
            return
        log.info("seeding_in_memory_kb", count=len(_SEED_KNOWLEDGE))
        texts = [e["text"] for e in _SEED_KNOWLEDGE]
        try:
            resp = await client.embeddings.create(
                model="text-embedding-3-small",
                input=texts,
            )
            self._embeddings = [d.embedding for d in resp.data]
            self._entries = list(_SEED_KNOWLEDGE)
            self._seeded = True
        except Exception as exc:  # noqa: BLE001
            log.error("kb_seed_failed", error=str(exc))

    async def query(
        self,
        query_embedding: list[float],
        top_k: int = 3,
    ) -> list[dict[str, Any]]:
        if not self._embeddings:
            return []
        scored = [
            (self._cosine(query_embedding, emb), entry)
            for emb, entry in zip(self._embeddings, self._entries)
        ]
        scored.sort(key=lambda x: x[0], reverse=True)
        return [entry for _, entry in scored[:top_k]]


# ── Pinecone store ─────────────────────────────────────────────


class PineconeStore:
    """Pinecone vector store for production. Lazy-initialised."""

    def __init__(self, api_key: str, index_name: str) -> None:
        self._api_key = api_key
        self._index_name = index_name
        self._index: Any = None

    async def _get_index(self) -> Any:
        if self._index is not None:
            return self._index
        try:
            from pinecone import Pinecone  # type: ignore[import]
            pc = Pinecone(api_key=self._api_key)
            self._index = pc.Index(self._index_name)
        except Exception as exc:  # noqa: BLE001
            log.error("pinecone_init_failed", error=str(exc))
            raise
        return self._index

    async def query(
        self,
        query_embedding: list[float],
        top_k: int = 3,
    ) -> list[dict[str, Any]]:
        index = await self._get_index()
        results = index.query(vector=query_embedding, top_k=top_k, include_metadata=True)
        return [
            {"id": m.id, "text": m.metadata.get("text", ""), "score": m.score}
            for m in results.matches
        ]


# ── Public RAG pipeline ────────────────────────────────────────


class RAGPipeline:
    """
    Retrieval-Augmented Generation pipeline.
    Embeds the query, retrieves relevant knowledge chunks,
    returns formatted context string for injection into LLM prompt.
    """

    def __init__(self, openai_client: AsyncOpenAI) -> None:
        self._client = openai_client
        pinecone_key = os.environ.get("PINECONE_API_KEY", "")
        pinecone_index = os.environ.get("PINECONE_INDEX_NAME", "zipgrid-kb")

        if pinecone_key:
            log.info("rag_backend", backend="pinecone", index=pinecone_index)
            self._store: PineconeStore | InMemoryStore = PineconeStore(
                api_key=pinecone_key, index_name=pinecone_index
            )
        else:
            log.info("rag_backend", backend="in_memory")
            self._store = InMemoryStore()

    async def warm_up(self) -> None:
        """Seed in-memory store (no-op for Pinecone)."""
        if isinstance(self._store, InMemoryStore):
            await self._store.seed(self._client)

    async def retrieve(self, query: str, top_k: int = 3) -> str:
        """
        Retrieve relevant knowledge chunks for a query.

        Args:
            query: Natural language question or fault description
            top_k: Number of chunks to return

        Returns:
            Formatted context string ready for LLM injection.
            Empty string if retrieval fails or returns no results.
        """
        try:
            resp = await self._client.embeddings.create(
                model="text-embedding-3-small",
                input=query,
            )
            embedding = resp.data[0].embedding
        except Exception as exc:  # noqa: BLE001
            log.error("embed_query_failed", error=str(exc))
            return ""

        try:
            chunks = await self._store.query(embedding, top_k=top_k)
        except Exception as exc:  # noqa: BLE001
            log.error("kb_query_failed", error=str(exc))
            return ""

        if not chunks:
            return ""

        lines = ["Relevant knowledge:"]
        for chunk in chunks:
            lines.append(f"- {chunk.get('text', '')}")
        return "\n".join(lines)
