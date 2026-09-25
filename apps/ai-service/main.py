"""
@file main.py
@description Zipgrid AI/Voice Service — FastAPI entry point.
LangChain agent orchestration, Whisper STT, GPT-4o intent parsing,
Pinecone RAG for knowledge base, and structured response routing.

Deployed as a persistent Railway service on eu-west Amsterdam.
Exposes REST endpoints consumed by apps/web API routes.

@module apps/ai-service
@version 0.1.0
@since 2026-09-25
@author Zipgrid Engineering
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Zipgrid AI/Voice Service",
    version="0.1.0",
    description="LangChain agent layer, voice intent parsing, RAG knowledge base",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://zipgrid.co.uk",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint — used by Railway and the web app health-check script."""
    return {"status": "ok", "service": "ai-service", "version": "0.1.0"}
